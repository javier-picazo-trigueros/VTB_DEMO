import express, { Request, Response } from "express";
import { getDbClient, isUniqueViolation, withTransaction } from "../db/index.js";
import { hashPassword } from "../utils/auth.js";
import { CURRENT_TERMS_VERSION } from "../config/legal.js";

const router = express.Router();
const db = getDbClient();

/**
 * @route POST /registration/request
 * @desc Public endpoint - user submits a registration request with their chosen password
 * @body { fullName, email, studentId, password }
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    const fullName = req.body.fullName || req.body.name;
    const email = req.body.email;
    const studentId = req.body.studentId || req.body.student_id;
    const password = req.body.password;
    const orgUnit: string | null = req.body.orgUnit || req.body.org_unit || null;
    const school: string | null = req.body.school || null;
    const degree: string | null = req.body.degree || null;
    const year: number | null = req.body.year ? parseInt(req.body.year) : null;
    const study_group: string | null = req.body.study_group || null;

    // Validate required fields
    if (!fullName?.trim() || !email?.trim() || !studentId?.trim() || !password?.trim()) {
      res.status(400).json({
        error: "Faltan campos obligatorios: nombre completo, email, identificador y contraseña",
      });
      return;
    }

    // Casilla de aceptación de términos y privacidad: obligatoria, sin marcar
    // por defecto en el formulario. No basta con validarlo en el cliente —
    // sin esto aquí, una petición hecha a mano se saltaría el requisito entero.
    if (req.body.acceptedTerms !== true) {
      res.status(400).json({
        error: "Debes aceptar los Términos y Condiciones y la Política de Privacidad para registrarte",
      });
      return;
    }

    // Validate email format
    if (!email.includes("@") || !email.includes(".")) {
      res.status(400).json({ error: "Formato de email no válido" });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }

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
