import express, { Request, Response } from "express";
import { ethers } from "ethers";
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
  // Obligatorio desde el contrato v2: es lo que se registra en la cadena, y sin
  // él el voto no cuenta para nadie. Antes era opcional y se podía registrar un
  // voto sin candidato — de hecho hay uno así en la base.
  candidateId: z.number().int().positive({ message: 'candidateId es obligatorio' }),
  // Se sigue aceptando por compatibilidad con el frontend actual, pero ya no se
  // usa para nada: el v2 registra el candidato, no un hash opaco. Nunca fue un
  // compromiso abrible porque el salt se perdía en el navegador (BC-12). El
  // frontend deja de enviarlo en el paso 5 y entonces desaparece de aquí.
  voteHash:    z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'voteHash debe ser un hash hex de 32 bytes').optional(),
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
      chain_contract_address: string | null;
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
    // Dos condiciones, no una. Que la elección esté 'synced' dice que tiene un
    // id en ALGÚN contrato; que su chain_contract_address sea el contrato
    // configurado ahora dice que es ESTE. Una elección del contrato anterior
    // tiene un id que allí significa otra cosa, y su ABI es distinto: leerla con
    // este ABI devolvería basura o reventaría.
    const enEsteContrato =
      election.chain_status === 'synced' &&
      (election.chain_contract_address ?? '').toLowerCase() === contractAddress.toLowerCase();

    if (contractAddress && enEsteContrato) {
      try {
        const abi = [
          "function getElection(uint256) view returns (tuple(string name, uint256 startTime, uint256 endTime, uint256 candidateCount, bytes32 candidatesRoot, bytes32 censusRoot, bool halted, uint256 totalVotes))",
        ];

        const contract = new ethers.Contract(contractAddress, abi, getProvider());
        const onchain = await contract.getElection(election.election_id_blockchain);

        blockchainInfo = {
          name: onchain.name,
          totalVotes: onchain.totalVotes.toString(),
          candidateCount: Number(onchain.candidateCount),
          // Huella de la lista de candidatos comprometida al registrar la
          // elección: con ella, un tercero comprueba que la lista que
          // publicamos es la que estaba en la cadena.
          candidatesRoot: onchain.candidatesRoot,
          halted: onchain.halted,
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

    // 3. Verificar que la cuenta del usuario está activa, aprobada y no borrada
    const userAccount = await db.get<{
      is_eligible: number | boolean;
      is_approved: number | boolean;
      deleted_at: string | Date | null;
    }>(
      "SELECT is_eligible, is_approved, deleted_at FROM users WHERE id = ?",
      [userId]
    );

    if (!userAccount || !userAccount.is_eligible || !userAccount.is_approved || userAccount.deleted_at !== null) {
      res.json({ eligible: false, reason: 'account_inactive' });
      return;
    }

    // 4. Verificar que el usuario est en el censo (election_voters)
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
      election_id_blockchain: number;
      chain_status: string;
      chain_contract_address: string | null;
    }>(
      `SELECT id, name, description, start_time, end_time, is_active,
              election_id_blockchain, chain_status, chain_contract_address
         FROM elections WHERE id = ?`,
      [id],
    );

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

    // Obtener candidatos. La posición es su identificador en la cadena: el
    // recuento on-chain viene indexado por ella, así que hace falta aquí para
    // poder comparar un recuento con el otro.
    const candidates = await db.run<{
      id: number;
      name: string;
      description: string;
      position: number;
    }>(
      "SELECT id, name, description, position FROM candidates WHERE election_id = ? ORDER BY position ASC",
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

    // ── Contraste con la cadena ────────────────────────────────────────────
    //
    // Antes, `onChainVerified` era true si AL MENOS UNA fila tenía tx_hash y
    // block_number no nulos. Con 1.000 votos de los cuales uno llegó a la
    // cadena, la elección se mostraba como verificada. Y ni siquiera consultaba
    // la cadena: comprobaba columnas que la propia base había rellenado.
    //
    // Ahora se pregunta al contrato y se compara voto a voto. Verificado
    // significa que los dos recuentos coinciden, y si no coinciden se dice.
    const votosPorOrigen = await db.run<{ vote_source: string; n: number }>(
      "SELECT vote_source, COUNT(*) as n FROM nullifier_audit WHERE election_id = ? GROUP BY vote_source",
      [election.id],
    );
    const cuenta = (origen: string) =>
      Number(votosPorOrigen.find(v => v.vote_source === origen)?.n ?? 0);
    const votosDemo = cuenta('demo') + cuenta('legacy');

    // Recuento de la base, pero solo de los votos que dicen estar en la cadena:
    // es lo que tiene que cuadrar con el contrato.
    const recuentoBaseEnCadena = await db.run<{ position: number; votes: number }>(
      `SELECT c.position, COUNT(*) as votes
         FROM nullifier_audit na
         JOIN candidates c ON c.id = na.candidate_id
        WHERE na.election_id = ? AND na.vote_source = 'chain'
        GROUP BY c.position`,
      [election.id],
    );

    const contractAddress = (process.env.CONTRACT_ADDRESS || '').toLowerCase();
    const enEsteContrato =
      election.chain_status === 'synced' &&
      contractAddress !== '' &&
      (election.chain_contract_address ?? '').toLowerCase() === contractAddress;

    let verificacion: {
      estado: 'coincide' | 'discrepancia' | 'sin-respuesta' | 'no-aplica';
      detalle: string;
      recuentoCadena?: number[];
      recuentoBase?: number[];
      votosNoVerificables: number;
    } = {
      estado: 'no-aplica',
      detalle: election.chain_status === 'synced'
        ? 'Esta elección está registrada en un contrato anterior; su recuento no se puede contrastar con el contrato actual.'
        : 'Esta elección todavía no está registrada en blockchain.',
      votosNoVerificables: votosDemo,
    };

    const port = enEsteContrato ? getVotePort() : null;
    if (port) {
      try {
        const recuentoCadena = await port.getTally(Number(election.election_id_blockchain));
        const recuentoBase = recuentoCadena.map((_, posicion) =>
          Number(recuentoBaseEnCadena.find(r => Number(r.position) === posicion)?.votes ?? 0),
        );
        const coincide =
          recuentoCadena.length === recuentoBase.length &&
          recuentoCadena.every((v, i) => v === recuentoBase[i]);

        verificacion = {
          estado: coincide ? 'coincide' : 'discrepancia',
          detalle: coincide
            ? 'El recuento de la cadena coincide con el de la base, candidato a candidato.'
            : 'El recuento de la cadena NO coincide con el de la base. Es un defecto: no dé el resultado por bueno.',
          recuentoCadena,
          recuentoBase,
          votosNoVerificables: votosDemo,
        };
      } catch (err) {
        console.warn('No se ha podido leer el recuento de la cadena:', formatError(err));
        verificacion = {
          estado: 'sin-respuesta',
          detalle: 'La cadena no ha respondido. Esto no dice nada sobre el resultado: vuelva a intentarlo.',
          votosNoVerificables: votosDemo,
        };
      }
    }

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
      // Verificado = los dos recuentos coinciden. Nada más cuenta como verificado.
      onChainVerified: verificacion.estado === 'coincide',
      verificacion,
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

    // El origen sale ahora de la columna, no de adivinarlo por el dominio del
    // correo del votante (que además obligaba a unir con users en una ruta
    // pública).
    const auditRecords = await db.run<{
      nullifier_hash: string;
      generated_at: string;
      tx_hash: string | null;
      block_number: number | null;
      vote_source: string;
    }>(
      `SELECT nullifier_hash, generated_at, tx_hash, block_number, vote_source
       FROM nullifier_audit
       WHERE election_id = ?
       ORDER BY generated_at DESC`,
      [id]
    );

    const auditData = auditRecords.map((record) => {
      const onChain = record.vote_source === 'chain' && Boolean(record.tx_hash) && record.block_number !== null;
      const explorerLink = explorerUrl && onChain
        ? `${explorerUrl.replace(/\/$/, "")}/tx/${record.tx_hash}`
        : null;
      return {
        nullifier: record.nullifier_hash,
        // Si no hay transacción, NULL. Antes se fabricaba aquí un SHA-256 con
        // prefijo 0x —indistinguible de un hash de transacción real para quien
        // no consultara la cadena— y se servía por una ruta pública (BC-28).
        txHash: record.tx_hash,
        blockNumber: record.block_number,
        timestamp: record.generated_at,
        explorerLink,
        onChain,
        source: record.vote_source,
        isDemo: record.vote_source === 'demo',
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

    // Verificar que el usuario está habilitado para votar, aprobado y no borrado
    const voter = await db.get<{
      is_eligible: number | boolean;
      is_approved: number | boolean;
      deleted_at: string | Date | null;
      name: string;
    }>(
      "SELECT is_eligible, is_approved, deleted_at, name FROM users WHERE id = ?",
      [decoded.userId]
    );
    if (!voter || !voter.is_eligible || !voter.is_approved || voter.deleted_at !== null) {
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

    // El candidato tiene que ser de ESTA elección. Antes no se comprobaba: se
    // podía votar a un candidato de otra elección y la fila quedaba guardada
    // igual. Y su posición es lo que viaja a la cadena como candidateId, así que
    // un candidato ajeno enviaría un índice fuera de rango.
    const candidato = await db.get<{ id: number; position: number }>(
      "SELECT id, position FROM candidates WHERE id = ? AND election_id = ?",
      [candidateId, election.id],
    );
    if (!candidato) {
      return res.status(400).json({ error: "El candidato no pertenece a esta elección" });
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
      // Sin hash de transacción inventado. Antes se guardaba un SHA-256 con
      // prefijo 0x, indistinguible de un hash real para quien no consultara la
      // cadena, y /audit lo servía como si lo fuera (BC-21). Si no hay
      // transacción, el campo es NULL y vote_source dice de dónde sale el voto.
      await db.exec(
        `INSERT INTO nullifier_audit
           (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id, vote_source)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, 'demo')`,
        [decoded.userId, electionId, nullifier, String(candidateId), candidateId]
      );

      return res.json({
        success: true,
        txHash: null,
        blockNumber: null,
        isDemo: true,
        verifiable: false,
        message: 'Voto de demostración registrado. No está en la blockchain y no es verificable desde fuera.',
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

      console.log(`Sending vote to blockchain...`);
      console.log(`   - Election ID (on-chain): ${election.election_id_blockchain}`);
      console.log(`   - Nullifier: ${nullifier.substring(0, 20)}...`);
      console.log(`   - Candidate (position): ${candidato.position}`);

      // Dos cosas que no son lo que parecen y hay un test para cada una:
      //
      //  - va el id de la elección EN EL CONTRATO, no el id de la base; son
      //    distintos y confundirlos registra el voto en otra elección;
      //  - va la POSICIÓN del candidato en la papeleta, no candidates.id, que
      //    es un autoincremento global. El contrato indexa el recuento por esa
      //    posición y rechaza cualquiera >= candidateCount.
      //
      // El puerto envía y espera el recibo. Los errores de ethers suben sin
      // envolver: el catch de abajo los clasifica por subcadena y por `code`.
      const { txHash, blockNumber } = await port.castVote(
        election.election_id_blockchain,
        nullifier,
        Number(candidato.position),
      );

      console.log(`Vote registered in transaction: ${txHash}`);

      // Record audit entry. Only mark vote_attempts as 'confirmed' if this INSERT
      // succeeds. If it fails, the row stays 'pending' so cleanupStaleVoteAttempts
      // can reconstruct the full nullifier_audit row from the VoteCast event.
      let auditInserted = false;
      try {
        await db.exec(
          `INSERT INTO nullifier_audit
             (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id, vote_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'chain')`,
          [
            decoded.userId,
            electionId,
            nullifier,
            String(candidateId),
            txHash,
            blockNumber,
            candidateId,
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

      // Aquí había un camino (BC-22) que, cuando la transacción fallaba con
      // "election does not exist" y el correo era @vtb.demo, guardaba el voto
      // con otro hash inventado y respondía "Voto registrado exitosamente en el
      // sistema", sin isDemo y sin ninguna señal de que no estaba en la cadena.
      // Un voto fuera de cadena presentado como voto en cadena. Eliminado: si la
      // elección no está en el contrato, es un 503 para todo el mundo.
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
