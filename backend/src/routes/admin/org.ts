/**
 * Panorama general y estructura organizativa: dashboard, unidades, admins de
 * dominio y el listado de dominios existentes.
 * Parte de la partición de admin.ts (SCRUM-13) — ver admin/index.ts.
 */
import crypto from "crypto";
import express, { Request, Response } from "express";
import { getDbClient, isUniqueViolation, withTransaction } from "../../db/index.js";
import { hashPassword } from "../../utils/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { isSuperAdmin, getAdminDomain, isSubDomain } from "./shared.js";

const router = express.Router();
const db = getDbClient();

/**
 * @route GET /admin/dashboard
 */
router.get("/dashboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);
    const domainFilter = isSuper ? null : adminDomain;

    const dw = domainFilter
      ? "AND (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)"
      : "";
    const dp = domainFilter ? [domainFilter, domainFilter] : [];

    const totalUsers = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM users u WHERE 1=1 ${dw}`, dp
    );
    const pendingRequests = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM registration_requests rr WHERE status = 'pending'
       ${domainFilter ? "AND rr.email LIKE '%@' || ?" : ""}`,
      domainFilter ? [domainFilter] : []
    );
    const totalElections = await db.get<{ count: number }>(
      isSuper
        ? "SELECT COUNT(*) as count FROM elections"
        : `SELECT COUNT(DISTINCT e.id) as count FROM elections e
           JOIN election_access ea ON e.id = ea.election_id
           WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?)`,
      isSuper ? [] : [adminDomain!, adminDomain!]
    );
    // El epoch se calcula en JS y se pasa como parámetro: `strftime('%s','now')`
    // no existe en PostgreSQL, y `EXTRACT(EPOCH FROM NOW())` no existe en SQLite.
    // start_time y end_time son BIGINT (epoch en segundos) en los dos motores.
    const nowEpoch = Math.floor(Date.now() / 1000);
    const activeElections = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM elections WHERE is_active = TRUE
       AND start_time <= ? AND end_time >= ?`,
      [nowEpoch, nowEpoch]
    );
    const totalVotes = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id WHERE 1=1
       ${domainFilter ? "AND (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)" : ""}`,
      domainFilter ? [domainFilter, domainFilter] : []
    );

    const recentVotes = await db.run<any>(
      `SELECT na.generated_at, u.email, e.name as election_name
       FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id
       JOIN elections e ON na.election_id = e.id
       ${domainFilter ? "WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)" : ""}
       ORDER BY na.generated_at DESC LIMIT 5`,
      domainFilter ? [domainFilter, domainFilter] : []
    );

    const electionParticipation = await db.run<any>(
      `SELECT e.id, e.name,
         COUNT(DISTINCT ev.user_id) as total_voters,
         COUNT(DISTINCT na.user_id) as votes_cast,
         ROUND(COUNT(DISTINCT na.user_id) * 100.0 / NULLIF(COUNT(DISTINCT ev.user_id),0), 1) as rate
       FROM elections e
       LEFT JOIN election_voters ev ON e.id = ev.election_id
       LEFT JOIN nullifier_audit na ON e.id = na.election_id
       WHERE e.is_active = TRUE
       GROUP BY e.id ORDER BY e.created_at DESC LIMIT 5`
    );

    // El corte se calcula en JS: `date('now', '-7 days')` es la forma de dos
    // argumentos de SQLite y no existe en PostgreSQL.
    //
    // El formato 'YYYY-MM-DD HH:MM:SS' es el que vale en los dos motores: en
    // SQLite created_at es TEXT y la comparación es lexicográfica (correcta
    // porque el formato está zero-padded y ordena bien), y PostgreSQL lo
    // interpreta como timestamp. Un ISO-8601 con la 'T' rompería la comparación
    // en SQLite sin dar ningún error.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    // `date(x)` sí existe en ambos motores, así que el truncado a día se queda en SQL.
    const requestsTrend = await db.run<any>(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM registration_requests
       WHERE created_at >= ?
       GROUP BY date(created_at) ORDER BY day ASC`,
      [sevenDaysAgo]
    );

    res.json({
      stats: {
        totalUsers: totalUsers?.count || 0,
        pendingRequests: pendingRequests?.count || 0,
        totalElections: totalElections?.count || 0,
        activeElections: activeElections?.count || 0,
        totalVotes: totalVotes?.count || 0,
      },
      recentVotes: recentVotes || [],
      electionParticipation: electionParticipation || [],
      requestsTrend: requestsTrend || [],
    });
  } catch (error) {
    console.error("Error in dashboard:", error);
    res.status(500).json({ error: "Error al cargar las estadísticas del panel" });
  }
});

/**
 * @route GET /admin/org-units
 */
router.get("/org-units", requireAdmin, async (req: Request, res: Response) => {
  try {
    let units;
    if (isSuperAdmin(req)) {
      units = await db.run<any>(
        "SELECT * FROM org_units ORDER BY institution_domain, unit_type, name"
      );
    } else {
      const adminDomain = getAdminDomain(req);
      units = await db.run<any>(
        `SELECT * FROM org_units
         WHERE institution_domain = ? OR domain = ? OR domain LIKE ?
         ORDER BY unit_type, name`,
        [adminDomain, adminDomain, '%.' + adminDomain]
      );
    }
    res.json({ units: units || [] });
  } catch (error) {
    console.error("Error getting org units:", error);
    res.status(500).json({ error: "Error al obtener las unidades organizativas" });
  }
});

/**
 * @route POST /admin/org-units
 */
router.post("/org-units", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, domain, parent_domain, unit_type } = req.body;

    if (!name || !domain || !unit_type) {
      res.status(400).json({ error: "Nombre, dominio y tipo de unidad son obligatorios" });
      return;
    }

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain || !isSubDomain(domain, adminDomain)) {
        res.status(403).json({ error: "Solo puedes crear unidades organizativas dentro de tu dominio" });
        return;
      }
    }

    const adminDomain = getAdminDomain(req);
    const parentUnit = parent_domain
      ? await db.get<{ institution_domain: string }>(
          'SELECT institution_domain FROM org_units WHERE domain = ?', [parent_domain]
        )
      : null;
    const institution_domain = parentUnit?.institution_domain || adminDomain || domain;

    const result = await db.exec(
      "INSERT INTO org_units (name, domain, parent_domain, unit_type, institution_domain) VALUES (?, ?, ?, ?, ?)",
      [name, domain, parent_domain || null, unit_type, institution_domain]
    );

    res.json({ success: true, id: result.lastID, message: `Unidad organizativa "${name}" creada` });
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Ese dominio ya existe entre las unidades organizativas" });
    } else {
      console.error("Error creating org unit:", error);
      res.status(500).json({ error: "Error al crear la unidad organizativa" });
    }
  }
});

/**
 * @route POST /admin/domain-admins
 */
router.post("/domain-admins", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ error: "Solo el superadministrador puede crear administradores de dominio" });
      return;
    }

    const { email, password, name, student_id, admin_domain } = req.body;

    if (!email || !password || !name || !student_id || !admin_domain) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password", "name", "student_id", "admin_domain"],
      });
      return;
    }

    const emailDomain = email.split("@")[1];
    if (emailDomain !== admin_domain) {
      res.status(400).json({
        error: `El email del administrador debe pertenecer al dominio que va a gestionar (@${admin_domain})`,
      });
      return;
    }

    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain,
                         is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, 'admin', ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE)`,
      [email, passwordHash, name, student_id, admin_domain, req.user!.userId]
    );

    res.json({
      success: true,
      userId: result.lastID,
      message: `Administrador de dominio @${admin_domain} creado correctamente`,
    });
  } catch (error) {
    console.error("Error creando admin de dominio:", error);
    res.status(500).json({ error: "Error al crear administrador de dominio" });
  }
});

/**
 * @route GET /admin/domain-admins
 */
router.get("/domain-admins", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ error: "Solo el superadministrador puede ver los administradores de dominio" });
      return;
    }

    const admins = await db.run<any>(
      `SELECT id, email, name, student_id, admin_domain, is_approved, approved_at, created_at
       FROM users WHERE role = 'admin' ORDER BY admin_domain, created_at DESC`
    );

    res.json({ admins: admins || [] });
  } catch (error) {
    console.error("Error listando admins de dominio:", error);
    res.status(500).json({ error: "Error al listar administradores de dominio" });
  }
});

/**
 * @route GET /admin/domains
 */
router.get("/domains", requireAdmin, async (req: Request, res: Response) => {
  try {
    let domains: string[] = [];

    if (isSuperAdmin(req)) {
      // El dominio se extrae en JS, no en SQL: `instr` no existe en PostgreSQL y
      // `split_part` no existe en SQLite. El resultado ya se deduplicaba en un Set
      // aquí abajo, así que traer los emails distintos no cambia el resultado.
      const userEmails = await db.run<{ email: string }>(
        "SELECT DISTINCT email FROM users WHERE email LIKE '%@%'"
      );
      const accessDomains = await db.run<{ domain: string }>(
        "SELECT DISTINCT email_domain as domain FROM election_access WHERE email_domain != '*' ORDER BY email_domain"
      );
      const allDomains = new Set<string>([
        ...userEmails.map((u) => u.email.split('@')[1]).filter(Boolean),
        ...accessDomains.map((d: any) => d.domain),
      ]);
      domains = Array.from(allDomains).filter(Boolean).sort();
    } else {
      const adminDomain = getAdminDomain(req);
      if (adminDomain) domains = [adminDomain];
    }

    res.json({ domains });
  } catch (error) {
    console.error("Error obteniendo dominios:", error);
    res.status(500).json({ error: "Error al obtener dominios" });
  }
});

/**
 * Columnas de `registration_requests` que pueden salir al cliente.
 *
 * Antes era `SELECT *`. El genérico de `db.run<T>()` NO filtra: es una
 * anotación de TypeScript, se borra al compilar, y el cliente de base de datos
 * devuelve la fila entera (`return res.rows as T[]`). Así que la respuesta
 * llevaba `password_hash` — el hash bcrypt de la contraseña que la persona
 * eligió al registrarse — a cualquier administrador autenticado. Un hash fuera
 * del servidor se ataca sin límite de intentos y sin rate limiting.
 *
 * Fuera quedan también `approved_password`, que solo existe en el esquema de
 * SQLite, y `updated_at`, que solo existe en el de PostgreSQL: la lista es la
 * intersección de ambos, o el mismo código fallaría en uno de los dos motores.
 *
 * Es interpolación en SQL, pero de una constante de código, nunca de entrada
 * del usuario — el mismo patrón que `CLEAR_BODIES` en services/email/queue.ts.
 */
const REQUEST_PUBLIC_COLUMNS = `id, full_name, email, student_id, status,
         rejection_reason, org_unit, school, degree, year, study_group,
         created_at, reviewed_at`;

/**
 * @route GET /admin/registration-requests
 */
router.get("/registration-requests", requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);

    let query = `SELECT ${REQUEST_PUBLIC_COLUMNS} FROM registration_requests`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (status !== 'all') {
      conditions.push("status = ?");
      params.push(status);
    }

    if (!isSuper && adminDomain) {
      conditions.push("(email LIKE '%@' || ? OR email LIKE '%@%.' || ?)");
      params.push(adminDomain, adminDomain);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // S12 fix: paginación en SQL (LIMIT/OFFSET) en lugar de traer todos los
    // registros a memoria y hacer slice() en JS.
    // Nota: `query` ya tiene el WHERE de las conditions de arriba.
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = 20;
    const offset   = (page - 1) * pageSize;

    // Total: misma condición WHERE pero COUNT(*)
    const baseTable  = 'registration_requests';
    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countRow = await db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM ${baseTable}${whereClause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    // Datos paginados (query ya tiene el WHERE; solo añadimos ORDER BY + LIMIT)
    const paginatedQuery = query + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    // El tipo describe lo que devuelve la consulta, no lo recorta: quien decide
    // qué sale es REQUEST_PUBLIC_COLUMNS. El que había aquí ni siquiera
    // coincidía con la tabla — declaraba `name` e `institution`, que no son
    // columnas de registration_requests (son full_name y org_unit).
    const paginatedRequests = await db.run<{
      id: number; full_name: string; email: string; student_id: string;
      status: string; rejection_reason: string | null;
      org_unit: string | null; school: string | null; degree: string | null;
      year: number | null; study_group: string | null;
      created_at: string; reviewed_at: string | null;
    }>(paginatedQuery, [...params, pageSize, offset]);

    res.json({
      requests: paginatedRequests,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error obteniendo solicitudes:", error);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
});

/**
 * @route PATCH /admin/registration-requests/:id
 */
router.patch("/registration-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: "Acción inválida. Use 'approve' o 'reject'" });
      return;
    }

    const request = await db.get<{
      id: number;
      full_name: string;
      email: string;
      student_id: string;
      status: string;
      password_hash: string | null;
      org_unit: string | null;
      school: string | null;
      degree: string | null;
      year: number | null;
      study_group: string | null;
    }>(
      "SELECT * FROM registration_requests WHERE id = ?",
      [id]
    );

    if (!request) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }

    if (action === 'approve') {
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && !isSubDomain(requestDomain, adminDomain)) {
          res.status(403).json({ error: "Solo puedes gestionar solicitudes de tu propio dominio" });
          return;
        }
      }

      let passwordHash = request.password_hash;
      let tempPassword: string | null = null;

      if (!passwordHash) {
        tempPassword = crypto.randomBytes(12).toString('base64url');
        passwordHash = await hashPassword(tempPassword);
      }

      const orgUnit = request.org_unit || null;
      const { school, degree, year, study_group } = request;

      // Aprobar es: crear la cuenta, marcar la solicitud como aprobada y meter a
      // la persona en sus censos. Suelto, el estado intermedio más feo era la
      // solicitud marcada 'approved' con el usuario sin crear: desaparece de la
      // bandeja del administrador y la persona no tiene cuenta, sin rastro.
      const domain = request.email.split('@')[1];

      await withTransaction(async (tx) => {
        const insertResult = await tx.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, org_unit,
                             school, degree, year, study_group,
                             is_approved, approved_by, approved_at, is_eligible, must_change_password, created_at)
           VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE, ?, CURRENT_TIMESTAMP)`,
          [request.email, passwordHash, request.full_name, request.student_id, orgUnit,
           school || null, degree || null, year || null, study_group || null, req.user!.userId,
           tempPassword !== null]
        );

        const newUserId = insertResult.lastID;

        await tx.exec(
          "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [id]
        );

        if (domain) {
          const elections = await tx.run<{ election_id: number }>(
            "SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = '*'",
            [domain]
          );
          for (const election of elections) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [election.election_id, newUserId]
            );
          }
        }

        // Also auto-assign to elections targeting user's org_unit
        if (orgUnit) {
          const targetedElections = await tx.run<{ election_id: number }>(
            `SELECT DISTINCT election_id FROM election_targets
             WHERE target_value = ? OR target_value = '*'`,
            [orgUnit]
          );
          for (const election of targetedElections) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [election.election_id, newUserId]
            );
          }
        }
      });

      res.json({
        message: tempPassword
          ? "User approved with temporary password"
          : "User approved. They can now log in with the password they chose during registration.",
        tempPassword,
      });

    } else if (action === 'reject') {
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && !isSubDomain(requestDomain, adminDomain)) {
          res.status(403).json({ error: "No tienes permisos para gestionar solicitudes de otro dominio" });
          return;
        }
      }

      if (!reason?.trim()) {
        res.status(400).json({ error: "El motivo de rechazo es obligatorio" });
        return;
      }

      await db.exec(
        "UPDATE registration_requests SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [reason, id]
      );

      res.json({ message: "Solicitud rechazada" });
    }

  } catch (error) {
    console.error("Error procesando solicitud:", error);
    res.status(500).json({ error: "Error al procesar solicitud" });
  }
});

export default router;
