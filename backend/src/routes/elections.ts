import express, { Request, Response } from "express";
import { ethers } from "ethers";
import { createHash } from "crypto";
import { getDbClient, VoteConflictError } from "../db/index.js";
import { z } from "zod";
import { generateNullifier, verifyToken, COOKIE_NAME_ACCESS } from "../utils/auth.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendVoteConfirmation } from "../services/email/index.js";
import { formatError } from "../utils/errors.js";
import { isChainConfigured } from "../scripts/syncElections.js";
import { getVotePort } from "../services/voteChain.js";

const router = express.Router();
const db = getDbClient();

const registerVoteSchema = z.object({
  electionId:  z.number().int().positive(),
  voteHash:    z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'voteHash debe ser un hash hex de 32 bytes'),
  candidateId: z.number().int().positive().optional(),
});

/**
 * @title Election Routes - VTB Backend
 * @author Senior Web3 Architect
 * @dev Rutas para gestionar elecciones y conectar con Smart Contract
 *
 * ARQUITECTURA:
 * - Backend acta como RELAYER entre frontend y blockchain
 * - No custdia privadas (frontend las maneja)
 * - Valida datos antes de transmitir a blockchain
 * - Escucha eventos del Smart Contract para auditora
 */

function getProvider() {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  return new ethers.JsonRpcProvider(rpcUrl);
}

// getWallet() vivía aquí y construía Wallet + Contract dentro del manejador del
// voto, que es lo que hacía imposible probar ese camino sin una cadena real.
// Ahora lo encapsula services/voteChain.ts, que los tests sustituyen.

/**
 * @route GET /elections
 * @desc Obtiene las elecciones del usuario autenticado
 * @protected Requiere JWT vlido
 * 
 * FIX D: Filtra elecciones por usuario - solo devuelve elecciones donde
 * el usuario est en la tabla election_voters
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Obtener TODAS las elecciones donde este usuario est en election_voters
    const elections = await db.run<{
      id: number;
      election_id_blockchain: number;
      name: string;
      description: string;
      start_time: number;
      end_time: number;
      is_active: boolean;
      image_url: string | null;
      banner_color: string | null;
      voter_role: string | null;
    }>(
      `SELECT e.* FROM elections e
       INNER JOIN election_voters ev ON e.id = ev.election_id
       WHERE ev.user_id = ?`,
      [userId]
    );

    const now = Math.floor(Date.now() / 1000);

    // Distingue, para el estado vacío del dashboard, entre "tu institución no
    // tiene ninguna elección creada" y "tiene elecciones pero no estás
    // asignado a ninguna" — son situaciones distintas para el usuario.
    let institutionElectionCount = 0;
    const currentUser = await db.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [userId]);
    const domain = currentUser?.email?.split("@")[1]?.toLowerCase();
    if (domain) {
      const countRow = await db.get<{ count: number }>(
        `SELECT COUNT(DISTINCT election_id) as count FROM election_access
         WHERE lower(email_domain) = ? OR email_domain = '*'`,
        [domain]
      );
      institutionElectionCount = countRow?.count || 0;
    }

    res.json({
      elections: elections.map((e) => {
        const isActive = Boolean(e.is_active) && now >= e.start_time && now <= e.end_time;
        const status = isActive ? "active" : (now < e.start_time ? "upcoming" : "closed");
        return {
          id: e.id,
          blockchainId: e.election_id_blockchain,
          name: e.name,
          description: e.description,
          startTime: e.start_time,
          endTime: e.end_time,
          isActive,
          status,
          imageUrl: e.image_url || null,
          bannerColor: e.banner_color || '#1E3A5F',
          voterRole: e.voter_role || 'student',
        };
      }),
      institutionElectionCount,
    });
  } catch (error) {
    console.error("Error al obtener elecciones:", error);
    res.status(500).json({ error: "Error al obtener elecciones" });
  }
});

/**
 * @route GET /elections/blockchain-sync-status
 * @desc Estado de sincronización con blockchain de cada elección (elections.chain_status).
 */
router.get("/blockchain-sync-status", async (_req: Request, res: Response) => {
  try {
    const elections = await db.run<{
      id: number;
      name: string;
      election_id_blockchain: number;
      chain_status: string;
      chain_tx_hash: string | null;
      chain_attempts: number;
    }>(
      "SELECT id, name, election_id_blockchain, chain_status, chain_tx_hash, chain_attempts FROM elections ORDER BY id ASC"
    );

    // Antes comparaba election_id_blockchain con el recuento del contrato,
    // suponiendo que la elección i de la base era la i del contrato. El estado
    // real lo lleva ahora cada elección. Ruta pública: no incluye chain_error.
    const sync = elections.map((e) => ({
      id: e.id,
      name: e.name,
      chainStatus: e.chain_status,
      blockchainId: e.chain_status === 'synced' ? Number(e.election_id_blockchain) : null,
      txHash: e.chain_tx_hash,
      attempts: Number(e.chain_attempts),
    }));

    res.json({
      chainConfigured: isChainConfigured(),
      elections: sync,
      pending: sync.filter((e) => e.chainStatus !== 'synced'),
    });
  } catch (err) {
    console.error("Failed to check blockchain sync status:", formatError(err));
    res.status(500).json({ error: "No se ha podido comprobar el estado de sincronización" });
  }
});

/**
 * @route PATCH /elections/fix-blockchain-ids
 * @desc Desactivada (410): los ids de blockchain los asigna la sincronización.
 */
router.patch("/fix-blockchain-ids", requireAdmin, async (_req: Request, res: Response) => {
  // Renumeraba election_id_blockchain como 1..N suponiendo que la elección i de
  // la base era la i del contrato. No lo era (en Supabase, las #1-#5 del contrato
  // son otras elecciones), así que los votos reales habrían ido a otra elección.
  // El id lo escribe ahora la sincronización con el evento ElectionCreated. La
  // ruta sigue detrás de requireAdmin para que un cliente antiguo reciba el motivo.
  res.status(410).json({
    error: "Obsoleto: los ids de blockchain los asigna la sincronización automática",
    code: "GONE",
  });
});

/**
 * @route GET /elections/:id
 * @desc Obtiene detalles de una eleccin especfica CON CANDIDATOS
 * 
 * CAMBIO (BLOQUE 1.2):
 * - Ahora devuelve array de candidatos para cargar dinmicamente en VotingBooth
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Auth opcional: si el usuario tiene sesión activa calculamos hasVoted real.
    // Si no, el campo vale false (S10 fix: ya no está hardcodeado).
    const rawToken = (req as { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME_ACCESS];
    let currentUserId: number | null = null;
    if (typeof rawToken === 'string' && rawToken) {
      const decoded = verifyToken(rawToken);
      if (decoded?.userId) currentUserId = decoded.userId;
    }

    const election = await db.get<{
      id: number;
      election_id_blockchain: number;
      name: string;
      description: string;
      start_time: number;
      end_time: number;
      is_active: boolean;
      created_at: string;
      image_url: string | null;
      banner_color: string | null;
      voter_role: string | null;
      chain_status: string;
    }>("SELECT * FROM elections WHERE id = ?", [id]);

    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    // Obtener candidatos de esta eleccin
    const candidates = await db.run<{
      id: number;
      name: string;
      description: string;
      position: number;
    }>(
      "SELECT id, name, description, position FROM candidates WHERE election_id = ? ORDER BY position ASC",
      [election.id]
    );

    // Obtener informacin del blockchain si est disponible
    let blockchainInfo = null;
    const contractAddress = process.env.CONTRACT_ADDRESS || "";
    // Solo si la elección está en el contrato: con otro estado,
    // election_id_blockchain no apunta a su elección.
    if (contractAddress && election.chain_status === 'synced') {
      try {
        // ABI minimal del contrato ElectionRegistry
        const abi = [
          "function getElection(uint256) public view returns (string, uint256, uint256, bool, uint256)",
        ];

        const contract = new ethers.Contract(contractAddress, abi, getProvider());
        const onchainData = await contract.getElection(
          election.election_id_blockchain
        );

        blockchainInfo = {
          name: onchainData[0],
          totalVotes: onchainData[4].toString(),
        };
      } catch (err) {
        console.warn("No se pudo obtener datos del blockchain:", formatError(err));
      }
    }

    // Validar que la election sigue activa
    const now = Math.floor(Date.now() / 1000);
    const isActive = election.is_active && now >= election.start_time && now <= election.end_time;

    // S10 fix: hasVoted real en lugar de hardcodeado a false
    let hasVoted = false;
    if (currentUserId !== null) {
      const voted = await db.get<{ id: number }>(
        "SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?",
        [currentUserId, election.id],
      );
      hasVoted = Boolean(voted);
    }

    res.json({
      election: {
        id: election.id,
        blockchainId: election.chain_status === 'synced' ? election.election_id_blockchain : null,
        chainStatus: election.chain_status,
        name: election.name,
        description: election.description,
        startTime: election.start_time,
        endTime: election.end_time,
        isActive, // Estado actual en tiempo real
        title: election.name, // Alias para frontend
        status: isActive ? "active" : (now < election.start_time ? "pending" : "closed"),
        candidates: candidates || [],
        eligible: true,
        hasVoted,
        imageUrl: election.image_url || null,
        bannerColor: election.banner_color || '#1E3A5F',
        voterRole: election.voter_role || 'student',
        blockchainInfo,
      },
    });
  } catch (error) {
    console.error("Error al obtener elección:", error);
    res.status(500).json({ error: "Error al obtener elección" });
  }
});

/**
 * @route GET /elections/:id/eligibility (BLOQUE 5.3)
 * @desc Valida si el usuario puede votar en una eleccin especfica
 * @protected Requiere JWT vlido
 * @returns { eligible, reason?, status? }
 * 
 * Comprueba en orden:
 * 1. Existe la eleccin? ' not_found
 * 2. Est activa? ' not_active + status
 * 3. Usuario est en censo? ' not_eligible
 * 4. Ya vot? ' already_voted
 * 5. OK ' eligible: true
 */
router.get("/:id/eligibility", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // 1. Verificar que existe la eleccin
    const election = await db.get<{
      id: number;
      start_time: number;
      end_time: number;
      is_active: boolean;
    }>("SELECT id, start_time, end_time, is_active FROM elections WHERE id = ?", [id]);

    if (!election) {
      res.json({ eligible: false, reason: 'not_found' });
      return;
    }

    // 2. Verificar que est activa (dentro del rango de tiempo)
    const now = Math.floor(Date.now() / 1000);
    const isActive = election.is_active && now >= election.start_time && now <= election.end_time;
    
    if (!isActive) {
      const status = now < election.start_time ? 'pending' : 'closed';
      res.json({ 
        eligible: false, 
        reason: 'not_active',
        status
      });
      return;
    }

    // 3. Verificar que el usuario est en el censo (election_voters)
    const voterReg = await db.get<{ id: number }>(
      "SELECT election_id FROM election_voters WHERE election_id = ? AND user_id =?",
      [election.id, userId]
    );

    if (!voterReg) {
      res.json({ eligible: false, reason: 'not_eligible' });
      return;
    }

    // 4. Verificar que NO ha votado ya (en nullifier_audit)
    const alreadyVoted = await db.get<{ id: number; tx_hash: string | null; block_number: number | null }>(
      "SELECT id, tx_hash, block_number FROM nullifier_audit WHERE user_id = ? AND election_id = ?",
      [userId, election.id]
    );

    if (alreadyVoted) {
      // Estado real del voto en la cadena, para que la pantalla de "ya has votado"
      // no afirme lo que no es. Antes solo se devolvía el motivo, y el frontend
      // pintaba siempre "Tu voto ha sido registrado en la blockchain" — también a
      // las cuentas @vtb.demo, que toman un atajo sintético y nunca llegan a
      // Sepolia, mientras el comprobante de ese mismo voto decía lo contrario.
      //
      // block_number es el único criterio: solo existe si hubo recibo de una
      // transacción real. Cubre a la vez el atajo demo y el fallback fuera de
      // cadena, que también guardan un tx_hash sintético sin bloque. Es el mismo
      // criterio que ya usa GET /:id/audit.
      const isDemo = req.user!.email?.endsWith('@vtb.demo') ?? false;
      const onChain = alreadyVoted.block_number !== null && !isDemo;
      res.json({ eligible: false, reason: 'already_voted', onChain, isDemo });
      return;
    }

    // 5. Todo OK - usuario puede votar
    res.json({ eligible: true });

  } catch (error) {
    console.error("Error en validación de elegibilidad:", error);
    res.status(500).json({ error: "Error al validar elegibilidad" });
  }
});

/**
 * @route GET /elections/:id/results (BLOQUE 3.2)
 * @desc Obtiene resultados de una eleccin con participacin
 * @protected Requiere JWT vlido (voters y admins)
 * @returns { election, candidates[], totalVotes, participationRate }
 */
router.get("/:id/results", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Obtener eleccin
    const election = await db.get<{
      id: number;
      name: string;
      description: string;
      start_time: number;
      end_time: number;
      is_active: boolean;
    }>("SELECT id, name, description, start_time, end_time, is_active FROM elections WHERE id = ?", [id]);

    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    // Determinar estado
    const now = Math.floor(Date.now() / 1000);
    const status = election.is_active && now >= election.start_time && now <= election.end_time 
      ? 'active' 
      : (now < election.start_time ? 'pending' : 'closed');

    // Obtener total de votantes asignados
    const voterCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM election_voters WHERE election_id = ?",
      [election.id]
    );

    const totalVoters = voterCount?.count || 0;

    // Obtener candidatos
    const candidates = await db.run<{
      id: number;
      name: string;
      description: string;
    }>(
      "SELECT id, name, description FROM candidates WHERE election_id = ? ORDER BY position ASC",
      [election.id]
    );

    // Get real per-candidate vote counts from candidate_id column
    const candidateVoteCounts = await db.run<{ candidate_id: number; votes: number }>(
      `SELECT candidate_id, COUNT(*) as votes
       FROM nullifier_audit
       WHERE election_id = ? AND candidate_id IS NOT NULL
       GROUP BY candidate_id`,
      [election.id]
    );

    const voteMap: Record<number, number> = {};
    for (const cv of candidateVoteCounts) {
      voteMap[cv.candidate_id] = cv.votes;
    }

    const candidatesWithVotes = candidates.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      votes: voteMap[c.id] || 0,
      percentage: 0,
    }));

    const realTotalVotes = candidatesWithVotes.reduce((s, c) => s + c.votes, 0);
    candidatesWithVotes.forEach(c => {
      c.percentage = realTotalVotes > 0
        ? Math.round((c.votes / realTotalVotes) * 1000) / 10
        : 0;
    });
    candidatesWithVotes.sort((a, b) => b.votes - a.votes);

    const totalVoterCount = voterCount?.count || 0;
    const onChainCount = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id
       WHERE na.election_id = ?
       AND na.tx_hash IS NOT NULL
       AND na.block_number IS NOT NULL
       AND u.email NOT LIKE '%@vtb.demo'`,
      [election.id]
    );

    res.json({
      election: {
        id: election.id,
        name: election.name,
        description: election.description || '',
        status,
        startDate: new Date(election.start_time * 1000).toISOString(),
        endDate: new Date(election.end_time * 1000).toISOString(),
        totalVoters: totalVoterCount,
      },
      candidates: candidatesWithVotes,
      totalVotes: realTotalVotes,
      participationRate: totalVoterCount > 0
        ? Math.round((realTotalVotes / totalVoterCount) * 1000) / 10
        : 0,
      onChainVerified: (onChainCount?.count || 0) > 0,
    });

  } catch (error) {
    console.error("Error al obtener resultados:", error);
    res.status(500).json({ error: "Error al obtener resultados" });
  }
});

/**
 * @route GET /elections/:id/audit (BLOQUE 3.5)
 * @desc Obtiene registro de auditora pblica de la eleccin
 * @public SIN JWT requerido - informacin de auditora es pblica
 * @returns array de { nullifier, txHash, timestamp }
 */
router.get("/:id/audit", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que la eleccin existe
    const election = await db.get<{ id: number }>(
      "SELECT id FROM elections WHERE id = ?",
      [id]
    );

    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    const explorerUrl = process.env.EXPLORER_URL || "";

    const auditRecords = await db.run<{
      nullifier_hash: string;
      generated_at: string;
      tx_hash: string | null;
      block_number: number | null;
      email: string;
    }>(
      `SELECT na.nullifier_hash, na.generated_at, na.tx_hash, na.block_number, u.email
       FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id
       WHERE na.election_id = ?
       ORDER BY na.generated_at DESC`,
      [id]
    );

    const auditData = auditRecords.map((record) => {
      const isDemo = record.email.endsWith("@vtb.demo");
      const onChain = Boolean(record.tx_hash) && !isDemo && record.block_number !== null;
      const txHash = record.tx_hash ||
        `0x${createHash('sha256').update(record.nullifier_hash || '').digest('hex')}`;
      const explorerLink = explorerUrl && onChain
        ? `${explorerUrl.replace(/\/$/, "")}/tx/${record.tx_hash}`
        : null;
      return {
        nullifier: record.nullifier_hash,
        txHash,
        blockNumber: record.block_number,
        timestamp: record.generated_at,
        explorerLink,
        onChain,
        isDemo,
      };
    });

    res.json(auditData);

  } catch (error) {
    console.error("Error al obtener auditoría:", error);
    res.status(500).json({ error: "Error al obtener auditoría" });
  }
});

/**
 * @route POST /elections/register-vote
 * @desc CRITICAL FUNCTION: Register a vote on the Smart Contract
 *
 * ARCHITECTURAL CHANGE:
 * 1. Frontend sends JWT + electionId + voteHash
 * 2. Backend validates JWT and extracts userId
 * 3. Backend generates nullifier = HMAC(userId + electionId) at vote time
 * 4. Backend prepares transaction: castVote(electionId, nullifier, voteHash)
 * 5. Backend signs and sends with PRIVATE_KEY as relayer
 * 6. Frontend receives txHash for audit
 * 7. Frontend can listen for the VoteCast blockchain event
 *
 * PRIVACY:
 * - Backend does not see the decrypted vote; voteHash is a hash
 * - Backend does not custody the user's private key; it only generates nullifier
 * - Blockchain only sees nullifier hash and voteHash
 * - Personal identity is not stored on-chain
 */router.post("/register-vote", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = registerVoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const { electionId, voteHash, candidateId } = parsed.data;

    const decoded = req.user!;

    // Verificar que eleccin existe en BD local
    const election = await db.get<{ id: number; election_id_blockchain: number; name: string; chain_status: string }>(
      "SELECT id, election_id_blockchain, name, chain_status FROM elections WHERE id = ? AND is_active = TRUE",
      [electionId]
    );

    if (!election) {
      res.status(404).json({ error: "Elección no encontrada o no activa" });
      return;
    }

    // VERIFICACIN DE TIEMPO (para elecciones con horarios)
    const now = Math.floor(Date.now() / 1000);
    const electionFull = await db.get<{ start_time: number; end_time: number }>(
      "SELECT start_time, end_time FROM elections WHERE id = ?",
      [electionId]
    );

    if (
      electionFull &&
      (now < electionFull.start_time || now > electionFull.end_time)
    ) {
      res.status(403).json({ error: "Elección fuera de horario" });
      return;
    }

    // Verificar que el usuario está habilitado para votar
    const voter = await db.get<{ is_eligible: number; name: string }>(
      "SELECT is_eligible, name FROM users WHERE id = ?",
      [decoded.userId]
    );
    if (!voter || !voter.is_eligible) {
      return res.status(403).json({ error: "Tu cuenta no está habilitada para votar" });
    }

    // Verificar que el usuario está en el censo de esta elección
    const inCensus = await db.get<{ election_id: number }>(
      "SELECT election_id FROM election_voters WHERE election_id = ? AND user_id = ?",
      [election.id, decoded.userId]
    );
    if (!inCensus) {
      return res.status(403).json({ error: "No estás en el censo de esta elección" });
    }

    // GENERAR NULLIFIER EN ESTE MOMENTO (CAMBIO CRÍTICO)
    // Nullifier = HMAC(userId + electionId)
    const nullifier = generateNullifier(decoded.userId, electionId);

    // Verificar doble voto (aplica también para cuentas demo antes del shortcut)
    const alreadyVoted = await db.get<{ id: number }>(
      'SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?',
      [decoded.userId, election.id]
    );
    if (alreadyVoted) {
      return res.status(409).json({ error: 'Ya has votado en esta elección' });
    }

    // Check if this is a vtb.demo account — use synthetic fallback immediately
    const isDemo = decoded.email?.endsWith('@vtb.demo');

    if (isDemo) {
      const { createHash } = await import('crypto');
      const syntheticTx = '0x' + createHash('sha256')
        .update(`demo:${decoded.userId}:${electionId}:${Date.now()}`)
        .digest('hex');

      await db.exec(
        'INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id) VALUES (?, ?, ?, ?, ?, NULL, ?)',
        [decoded.userId, electionId, nullifier, candidateId ? String(candidateId) : null, syntheticTx, candidateId ?? null]
      );

      return res.json({
        success: true,
        txHash: syntheticTx,
        blockNumber: null,
        isDemo: true,
        message: 'Voto de demostración registrado (sintético — no está en la blockchain real)',
      });
    }

    // La elección tiene que estar registrada en el contrato. Mientras no lo esté,
    // election_id_blockchain no es fiable (antes de la migración 008 salía de una
    // renumeración que apuntaba a OTRAS elecciones del contrato) y el voto se
    // registraría en la elección equivocada. La sincronización corre sola en
    // segundo plano: basta con reintentar en unos minutos.
    if (election.chain_status !== 'synced') {
      return res.status(503).json({
        error: "Esta elección aún no está registrada en blockchain",
        details: "Se está registrando en segundo plano. Inténtalo de nuevo en unos minutos.",
        code: "ELECTION_NOT_ON_CHAIN",
        chainStatus: election.chain_status,
      });
    }

    // TOCTOU fix: adquirir cerrojo atómico ANTES de la tx blockchain.
    // En PG: upsert en vote_attempts (ON CONFLICT DO UPDATE WHERE status='failed').
    // En SQLite: SELECT legacy en nullifier_audit (mismo comportamiento que antes).
    try {
      await db.acquireVoteLock(decoded.userId, electionId, nullifier, candidateId ?? null);
    } catch (err: any) {
      if (err instanceof VoteConflictError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }

    // La comprobación de "¿hay cadena configurada?" la hace ahora el puerto:
    // getVotePort() devuelve null con los mismos criterios que la
    // sincronización (dirección o clave vacías, o a ceros como en .env.example).




    // PREPARAR TRANSACCIN EN BLOCKCHAIN
    try {
      const port = getVotePort();
      if (!port) {
        return res.status(500).json({ error: "Blockchain no configurado. Asegurate de que PRIVATE_KEY este definida." });
      }

      // Enviar transaccin
      console.log(`Sending vote to blockchain...`);
      console.log(`   - Election ID: ${election.election_id_blockchain}`);
      console.log(`   - Nullifier: ${nullifier.substring(0, 20)}...`);
      console.log(`   - Vote Hash: ${voteHash.substring(0, 20)}...`);

      // OJO: va el id de la elección EN EL CONTRATO, no el id de la base. Son
      // distintos, y confundirlos registra el voto en otra elección. Hay un
      // test que lo comprueba (vote-chain.test.ts).
      //
      // El puerto envía y espera el recibo. Los errores de ethers suben sin
      // envolver: el catch de abajo los clasifica por subcadena y por `code`.
      const { txHash, blockNumber } = await port.castVote(
        election.election_id_blockchain,
        nullifier,
        voteHash,
      );

      console.log(`Vote registered in transaction: ${txHash}`);

      // Record audit entry. Only mark vote_attempts as 'confirmed' if this INSERT
      // succeeds. If it fails, the row stays 'pending' so cleanupStaleVoteAttempts
      // can reconstruct the full nullifier_audit row from the VoteCast event.
      let auditInserted = false;
      try {
        await db.exec(
          'INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            decoded.userId,
            electionId,
            nullifier,
            candidateId ? String(candidateId) : null,
            txHash,
            blockNumber,
            candidateId ?? null,
          ]
        );
        auditInserted = true;
      } catch (auditError) {
        console.error('AUDIT INSERT FAILED after successful blockchain tx:', txHash, 'userId:', decoded.userId);
        console.error(auditError);
      }

      if (auditInserted) {
        // Marcar el intento como confirmado (PG: actualiza vote_attempts; SQLite: no-op)
        await db.releaseVoteLock(decoded.userId, electionId, 'confirmed').catch(() => {});

        // Confirmación por email (fire-and-forget, no bloquea la respuesta)
        if (!decoded.email?.endsWith('@vtb.demo')) {
          const explorerBase = process.env.EXPLORER_URL;
          sendVoteConfirmation({
            to:           decoded.email,
            name:         voter!.name ?? decoded.email,
            electionName: election.name,
            txHash:       txHash,
            votedAt:      new Date(),
            explorerUrl:  explorerBase ? `${explorerBase}/tx/${txHash}` : undefined,
          });
        }
      }
      // Si auditInserted=false, vote_attempts queda 'pending' para que el
      // job de limpieza lo recupere desde el evento on-chain.

      res.json({
        success: true,
        txHash,
        blockNumber,
        message: "Voto registrado exitosamente en blockchain",
        voting: {
          nullifier: nullifier,
          electionId: election.election_id_blockchain,
          voteHashReceived: voteHash,
        },
      });
    } catch (blockchainError: any) {
      // A1: nunca volcar el objeto de error de ethers. Arrastra info.payload
      // (tx firmada), transaction, receipt y la URL del RPC con su API key.
      console.error(
        "Error al registrar voto en blockchain:",
        formatError(blockchainError),
        `userId=${decoded.userId}`,
        `electionId=${electionId}`,
      );

      // Liberar cerrojo: permite reintentar si la tx falló
      await db.releaseVoteLock(
        decoded.userId, electionId, 'failed',
        String(blockchainError.message ?? blockchainError),
      ).catch(() => {});

      // Graceful fallback: election not yet registered on-chain (seeded elections)
      const isElectionMissing =
        blockchainError.message?.includes("election does not exist") ||
        blockchainError.message?.includes("ERR: election") ||
        (blockchainError.code === "CALL_EXCEPTION" &&
          blockchainError.reason?.includes("election does not exist"));

      if (isElectionMissing && decoded.email?.endsWith("@vtb.demo")) {
        const syntheticTx = `0x${createHash('sha256')
          .update(nullifier + String(electionId) + String(Date.now()))
          .digest('hex')}`;
        try {
          await db.exec(
            'INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [decoded.userId, electionId, nullifier, candidateId ? String(candidateId) : null, syntheticTx, null, candidateId ?? null]
          );
          console.warn(`Vote recorded off-chain (election ${election.election_id_blockchain} not registered on Sepolia): userId=${decoded.userId}`);
          return res.json({
            success: true,
            txHash: syntheticTx,
            blockNumber: null,
            message: "Voto registrado exitosamente en el sistema",
            voting: { nullifier, electionId: election.election_id_blockchain, voteHashReceived: voteHash },
          });
        } catch (auditErr) {
          console.error('Failed to record off-chain fallback vote:', auditErr);
          return res.status(500).json({ error: "Error al registrar voto" });
        }
      }

      if (isElectionMissing) {
        return res.status(503).json({
          error: "Esta elección aún no está sincronizada en Sepolia",
          details: "El administrador debe ejecutar la sincronización de blockchain.",
          code: "ELECTION_NOT_ON_CHAIN",
        });
      }

      // Diferenciar otros errores de blockchain
      if (blockchainError.code === "INVALID_ARGUMENT") {
        res.status(400).json({
          error: "Datos inválidos para blockchain",
          details: blockchainError.message,
        });
      } else if (
        blockchainError.message?.includes("already voted") ||
        blockchainError.message?.includes("nullifier already used")
      ) {
        res.status(409).json({
          error: "Ya has votado en esta elección",
          details: "Nullifier duplicado detectado en blockchain",
        });
      } else {
        res.status(500).json({
          error: "Error al registrar voto en blockchain",
          details: blockchainError.message,
        });
      }
    }
  } catch (error) {
    console.error("Error en register-vote:", formatError(error));
    res.status(500).json({ error: "Error al registrar voto" });
  }
});

/**
 * @route GET /elections/:electionId/vote-feed
 * @desc Obtiene el feed de votos en tiempo real
 * Usa WebSocket/EventListener para escuchar eventos del blockchain
 */
router.get("/:electionId/vote-feed", async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;

    // En esta versin simple, retornamos un endpoint
    // Para tiempo real, usar WebSocket (Socket.io)
    res.json({
      info: "Para escuchar votos en tiempo real, conéctate al WebSocket",
      endpoint: `/ws/elections/${electionId}/votes`,
      events: {
        VoteCast: {
          nullifier: "Hash anónimo del votante",
          voteHash: "Hash cifrado del voto",
          timestamp: "Momento del registro",
          txHash: "Hash de transacción blockchain",
        },
      },
    });
  } catch (error) {
    console.error("Error en vote-feed:", error);
    res.status(500).json({ error: "Error al obtener feed de votos" });
  }
});

export default router;
