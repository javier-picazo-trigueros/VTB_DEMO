/**
 * Ciclo de vida de una elección: crear, editar, imagen, censo por dominio,
 * altas sueltas de votante y candidatos.
 * Parte de la partición de admin.ts (SCRUM-13) — ver admin/index.ts.
 */
import express, { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { getDbClient, isUniqueViolation, withTransaction, type DbClient } from "../../db/index.js";
import { requireAdmin } from "../../middleware/auth.js";
import { formatError } from "../../utils/errors.js";
import { syncElectionsToBlockchain, isChainConfigured } from "../../scripts/syncElections.js";
import { upload, isSuperAdmin, getAdminDomain, denyIfElectionOutOfScope } from "./shared.js";

const router = express.Router();
const db = getDbClient();

const createElectionSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(2000).optional(),
  start_time:         z.number().int().positive(),
  end_time:           z.number().int().positive(),
  banner_color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  target_type:        z.enum(['all', 'domain', 'school', 'degree', 'year', 'group']).optional(),
  target_values:      z.array(z.string().min(1).max(253)).max(100).optional(),
  target_schools:     z.array(z.string().min(1).max(200)).max(100).optional(),
  target_degrees:     z.array(z.string().min(1).max(200)).max(100).optional(),
  target_description: z.string().max(500).optional(),
  voter_role:         z.enum(['student', 'voter', 'teacher', 'staff', 'admin', 'both']).optional(),
  // Los candidatos llegan con la elección y se guardan en la misma transacción.
  candidates:         z.array(z.object({
    name:        z.string().trim().min(1, 'Cada candidato necesita un nombre').max(200),
    description: z.string().trim().max(2000).optional(),
  })).max(64, 'El número máximo de candidatos permitidos es 64').optional(),
}).refine(d => d.end_time > d.start_time, {
  message: 'end_time debe ser posterior a start_time',
  path: ['end_time'],
});

/**
 * Auto-assign all approved users with a given domain to an election.
 *
 * `client` existe para poder llamar a este helper desde dentro de una
 * transacción. Si usara el `db` del módulo, sus INSERT irían por otra conexión
 * del pool en PostgreSQL y quedarían fuera del BEGIN: un ROLLBACK del bloque que
 * lo invoca no los desharía.
 */
async function autoAssignUsersByDomain(
  electionId: number,
  domain: string,
  client: DbClient = db,
): Promise<void> {
  const users = await client.run<{ id: number }>(
    "SELECT id FROM users WHERE email LIKE '%@' || ? AND is_approved = TRUE AND role IN ('student','voter')",
    [domain]
  );
  for (const user of users) {
    await client.exec(
      "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
      [electionId, user.id]
    );
  }
}

/**
 * @route GET /admin/elections
 */
router.get("/elections", requireAdmin, async (req: Request, res: Response) => {
  try {
    let elections;
    if (isSuperAdmin(req)) {
      elections = await db.run<any>(
        "SELECT * FROM elections ORDER BY created_at DESC"
      );
    } else {
      const adminDomain = getAdminDomain(req);
      elections = await db.run<any>(
        "SELECT DISTINCT e.* FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?) ORDER BY e.created_at DESC",
        [adminDomain, adminDomain]
      );
    }

    const electionList = elections || [];
    for (const election of electionList) {
      const domains = await db.run<any>(
        "SELECT email_domain FROM election_access WHERE election_id = ?",
        [election.id]
      );
      election.domains = domains.map((d: any) => d.email_domain);

      const candidates = await db.run<any>(
        "SELECT id, name FROM candidates WHERE election_id = ? ORDER BY position ASC",
        [election.id]
      );
      election.candidates = candidates;

      const targets = await db.run<any>(
        "SELECT target_type, target_value FROM election_targets WHERE election_id = ?",
        [election.id]
      );
      election.targets = targets || [];
    }

    res.json({ elections: electionList });
  } catch (error) {
    console.error("Error listando elecciones:", error);
    res.status(500).json({ error: "Error al listar elecciones" });
  }
});

/**
 * @route POST /admin/elections
 */
router.post("/elections", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createElectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const {
      name, description, start_time, end_time,
      banner_color,
      target_type        = 'all',
      target_values      = [] as string[],
      target_schools     = [] as string[],
      target_degrees     = [] as string[],
      target_description,
      voter_role         = 'student',
      candidates         = [],
    } = parsed.data;

    const adminDomain = getAdminDomain(req);

    // Build targets array
    const targets: { type: string; value: string }[] =
      target_type === 'all'
        ? [{ type: 'all', value: adminDomain || '*' }]
        : (target_values as string[]).map((v: string) => ({ type: target_type, value: v }));

    // ── Toda la parte de base de datos, en una transacción ──────────────────
    //
    // Crear la elección, sus targets, su acceso por dominio y su censo es una
    // sola cosa desde el punto de vista del administrador. Suelto, un fallo a
    // mitad dejaba la elección creada y visible pero con el censo incompleto:
    // gente que debería poder votar y no puede, sin ningún aviso.
    //
    // Los `.catch(() => {})` que llevaba cada INSERT se han quitado a propósito.
    // Dentro de una transacción de PostgreSQL, tragarse un error no sirve de
    // nada: tras el primer fallo la transacción queda abortada y toda consulta
    // posterior devuelve "current transaction is aborted". Es mejor que el error
    // suba y revierta el bloque entero.
    const electionId = await withTransaction(async (tx) => {
      // election_id_blockchain = 0 mientras está 'pending': los ids del contrato
      // empiezan en 1, así que 0 nunca apunta a una elección real. El definitivo
      // lo escribe la sincronización con el id del evento ElectionCreated.
      const ephemeralSalt = crypto.randomBytes(32).toString('hex');
      const inserted = await tx.exec(
        `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active,
                                banner_color, target_type, target_description, voter_role, chain_status, ephemeral_salt)
         VALUES (0, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, 'pending', ?)`,
        [name, description, start_time, end_time,
         banner_color || '#1E3A5F', target_type, target_description || null, voter_role, ephemeralSalt]
      );
      const newId = inserted.lastID;

      // Los candidatos, en la misma transacción. Antes el frontend los añadía uno
      // a uno DESPUÉS de la respuesta: si esta no llegaba (el navegador corta a los
      // 15 s y la espera a Sepolia tardaba más), la elección quedaba sin ellos.
      for (const [position, candidate] of candidates.entries()) {
        await tx.exec(
          'INSERT INTO candidates (election_id, name, description, position) VALUES (?, ?, ?, ?)',
          [newId, candidate.name, candidate.description ?? '', position]
        );
      }

      // Insert election_targets and maintain election_access for backward compat
      for (const target of targets) {
        await tx.exec(
          'INSERT OR IGNORE INTO election_targets (election_id, target_type, target_value) VALUES (?, ?, ?)',
          [newId, target.type, target.value]
        );
        await tx.exec(
          'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
          [newId, target.value]
        );
      }

      // Build student/voter census (skip when voter_role === 'admin')
      if (voter_role === 'student' || voter_role === 'both') {
        if (target_type === 'all' || targets.some(t => t.value === '*')) {
          if (adminDomain) {
            await autoAssignUsersByDomain(newId, adminDomain, tx);
          }
        } else {
          for (const target of targets) {
            const targetConditions = ["(u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ? OR u.org_unit = ?)"];
            const targetParams: any[] = [target.value, target.value, target.value];
            if (adminDomain) {
              targetConditions.push("(u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)");
              targetParams.push(adminDomain, adminDomain);
            }
            const targetUsers = await tx.run<{ id: number }>(
              `SELECT DISTINCT u.id FROM users u
               WHERE ${targetConditions.join(' AND ')}
                 AND u.is_approved = TRUE AND u.role IN ('student','voter')`,
              targetParams
            );
            for (const user of targetUsers) {
              await tx.exec(
                'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
                [newId, user.id]
              );
            }
          }
        }
      }

      // Build census by school/degree attributes
      if ((target_schools as string[]).length > 0 || (target_degrees as string[]).length > 0) {
        const conditions: string[] = [];
        const params2: any[] = [];
        if ((target_schools as string[]).length > 0) {
          conditions.push(`school IN (${(target_schools as string[]).map(() => '?').join(',')})`);
          params2.push(...(target_schools as string[]));
        }
        if ((target_degrees as string[]).length > 0) {
          conditions.push(`degree IN (${(target_degrees as string[]).map(() => '?').join(',')})`);
          params2.push(...(target_degrees as string[]));
        }
        let domainClause = '';
        if (adminDomain) {
          domainClause = " AND (email LIKE '%@' || ? OR email LIKE '%@%.' || ?)";
          params2.push(adminDomain, adminDomain);
        }
        const targetUsers = await tx.run<{ id: number }>(
          `SELECT id FROM users WHERE (${conditions.join(' OR ')}) AND is_approved = TRUE${domainClause}`,
          params2
        );
        for (const user of targetUsers) {
          await tx.exec(
            'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
            [newId, user.id]
          );
        }
      }

      // Build admin census
      if (voter_role === 'admin' || voter_role === 'both') {
        if (adminDomain) {
          const subAdmins = await tx.run<{ id: number }>(
            `SELECT id FROM users
             WHERE role IN ('admin', 'superadmin')
               AND (admin_domain = ? OR admin_domain LIKE ?)
               AND is_approved = TRUE`,
            [adminDomain, '%.' + adminDomain]
          );
          for (const user of subAdmins) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [newId, user.id]
            );
          }
          // Also add the creating admin themselves
          await tx.exec(
            'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
            [newId, req.user!.userId]
          );
        }
      }

      // Legacy: ensure election_access entry for backward compat
      if (adminDomain && (target_type === 'all' || voter_role === 'admin')) {
        await tx.exec(
          'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
          [newId, adminDomain]
        );
      }

      return newId;
    });

    // ── Registro en la cadena: en segundo plano, sin esperarlo ──────────────
    //
    // Antes se enviaba createElection aquí y se esperaba el recibo (12-40 s en
    // Sepolia) antes de responder. El navegador corta a los 15 s, así que a menudo
    // el administrador veía "No se ha podido crear la elección" con la elección ya
    // creada. Ahora la elección queda 'pending' y la registra la sincronización
    // (scripts/syncElections.ts): se lanza ya, sin esperarla, y el job periódico de
    // index.ts la reintenta si falla. El panel muestra el estado.
    const chainConfigured = isChainConfigured();
    if (chainConfigured) {
      void syncElectionsToBlockchain().catch((err) =>
        console.error("[chain-sync] error tras crear la elección:", formatError(err)),
      );
    }

    res.json({
      success: true,
      electionId,
      chainStatus: 'pending',
      chainConfigured,
      candidates: candidates.length,
      message: `Elección "${name}" creada exitosamente`,
    });
  } catch (error) {
    console.error("Error creando elección:", formatError(error));
    res.status(500).json({ error: "Error al crear elección" });
  }
});

/**
 * @route PUT /admin/elections/:id
 */
router.put("/elections/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const { is_active, banner_color, target_type, target_description } = req.body;

    const sets: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];

    if (is_active !== undefined) { sets.push("is_active = ?"); params.push(Boolean(is_active)); }
    if (banner_color !== undefined) { sets.push("banner_color = ?"); params.push(banner_color); }
    if (target_type !== undefined) { sets.push("target_type = ?"); params.push(target_type); }
    if (target_description !== undefined) { sets.push("target_description = ?"); params.push(target_description); }

    params.push(id);
    await db.exec(`UPDATE elections SET ${sets.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: "Elección actualizada" });
  } catch (error) {
    console.error("Error actualizando elección:", error);
    res.status(500).json({ error: "Error al actualizar elección" });
  }
});

/**
 * @route PATCH /admin/elections/:id
 * @desc Edit election name, description, end_time
 */
router.patch("/elections/:id", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, end_time } = req.body;
  try {
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const election = await db.get<{
      id: number;
      name: string;
      description: string;
      end_time: number;
      chain_status: string;
      chain_tx_hash: string | null;
    }>("SELECT id, name, description, end_time, chain_status, chain_tx_hash FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const isFrozen =
      election.chain_status === 'synced' ||
      election.chain_status === 'syncing' ||
      (election.chain_status === 'pending' && Boolean(election.chain_tx_hash));

    if (end_time !== undefined && end_time !== null && Number(end_time) !== Number(election.end_time)) {
      if (isFrozen) {
        res.status(409).json({
          error: "No se puede modificar la fecha de finalización porque la elección ya está sincronizada o en proceso de sincronización en blockchain",
          details: "El plazo de finalización quedó fijado o enviado al contrato en blockchain. Para modificarlo hay que convocar una nueva elección.",
          code: "ELECTION_ALREADY_ON_CHAIN",
        });
        return;
      }
    }

    await db.exec(
      `UPDATE elections SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        end_time = COALESCE(?, end_time),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || null, description || null, end_time || null, id]
    );
    res.json({ success: true, message: "Elección actualizada" });
  } catch (err) {
    // Antes: res.status(500).json({ error: err.message }) — err.message crudo
    // al cliente (SCRUM-13, saneado de paso al mover este fichero).
    console.error("Error editando elección:", formatError(err));
    res.status(500).json({ error: "Error al editar la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/image
 */
router.post("/elections/:id/image", requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    if (!req.file) {
      res.status(400).json({ error: "No se ha adjuntado ninguna imagen" });
      return;
    }

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const imageUrl = `data:${mimeType};base64,${base64}`;

    await db.exec("UPDATE elections SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [imageUrl, id]);

    res.json({ success: true, message: 'Imagen subida correctamente' });
  } catch (error) {
    console.error("Error uploading election image:", error);
    res.status(500).json({ error: "Error al subir la imagen" });
  }
});

/**
 * @route POST /admin/elections/:id/domains
 */
router.post("/elections/:id/domains", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const { domain } = req.body;

    if (!domain?.trim()) {
      res.status(400).json({ error: "El dominio es obligatorio" });
      return;
    }

    const election = await db.get("SELECT id FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    try {
      await db.exec(
        "INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)",
        [id, domain.trim()]
      );
      if (domain.trim() !== '*') {
        await autoAssignUsersByDomain(parseInt(id as string), domain.trim());
      }
      res.json({ success: true, message: `Dominio ${domain} añadido correctamente` });
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ error: "Este dominio ya está permitido para esta elección" });
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error("Error añadiendo dominio:", error);
    res.status(500).json({ error: "Error al añadir el dominio a la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/voters
 */
router.post("/elections/:id/voters", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const { email } = req.body;

    if (!email?.trim()) {
      res.status(400).json({ error: "El email del usuario es obligatorio" });
      return;
    }

    const election = await db.get<{ id: number; start_time: number }>(
      "SELECT id, start_time FROM elections WHERE id = ?",
      [id],
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= Number(election.start_time)) {
      res.status(409).json({
        error: "El censo de la elección está congelado porque la votación ya ha comenzado",
        details: "No se pueden añadir votantes una vez abierta la votación.",
        code: "CENSUS_FROZEN",
      });
      return;
    }

    const user = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email.trim()]);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    try {
      await db.exec(
        "INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)",
        [id, user.id]
      );
      res.json({ success: true, message: `Usuario ${email} añadido a la elección` });
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ error: "El usuario ya está asignado a esta elección" });
      } else {
        throw e;
      }
    }
  } catch (error) {
    res.status(500).json({ error: "Error al asignar el usuario a la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/candidates
 */
router.post("/elections/:id/candidates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const { name, description } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre del candidato es obligatorio" });
      return;
    }

    const election = await db.get<{ id: number; chain_status: string; chain_tx_hash: string | null }>(
      "SELECT id, chain_status, chain_tx_hash FROM elections WHERE id = ?",
      [id],
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    // Al registrar la elección en la cadena quedaron fijados candidateCount y
    // candidatesRoot. Añadir un candidato después deja el contrato diciendo que
    // hay N candidatos cuando en la base hay N+1: el voto al último revertiría
    // con "candidate out of range", y la huella de la lista publicada dejaría de
    // cuadrar con la que se comprometió al convocar.
    const isFrozen =
      election.chain_status === 'synced' ||
      election.chain_status === 'syncing' ||
      (election.chain_status === 'pending' && Boolean(election.chain_tx_hash));

    if (isFrozen) {
      res.status(409).json({
        error: "La elección ya está sincronizada o en proceso de sincronización en blockchain y su lista de candidatos no se puede ampliar",
        details: "El número de candidatos y la huella de la lista quedaron fijados o enviados al contrato. Para cambiar la lista hay que crear una elección nueva.",
        code: "ELECTION_ALREADY_ON_CHAIN",
      });
      return;
    }

    const currentCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM candidates WHERE election_id = ?",
      [id],
    );
    if ((currentCount?.count ?? 0) >= 64) {
      res.status(400).json({ error: "El número máximo de candidatos permitidos es 64" });
      return;
    }

    // La posición es el identificador del candidato en la cadena y es única por
    // elección (migración 009). Omitirla dejaba a todos en 0 y ahora chocaría
    // con la restricción; además, añadir un candidato a una elección ya
    // registrada descuadra el recuento on-chain (ver paso 4).
    const siguiente = await db.get<{ p: number }>(
      "SELECT COALESCE(MAX(position) + 1, 0) AS p FROM candidates WHERE election_id = ?",
      [id]
    );

    const result = await db.exec(
      "INSERT INTO candidates (election_id, name, description, position) VALUES (?, ?, ?, ?)",
      [id, name.trim(), description?.trim() || "", Number(siguiente?.p ?? 0)]
    );
    res.json({ success: true, candidateId: result.lastID, message: `Candidato ${name} añadido` });
  } catch (error) {
    console.error("Error añadiendo candidato:", error);
    res.status(500).json({ error: "Error al añadir candidato a la elección" });
  }
});

export default router;
