import express, { Request, Response } from "express";
import { getDbClient, isUniqueViolation, withTransaction } from "../db/index.js";
import { hashPassword, hashSecureToken } from "../utils/auth.js";
import { formatError } from "../utils/errors.js";
import { sendRegistrationVerification, sendAccountExistsNotice } from "../services/email/index.js";
import { REGISTRATION_VERIFY_TTL_HOURS } from "../services/email/tokens.js";
import { CURRENT_TERMS_VERSION } from "../config/legal.js";
import { z } from "zod";
import { emailSchema, passwordSchema, firstIssue } from "../utils/validation.js";

const router = express.Router();
const db = getDbClient();

/** Texto opcional del formulario: vacío o ausente se guarda como NULL. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "") || v == null ? null : v,
    z.string().trim().max(max).nullable(),
  );

/**
 * Esta era la única ruta pública que no usaba zod (M-3 de
 * AUDITORIA_SEGURIDAD_3.md): el email se validaba con includes("@"), la
 * contraseña con 6 caracteres y el curso con parseInt sin mirar NaN.
 * Email y contraseña salen ahora de utils/validation.ts, igual que en el
 * resto de rutas que crean o cambian contraseñas.
 */
const registrationSchema = z.object({
  fullName: z.string({ error: "El nombre completo es obligatorio" })
    .trim()
    .min(2, "El nombre completo es obligatorio")
    .max(120, "El nombre es demasiado largo"),
  email: emailSchema,
  studentId: z.string({ error: "El identificador es obligatorio" })
    .trim()
    .min(1, "El identificador es obligatorio")
    .max(50, "El identificador es demasiado largo"),
  password: passwordSchema,
  orgUnit: optionalText(120),
  school: optionalText(120),
  degree: optionalText(120),
  study_group: optionalText(50),
  // Curso académico: 1..10 o nada. Antes parseInt("abc") llegaba como NaN.
  year: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number({ error: "El curso no es válido" }).int("El curso no es válido").min(1, "El curso no es válido").max(10, "El curso no es válido").nullable(),
  ),
  // Casilla de aceptación de términos y privacidad: obligatoria, sin marcar
  // por defecto en el formulario. No basta con validarlo en el cliente —
  // sin esto aquí, una petición hecha a mano se saltaría el requisito entero.
  acceptedTerms: z.literal(true, {
    error: "Debes aceptar los Términos y Condiciones y la Política de Privacidad para registrarte",
  }),
});

/**
 * Lo único que responde el registro, pase lo que pase detrás (SCRUM-123).
 *
 * Antes había cuatro respuestas distinguibles — "ya tienes cuenta" (409), "ya
 * tienes solicitud" (409), "aprobada automáticamente" (201) y "enviada" (200)
 * — y cualquiera podía averiguar qué emails estaban dados de alta o en el
 * censo (M-3 de AUDITORIA_SEGURIDAD_3.md). La diferencia la ve ahora solo
 * quien lee ese buzón: le llega el enlace, un aviso de que ya tiene cuenta, o
 * nada.
 */
const GENERIC_MESSAGE =
  "Si los datos son correctos, te hemos enviado un correo para confirmar tu dirección. " +
  `Abre el enlace en las próximas ${REGISTRATION_VERIFY_TTL_HOURS} horas para completar el registro.`;

/** SQLite devuelve 'YYYY-MM-DD HH:MM:SS' en UTC; PostgreSQL, un Date. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

/**
 * @route POST /registration/request
 * @desc  Registro público. No crea ni aprueba ninguna cuenta: guarda la
 *        solicitud sin confirmar y manda un enlace a ese email (SCRUM-123).
 *
 * Antes, si el email estaba en la lista blanca del censo, la cuenta se creaba
 * aprobada en el acto con la contraseña de quien rellenara el formulario, sin
 * comprobar que el correo fuera suyo. A los 30 días de anonimizar una baja,
 * cualquiera podía registrar ese email y ocupar su sitio en el censo.
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    // El formulario manda camelCase y algunos clientes antiguos snake_case: se
    // aceptan los dos nombres, pero todo pasa por el mismo esquema.
    const parsed = registrationSchema.safeParse({
      fullName:     req.body.fullName ?? req.body.name,
      email:        req.body.email,
      studentId:    req.body.studentId ?? req.body.student_id,
      password:     req.body.password,
      orgUnit:      req.body.orgUnit ?? req.body.org_unit,
      school:       req.body.school,
      degree:       req.body.degree,
      year:         req.body.year,
      study_group:  req.body.study_group,
      acceptedTerms: req.body.acceptedTerms,
    });
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    const {
      fullName, email, studentId, password, orgUnit, school, degree, year, study_group,
    } = parsed.data;

    // Se calcula siempre, se vaya a usar o no. Si el caso "ya tienes cuenta"
    // respondiera en 5 ms y el caso nuevo en 200 ms (lo que tarda bcrypt), el
    // tiempo de respuesta volvería a decir lo que el mensaje ya no dice.
    const passwordHash = await hashPassword(password);

    const existingUser = await db.get<{ id: number; deleted_at: string | Date | null }>(
      "SELECT id, deleted_at FROM users WHERE email = ?",
      [email]
    );
    if (existingUser) {
      // Una cuenta dada de baja todavía sin anonimizar no recibe nada: no hay a
      // quién recordarle una contraseña que ya no sirve.
      if (!existingUser.deleted_at) sendAccountExistsNotice(email);
      res.json({ message: GENERIC_MESSAGE });
      return;
    }

    // registration_requests.email es UNIQUE: como mucho hay una solicitud por
    // email. Bloquean una nueva la que espera al administrador ('pending') y la
    // que espera a que se abra su enlace ('unverified') mientras está vigente.
    //
    // Que la vigente no se sustituya es a propósito: si se sustituyera, un
    // tercero podría meter su contraseña en la solicitud de otra persona justo
    // antes de que esta abra el enlace — el correo que le llega es suyo, pero
    // la contraseña sería la del tercero. Quien pierda el correo espera a que
    // caduque, como mucho REGISTRATION_VERIFY_TTL_HOURS.
    //
    // Se sustituyen: una rechazada (antes daba 500 por el UNIQUE durante los 30
    // días que se conserva), una sin confirmar caducada, y una aprobada cuya
    // cuenta ya no existe con ese email.
    const existing = await db.get<{ id: number; status: string; created_at: string | Date }>(
      "SELECT id, status, created_at FROM registration_requests WHERE email = ?",
      [email]
    );
    if (existing) {
      const createdAt = toDate(existing.created_at);
      const stale = !createdAt || Date.now() - createdAt.getTime() > REGISTRATION_VERIFY_TTL_HOURS * 3600 * 1000;
      if (existing.status === "pending" || (existing.status === "unverified" && !stale)) {
        res.json({ message: GENERIC_MESSAGE });
        return;
      }
    }

    let requestId: number;
    try {
      requestId = await withTransaction(async (tx) => {
        if (existing) {
          await tx.exec("DELETE FROM registration_requests WHERE id = ? AND status = ?", [existing.id, existing.status]);
        }
        const inserted = await tx.exec(
          `INSERT INTO registration_requests (full_name, email, student_id, org_unit, school, degree, year, study_group, password_hash, terms_version, terms_accepted_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'unverified', CURRENT_TIMESTAMP)`,
          [fullName, email, studentId, orgUnit, school, degree, year, study_group, passwordHash, CURRENT_TERMS_VERSION]
        );
        return inserted.lastID;
      });
    } catch (insertErr: any) {
      // Otra petición con el mismo email ha ganado la carrera: la suya manda.
      if (isUniqueViolation(insertErr)) {
        res.json({ message: GENERIC_MESSAGE });
        return;
      }
      throw insertErr;
    }

    sendRegistrationVerification({ to: email, requestId, name: fullName });
    res.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Error in registration request:", formatError(error));
    res.status(500).json({ error: "Error al procesar la solicitud de registro" });
  }
});

const verifySchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
});

const INVALID_LINK = "El enlace no es válido o ha caducado. Puedes volver a registrarte.";

/**
 * @route POST /registration/verify
 * @desc  Abre el enlace del correo. Solo aquí, con el email ya demostrado, se
 *        aprueba la cuenta si está en la lista blanca del censo, o se pasa la
 *        solicitud al administrador.
 * @body  { token }
 *
 * La respuesta sí dice qué ha pasado: quien llega aquí ha demostrado que lee
 * ese buzón, así que ya no hay nada que ocultarle.
 */
router.post("/verify", async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_LINK });
    return;
  }
  const hash = hashSecureToken(parsed.data.token);

  try {
    const request = await db.get<{
      id: number;
      full_name: string;
      email: string;
      student_id: string;
      password_hash: string | null;
      org_unit: string | null;
      school: string | null;
      degree: string | null;
      year: number | null;
      study_group: string | null;
      terms_version: string | null;
      terms_accepted_at: string | Date | null;
      verify_expires_at: string | Date | null;
    }>(
      `SELECT id, full_name, email, student_id, password_hash, org_unit, school, degree, year,
              study_group, terms_version, terms_accepted_at, verify_expires_at
         FROM registration_requests
        WHERE verify_token_hash = ? AND status = 'unverified'`,
      [hash]
    );
    const expiresAt = request ? toDate(request.verify_expires_at) : null;
    if (!request || !expiresAt || expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: INVALID_LINK });
      return;
    }

    const emailDomain = request.email.split("@")[1];

    let outcome: "approved" | "pending" | "invalid";
    try {
      outcome = await withTransaction(async (tx) => {
        // Quemar el token es lo primero y va condicionado al propio hash: si
        // dos peticiones abren el mismo enlace a la vez, solo una cambia la
        // fila, y la otra sale por 'invalid' sin crear nada.
        const burned = await tx.exec(
          `UPDATE registration_requests
              SET verify_token_hash = NULL, email_verified_at = CURRENT_TIMESTAMP
            WHERE id = ? AND verify_token_hash = ? AND status = 'unverified'`,
          [request.id, hash]
        );
        if (burned.changes !== 1) return "invalid";

        const whitelisted = await tx.get<{ id: number; full_name: string | null; student_id: string | null }>(
          `SELECT id, full_name, student_id FROM email_whitelist
            WHERE email = ? AND (admin_domain = ? OR admin_domain = '*') AND used = FALSE`,
          [request.email, emailDomain]
        );

        if (!whitelisted) {
          await tx.exec("UPDATE registration_requests SET status = 'pending' WHERE id = ?", [request.id]);
          return "pending";
        }

        // Alta auto-aprobada: crear la cuenta, quemar la entrada de la lista
        // blanca, marcar la solicitud y asignar sus elecciones son una sola
        // operación — suelto, cada paso dejaba un estado roto distinto.
        const inserted = await tx.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, org_unit, school, degree, year, study_group,
                             is_approved, approved_at, is_eligible, terms_version, terms_accepted_at, created_at)
           VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP, TRUE, ?, ?, CURRENT_TIMESTAMP)`,
          [request.email, request.password_hash, whitelisted.full_name || request.full_name,
           whitelisted.student_id || request.student_id, request.org_unit, request.school, request.degree,
           request.year, request.study_group, request.terms_version ?? CURRENT_TERMS_VERSION,
           request.terms_accepted_at]
        );
        const newUserId = inserted.lastID;

        await tx.exec("UPDATE email_whitelist SET used = TRUE WHERE id = ?", [whitelisted.id]);
        await tx.exec(
          "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [request.id]
        );

        const now = Math.floor(Date.now() / 1000);
        const elections = await tx.run<{ election_id: number }>(
          `SELECT ea.election_id
             FROM election_access ea
             JOIN elections e ON e.id = ea.election_id
            WHERE (ea.email_domain = ? OR ea.email_domain = '*')
              AND e.start_time > ?`,
          [emailDomain, now]
        );
        for (const elec of elections) {
          await tx.exec(
            "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
            [elec.election_id, newUserId]
          );
        }
        return "approved";
      });
    } catch (err) {
      // Entre el registro y el enlace alguien ha creado ya la cuenta (un
      // administrador, por ejemplo). La transacción se deshace entera.
      if (isUniqueViolation(err)) {
        res.status(409).json({
          error: "Ya existe una cuenta con este correo. Inicia sesión o recupera la contraseña.",
          code: "ACCOUNT_EXISTS",
        });
        return;
      }
      throw err;
    }

    if (outcome === "invalid") {
      res.status(400).json({ error: INVALID_LINK });
      return;
    }
    res.json(
      outcome === "approved"
        ? { status: "approved", message: "Correo confirmado. Tu cuenta está activa: ya puedes iniciar sesión." }
        : { status: "pending", message: "Correo confirmado. Un administrador de tu institución revisará tu solicitud." }
    );
  } catch (error) {
    console.error("Error verificando el registro:", formatError(error));
    res.status(500).json({ error: "Error al confirmar el correo" });
  }
});

export default router;
