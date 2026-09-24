import express, { Request, Response } from "express";
import { getDbClient, isUniqueViolation, withTransaction } from "../db/index.js";
import { hashPassword } from "../utils/auth.js";
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
 * @route POST /registration/request
 * @desc Public endpoint - user submits a registration request with their chosen password
 * @body { fullName, email, studentId, password }
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

    // Check email doesn't already exist in users
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existingUser) {
      res.status(409).json({ error: "Ese email ya tiene una cuenta activa" });
      return;
    }

    // Check no pending request exists for this email
    const existingRequest = await db.get<{ id: number }>(
      "SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'",
      [email]
    );
    if (existingRequest) {
      res.status(409).json({ error: "Ya tienes una solicitud de registro pendiente" });
      return;
    }

    // Check if email is whitelisted for auto-approve
    const emailDomain = email.split('@')[1];
    const whitelisted = await db.get<any>(
      `SELECT * FROM email_whitelist WHERE email = ? AND (admin_domain = ? OR admin_domain = '*') AND used = FALSE`,
      [email.toLowerCase(), emailDomain]
    );

    if (whitelisted) {
      const autoHash = await hashPassword(password);

      // Alta auto-aprobada: crear la cuenta, quemar la entrada del whitelist y
      // asignarla a sus elecciones son una sola operación.
      //
      // Suelto, esto podía dejar tres estados rotos distintos: cuenta creada con
      // el whitelist aún sin usar, cuenta creada y fuera de todos los censos, o
      // dentro de unos censos y no de otros — este último silenciosamente,
      // porque el bucle llevaba un `.catch(() => {})` que se tragaba el fallo.
      try {
        await withTransaction(async (tx) => {
          const inserted = await tx.exec(
            `INSERT INTO users (email, password_hash, name, student_id, role, org_unit, school, degree, year, study_group, is_approved, is_eligible, terms_version, terms_accepted_at, created_at)
             VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, TRUE, TRUE, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [email, autoHash, whitelisted.full_name || fullName, whitelisted.student_id || studentId, orgUnit, school, degree, year, study_group, CURRENT_TERMS_VERSION]
          );

          // El id sale del propio INSERT (RETURNING id en PostgreSQL). Antes se
          // releía con `SELECT id FROM users WHERE email = ?`, una consulta
          // aparte que puede devolver la fila de otra petición concurrente con
          // el mismo email.
          const newUserId = inserted.lastID;

          await tx.exec("UPDATE email_whitelist SET used = TRUE WHERE id = ?", [whitelisted.id]);

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
        });
      } catch (insertErr: any) {
        if (isUniqueViolation(insertErr)) {
          res.status(409).json({ error: "Ese email ya tiene una cuenta activa" });
          return;
        }
        throw insertErr;
      }

      res.status(201).json({
        message: "Tu cuenta se ha aprobado automáticamente. Ya puedes iniciar sesión con la contraseña que elegiste.",
        autoApproved: true,
      });
      return;
    }

    // Not whitelisted — normal pending flow
    const passwordHash = await hashPassword(password);

    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, org_unit, school, degree, year, study_group, password_hash, terms_version, terms_accepted_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending', CURRENT_TIMESTAMP)`,
      [fullName, email, studentId, orgUnit, school, degree, year, study_group, passwordHash, CURRENT_TERMS_VERSION]
    );

    res.json({
      message: "Solicitud de registro enviada correctamente. Un administrador la revisará en breve.",
    });
  } catch (error) {
    console.error("Error in registration request:", error);
    res.status(500).json({ error: "Error al procesar la solicitud de registro" });
  }
});

export default router;
