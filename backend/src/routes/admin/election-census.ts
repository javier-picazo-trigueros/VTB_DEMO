/**
 * Censo por elección (importación CSV), auditoría, estadísticas y avisos
 * masivos por correo.
 *
 * Separado de admin/elections.ts (que crea y edita la elección en sí) sobre
 * todo por tamaño: unido a elections.ts superaba las 600 líneas que pide
 * SCRUM-13. El corte real es "gestionar la elección" vs. "todo lo que pasa
 * una vez que ya existe" — informes, censo y notificaciones.
 */
import express, { Request, Response } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { getDbClient, withTransaction } from "../../db/index.js";
import { requireAdmin } from "../../middleware/auth.js";
import { formatError } from "../../utils/errors.js";
import { sendCensusInvitation, sendElectionOpen, sendElectionClose } from "../../services/email/index.js";
import { upload, isSuperAdmin, getAdminDomain, isSubDomain, createCensusUser, parseCSV, denyIfElectionOutOfScope } from "./shared.js";

const router = express.Router();
const db = getDbClient();

const importVotersParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id debe ser un entero positivo'),
});

const MAX_NOTIFY_BATCH = 1000; // límite por llamada para no saturar la cola

/**
 * @route POST /admin/elections/:id/import-voters
 * CSV import: add voters to an election
 */
router.post("/elections/:id/import-voters", requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const paramParsed = importVotersParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ error: paramParsed.error.issues[0]?.message ?? 'Parámetro inválido' });
      return;
    }
    const { id } = paramParsed.data;

    // Antes del fichero: esta ruta validaba el dominio de cada fila del CSV,
    // pero no el de la elección, así que un administrador podía meter a su
    // propia gente en el censo de otra institución. Se comprueba aquí para no
    // llegar siquiera a parsear el CSV de quien no es el dueño.
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    if (!req.file) {
      res.status(400).json({ error: "No se ha adjuntado ningún archivo" });
      return;
    }

    const election = await db.get<{ id: number; name: string; start_time: number }>(
      "SELECT id, name, start_time FROM elections WHERE id = ?", [id]
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= Number(election.start_time)) {
      res.status(409).json({
        error: "El censo de la elección está congelado porque la votación ya ha comenzado",
        details: "No se puede importar el censo una vez abierta la votación.",
        code: "CENSUS_FROZEN",
      });
      return;
    }

    const rows = parseCSV(req.file.buffer);

    // ── FASE 1: validar el CSV entero sin escribir nada ─────────────────────
    //
    // Antes esto era un solo bucle que validaba y escribía a la vez, fila a
    // fila. Un CSV de 800 personas que fallara en la 300 dejaba 299 cuentas
    // creadas y el censo a medias, sin forma de saber desde fuera por dónde se
    // había quedado.
    //
    // Separar la validación permite rechazar el fichero entero antes de tocar la
    // base de datos, y devolver TODOS los errores de una vez en vez del primero.
    const adminDomain = getAdminDomain(req);
    const errors: string[] = [];
    const plan: Array<{
      email: string;
      full_name: string;
      student_id: string;
      existingUserId: number | null;
    }> = [];
    const seen = new Set<string>();

    for (const [i, row] of rows.entries()) {
      const linea = i + 2; // +1 por índice base 0, +1 por la cabecera del CSV
      const email = row.email?.trim();
      const full_name = row.full_name?.trim() || row.name?.trim();
      const student_id = row.student_id?.trim();

      if (!email) {
        errors.push(`Línea ${linea}: fila sin email`);
        continue;
      }

      const normalized = email.toLowerCase();
      if (seen.has(normalized)) {
        errors.push(`Línea ${linea}: ${email} está repetido en el fichero`);
        continue;
      }
      seen.add(normalized);

      if (!isSuperAdmin(req) && adminDomain) {
        const emailDomain = email.split('@')[1];
        if (!emailDomain || !isSubDomain(emailDomain, adminDomain)) {
          errors.push(`Línea ${linea}: ${email} no pertenece al dominio @${adminDomain}`);
          continue;
        }
      }

      const existing = await db.get<{ id: number }>(
        "SELECT id FROM users WHERE email = ?", [email]
      );

      if (!existing && (!full_name || !student_id)) {
        errors.push(`Línea ${linea}: ${email} es una cuenta nueva y le falta full_name o student_id`);
        continue;
      }

      plan.push({
        email,
        full_name: full_name ?? '',
        student_id: student_id ?? '',
        existingUserId: existing?.id ?? null,
      });
    }

    // Un solo error aborta el fichero entero. Es el precio de la atomicidad: no
    // se puede prometer "o todo o nada" y a la vez importar 797 de 800.
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'El fichero tiene errores. No se ha importado nada.',
        errors,
        totalRows: rows.length,
      });
      return;
    }

    // ── FASE 2: escribir todo dentro de una transacción ─────────────────────
    //
    // Las invitaciones se acumulan en memoria en vez de encolarse aquí: un
    // correo no se puede deshacer, así que encolarlo dentro de la transacción
    // significaría que un ROLLBACK deja a 700 personas con un correo para una
    // cuenta que ya no existe.
    //
    // El token de "establece tu contraseña" tampoco se genera aquí: lo emite el
    // worker de la cola al enviar, para que el enlace no quede en claro en
    // email_log (P1-7).
    const institutionName = adminDomain ?? 'tu institución';

    const pendingInvites: Array<{ to: string; userId: number; name: string }> = [];
    let created = 0;
    let added = 0;
    let skipped = 0;

    await withTransaction(async (tx) => {
      for (const entry of plan) {
        let userId = entry.existingUserId;

        if (userId === null) {
          const alta = await createCensusUser(tx, entry, req.user!.userId);
          userId = alta.userId;
          created++;

          pendingInvites.push(alta.invite);
        }

        const assigned = await tx.exec(
          "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
          [id, userId]
        );
        // changes = 0 significa que el ON CONFLICT no insertó: ya estaba en el censo.
        if (assigned.changes > 0) added++;
        else skipped++;
      }
    });

    // ── FASE 3: enviar los correos, ya con la transacción confirmada ────────
    //
    // A partir de aquí los datos están commiteados: si falla un envío, el censo
    // sigue bien y la invitación se puede reenviar. Al revés no tiene arreglo.
    for (const invite of pendingInvites) {
      sendCensusInvitation({
        to:              invite.to,
        userId:          invite.userId,
        name:            invite.name,
        electionName:    election.name,
        institutionName,
      });
    }

    res.json({
      success: true,
      results: { created, added, skipped, invited: pendingInvites.length, errors: [] },
    });
  } catch (error) {
    console.error("Error importing voters CSV:", formatError(error));
    res.status(500).json({ error: "Error al importar votantes. No se ha importado nada." });
  }
});

/**
 * @route GET /admin/audit
 */
router.get("/audit", requireAdmin, async (req: Request, res: Response) => {
  try {
    let query = `
      SELECT
        na.id,
        na.user_id,
        u.email,
        u.name,
        na.election_id,
        e.name as election_name,
        na.nullifier_hash,
        na.generated_at
      FROM nullifier_audit na
      JOIN users u ON na.user_id = u.id
      JOIN elections e ON na.election_id = e.id
    `;
    const params: any[] = [];

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      query += " WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)";
      params.push(adminDomain, adminDomain);
    }

    query += " ORDER BY na.generated_at DESC LIMIT 100";

    const audit = await db.run<any>(query, params);

    res.json({ audit: audit || [] });
  } catch (error) {
    console.error("Error en auditoría:", error);
    res.status(500).json({ error: "Error al obtener auditoría" });
  }
});

/**
 * @route GET /admin/stats/voters
 */
router.get("/stats/voters", requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await db.run<any>(
      `SELECT
        e.id,
        e.name as election_name,
        COUNT(DISTINCT na.id) as total_voters,
        COUNT(DISTINCT ev.user_id) as total_voters_assigned,
        ROUND(COUNT(DISTINCT na.id) * 100.0 / NULLIF(COUNT(DISTINCT ev.user_id), 0), 1) as participation_rate,
        e.is_active,
        e.created_at
      FROM elections e
      LEFT JOIN nullifier_audit na ON e.id = na.election_id
      LEFT JOIN election_voters ev ON e.id = ev.election_id
      GROUP BY e.id
      ORDER BY e.created_at DESC`
    );

    res.json({ stats: stats || [] });
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * @route GET /admin/blockchain-status
 * @desc Returns the live status of the connected blockchain node and contract.
 */
router.get("/blockchain-status", requireAdmin, async (req: Request, res: Response) => {
  const contractAddress = process.env.CONTRACT_ADDRESS || "";
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const explorerUrl = process.env.EXPLORER_URL || "";

  if (!contractAddress) {
    res.json({
      connected: false,
      reason: "CONTRACT_ADDRESS not configured",
      contractAddress: null,
      explorerUrl,
    });
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const abi = ["function getElectionCount() public view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const electionCount = await contract.getElectionCount();

    res.json({
      connected: true,
      contractAddress,
      explorerUrl,
      chainId: network.chainId.toString(),
      blockNumber,
      electionCount: electionCount.toString(),
    });
  } catch (err: any) {
    console.warn("blockchain-status check failed:", formatError(err));
    res.json({
      connected: false,
      reason: "Could not connect to blockchain node",
      contractAddress,
      explorerUrl,
    });
  }
});

/**
 * @route GET /admin/elections/:id/stats
 * @desc Detailed statistics for a single election (candidates, voters, domains)
 */
router.get("/elections/:id/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await denyIfElectionOutOfScope(req, res, id)) return;

    const election = await db.get<any>(
      "SELECT id, name, description, start_time, end_time, is_active FROM elections WHERE id = ?",
      [id]
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const totalVotersRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM election_voters WHERE election_id = ?",
      [id]
    );
    const totalVotesRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ?",
      [id]
    );
    const totalVotesNum = totalVotesRow?.count || 0;
    const totalVotersNum = totalVotersRow?.count || 0;

    const candidateStats = await db.run<any>(
      `SELECT c.id, c.name, c.description, COUNT(na.id) as votes
       FROM candidates c
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.candidate_id = c.id
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY votes DESC`,
      [id, id]
    );

    const candidatesWithPct = candidateStats.map((c: any) => ({
      ...c,
      percentage: totalVotesNum > 0
        ? Math.round((c.votes / totalVotesNum) * 1000) / 10
        : 0,
    }));

    const domains = await db.run<{ email_domain: string }>(
      "SELECT email_domain FROM election_access WHERE election_id = ?",
      [id]
    );

    const voters = await db.run<any>(
      `SELECT u.email,
         CASE WHEN na.id IS NOT NULL THEN 1 ELSE 0 END as has_voted
       FROM election_voters ev
       JOIN users u ON ev.user_id = u.id
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.user_id = u.id
       WHERE ev.election_id = ?
       ORDER BY has_voted DESC, u.email ASC`,
      [id, id]
    );

    res.json({
      election: {
        ...election,
        startDate: new Date(election.start_time * 1000).toISOString(),
        endDate: new Date(election.end_time * 1000).toISOString(),
      },
      stats: {
        totalVoters: totalVotersNum,
        totalVotes: totalVotesNum,
        participationRate: totalVotersNum > 0
          ? Math.round((totalVotesNum / totalVotersNum) * 1000) / 10
          : 0,
      },
      candidates: candidatesWithPct,
      domains: domains.map((d: any) => d.email_domain),
      voters: voters || [],
    });
  } catch (error) {
    console.error("Error in election stats:", error);
    res.status(500).json({ error: "Error al cargar las estadísticas de la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/notify-open
 * @desc  Envía el aviso de apertura a todos los votantes de la elección.
 */
router.post("/elections/:id/notify-open", requireAdmin, async (req: Request, res: Response) => {
  try {
    const electionId = parseInt(req.params.id as string, 10);
    if (isNaN(electionId)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }

    if (await denyIfElectionOutOfScope(req, res, electionId)) return;

    const election = await db.get<{
      id: number; name: string; start_time: number; end_time: number;
    }>("SELECT id, name, start_time, end_time FROM elections WHERE id = ?", [electionId]);

    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    let offset = 0;
    let totalQueued = 0;
    while (true) {
      const voters = await db.run<{ email: string; name: string }>(
        `SELECT u.email, u.name
           FROM election_voters ev
           JOIN users u ON u.id = ev.user_id
          WHERE ev.election_id = ?
            AND u.deleted_at IS NULL
            AND u.email NOT LIKE '%@vtb.demo'
          ORDER BY u.id ASC
          LIMIT ${MAX_NOTIFY_BATCH} OFFSET ${offset}`,
        [electionId],
      );

      if (voters.length === 0) break;

      for (const v of voters) {
        sendElectionOpen({
          to:           v.email,
          name:         v.name,
          electionName: election.name,
          startTime:    new Date(election.start_time * 1000),
          endTime:      new Date(election.end_time   * 1000),
          voteUrl:      `${frontendUrl}/voting/${electionId}`,
        });
      }

      totalQueued += voters.length;
      if (voters.length < MAX_NOTIFY_BATCH) break;
      offset += MAX_NOTIFY_BATCH;
    }

    res.json({ success: true, queued: totalQueued });
  } catch (err) {
    console.error('notify-open error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @route POST /admin/elections/:id/notify-close
 * @desc  Envía el aviso de cierre y resultados disponibles a todos los votantes.
 */
router.post("/elections/:id/notify-close", requireAdmin, async (req: Request, res: Response) => {
  try {
    const electionId = parseInt(req.params.id as string, 10);
    if (isNaN(electionId)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }

    if (await denyIfElectionOutOfScope(req, res, electionId)) return;

    const election = await db.get<{ id: number; name: string; end_time: number }>(
      "SELECT id, name, end_time FROM elections WHERE id = ?", [electionId]
    );
    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const closedAt = election.end_time
      ? new Date(election.end_time * 1000)
      : new Date();

    let offset = 0;
    let totalQueued = 0;
    while (true) {
      const voters = await db.run<{ email: string; name: string }>(
        `SELECT u.email, u.name
           FROM election_voters ev
           JOIN users u ON u.id = ev.user_id
          WHERE ev.election_id = ?
            AND u.deleted_at IS NULL
            AND u.email NOT LIKE '%@vtb.demo'
          ORDER BY u.id ASC
          LIMIT ${MAX_NOTIFY_BATCH} OFFSET ${offset}`,
        [electionId],
      );

      if (voters.length === 0) break;

      for (const v of voters) {
        sendElectionClose({
          to:           v.email,
          name:         v.name,
          electionName: election.name,
          closedAt,
          resultsUrl:   `${frontendUrl}/results/${electionId}`,
        });
      }

      totalQueued += voters.length;
      if (voters.length < MAX_NOTIFY_BATCH) break;
      offset += MAX_NOTIFY_BATCH;
    }

    res.json({ success: true, queued: totalQueued });
  } catch (err) {
    console.error('notify-close error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
