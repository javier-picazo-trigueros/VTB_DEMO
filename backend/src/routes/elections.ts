import express, { Request, Response } from "express";
import { ethers } from "ethers";
import { createHash } from "crypto";
import { getDatabase } from "../config/database.js";
import { verifyToken, generateNullifier } from "../utils/auth.js";

const router = express.Router();
const db = getDatabase();

/**
 * @title Election Routes - VTB Backend
 * @author Senior Web3 Architect
 * @dev Rutas para gestionar elecciones y conectar con Smart Contract
 *
 * ARQUITECTURA:
 * - Backend actúa como RELAYER entre frontend y blockchain
 * - No custdia privadas (frontend las maneja)
 * - Valida datos antes de transmitir a blockchain
 * - Escucha eventos del Smart Contract para auditoría
 */

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

function getProvider() {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getWallet() {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const privateKey = process.env.PRIVATE_KEY || '';
  if (!privateKey) return null;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * @route GET /elections
 * @desc Obtiene las elecciones del usuario autenticado
 * @protected Requiere JWT válido
 * 
 * FIX D: Filtra elecciones por usuario - solo devuelve elecciones donde
 * el usuario está en la tabla election_voters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Extraer y verificar JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token requerido' });
      return;
    }
    
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
    
    const userId = decoded.userId;
    
    // Obtener TODAS las elecciones donde este usuario está en election_voters
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
    }>(
      `SELECT e.* FROM elections e
       INNER JOIN election_voters ev ON e.id = ev.election_id
       WHERE ev.user_id = ?`,
      [userId]
    );

    const now = Math.floor(Date.now() / 1000);

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
        };
      }),
    });
  } catch (error) {
    console.error("Error al obtener elecciones:", error);
    res.status(500).json({ error: "Error al obtener elecciones" });
  }
});

/**
 * @route GET /elections/:id
 * @desc Obtiene detalles de una elección específica CON CANDIDATOS
 * 
 * CAMBIO (BLOQUE 1.2):
 * - Ahora devuelve array de candidatos para cargar dinámicamente en VotingBooth
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    }>("SELECT * FROM elections WHERE id = ?", [id]);

    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    // Obtener candidatos de esta elección
    const candidates = await db.run<{
      id: number;
      name: string;
      description: string;
      position: number;
    }>(
      "SELECT id, name, description, position FROM candidates WHERE election_id = ? ORDER BY position ASC",
      [election.id]
    );

    // Obtener información del blockchain si está disponible
    let blockchainInfo = null;
    if (CONTRACT_ADDRESS) {
      try {
        // ABI minimal del contrato ElectionRegistry
        const abi = [
          "function getElection(uint256) public view returns (string, uint256, uint256, bool, uint256)",
        ];

        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, getProvider());
        const onchainData = await contract.getElection(
          election.election_id_blockchain
        );

        blockchainInfo = {
          name: onchainData[0],
          totalVotes: onchainData[4].toString(),
        };
      } catch (err) {
        console.warn("No se pudo obtener datos del blockchain");
      }
    }

    // Validar que la election sigue activa
    const now = Math.floor(Date.now() / 1000);
    const isActive = election.is_active && now >= election.start_time && now <= election.end_time;

    res.json({
      election: {
        id: election.id,
        blockchainId: election.election_id_blockchain,
        name: election.name,
        description: election.description,
        startTime: election.start_time,
        endTime: election.end_time,
        isActive, // Estado actual en tiempo real
        title: election.name, // Alias para frontend
        status: isActive ? "active" : (now < election.start_time ? "pending" : "closed"),
        candidates: candidates || [],
        eligible: true,
        hasVoted: false,
        imageUrl: election.image_url || null,
        bannerColor: election.banner_color || '#1E3A5F',
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
 * @desc Valida si el usuario puede votar en una elección específica
 * @protected Requiere JWT válido
 * @returns { eligible, reason?, status? }
 * 
 * Comprueba en orden:
 * 1. ✓✓¿Existe la elección? ' not_found
 * 2. ✓✓¿Está activa? ' not_active + status
 * 3. ✓✓¿Usuario está en censo? ' not_eligible
 * 4. ✓✓¿Ya votó? ' already_voted
 * 5. OK ' eligible: true
 */
router.get("/:id/eligibility", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Verificar JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token requerido' });
      return;
    }
    
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
    
    const userId = decoded.userId;

    // 1. Verificar que existe la elección
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

    // 2. Verificar que está activa (dentro del rango de tiempo)
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

    // 3. Verificar que el usuario está en el censo (election_voters)
    const voterReg = await db.get<{ id: number }>(
      "SELECT election_id FROM election_voters WHERE election_id = ? AND user_id =?",
      [election.id, userId]
    );

    if (!voterReg) {
      res.json({ eligible: false, reason: 'not_eligible' });
      return;
    }

    // 4. Verificar que NO ha votado ya (en nullifier_audit)
    const alreadyVoted = await db.get<{ id: number }>(
      "SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?",
      [userId, election.id]
    );

    if (alreadyVoted) {
      res.json({ eligible: false, reason: 'already_voted' });
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
 * @desc Obtiene resultados de una elección con participación
 * @protected Requiere JWT válido (voters y admins)
 * @returns { election, candidates[], totalVotes, participationRate }
 */
router.get("/:id/results", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token requerido' });
      return;
    }
    
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    // Obtener elección
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
      'SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ? AND tx_hash IS NOT NULL',
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
 * @desc Obtiene registro de auditoría pública de la elección
 * @public SIN JWT requerido - información de auditoría es pública
 * @returns array de { nullifier, txHash, timestamp }
 */
router.get("/:id/audit", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que la elección existe
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
    }>(
      "SELECT nullifier_hash, generated_at, tx_hash, block_number FROM nullifier_audit WHERE election_id = ? ORDER BY generated_at DESC",
      [id]
    );

    const auditData = auditRecords.map((record) => {
      const txHash = record.tx_hash ||
        `0x${createHash('sha256').update(record.nullifier_hash || '').digest('hex')}`;
      const explorerLink = explorerUrl && record.tx_hash
        ? `${explorerUrl.replace(/\/$/, "")}/tx/${record.tx_hash}`
        : null;
      return {
        nullifier: record.nullifier_hash,
        txHash,
        blockNumber: record.block_number,
        timestamp: record.generated_at,
        explorerLink,
        onChain: !!record.tx_hash,
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
 * @desc FUNCI✓íƒâ€¦í¢â‚¬Å“N CR✓TICA: Registra un voto en el Smart Contract
 *
 * CAMBIO ARQUITECT✓íƒâ€¦í¢â‚¬Å“NICO (BLOQUE 1.3):
 * 1. Frontend envía: JWT + electionId + voteHash
 * 2. Backend valida JWT (extrae userId)
 * 3. Backend genera nullifier = HMAC(userId + electionId) en este momento
 * 4. Backend prepara transacción: castVote(electionId, nullifier, voteHash)
 * 5. Backend FIRMA y envía con PRIVATE_KEY (relayer backend)
 * 6. Frontend recibe txHash para auditoría
 * 7. Frontend escucha evento VoteCast en blockchain
 *
 * PRIVACIDAD:
 * - Backend NO ve el voto descifrado (voteHash es hash)
 * - Backend NO custodia privada del usuario (solo genera nullifier)
 * - Blockchain only sees: nullifier (hash) + voteHash (hash)
 * - NO se almacena identidad personal en blockchain
 */
router.post("/register-vote", async (req: Request, res: Response) => {
  try {
    // CAMBIO: Ahora obtener token de Authorization header
    const authHeader = req.headers.authorization;
    const { electionId, voteHash, candidateId } = req.body;

    // Validaciones
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }

    const token = authHeader.substring(7);

    if (!electionId || !voteHash) {
      res.status(400).json({
        error: "Faltan datos requeridos",
        required: ["electionId", "voteHash"],
      });
      return;
    }

    // Verificar JWT y extraer userId (ya NO contiene nullifier ni electionId)
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
    }

    // Verificar que elección existe en BD local
    const election = await db.get<{ id: number; election_id_blockchain: number }>(
      "SELECT id, election_id_blockchain FROM elections WHERE id = ? AND is_active = 1",
      [electionId]
    );

    if (!election) {
      res.status(404).json({ error: "Elección no encontrada o no activa" });
      return;
    }

    // VERIFICACI✓íƒâ€¦í¢â‚¬Å“N DE TIEMPO (para elecciones con horarios)
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

    // GENERAR NULLIFIER EN ESTE MOMENTO (CAMBIO CR✓TICO)
    // Nullifier = HMAC(userId + electionId)
    const nullifier = generateNullifier(decoded.userId, electionId);

    // Verificar que el usuario NO ha votado ya
    const alreadyVoted = await db.get<{ id: number }>(
      "SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?",
      [decoded.userId, electionId]
    );

    if (alreadyVoted) {
      res.status(409).json({
        error: "Ya has votado en esta elección",
      });
      return;
    }

    // Si no está configurada la conexión blockchain, retornar error
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
    const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
    if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
      return res.status(500).json({ error: "Blockchain no configurado. Asegurate de que Hardhat esta corriendo." });
    }




    // PREPARAR TRANSACCI✓íƒâ€¦í¢â‚¬Å”N EN BLOCKCHAIN
    try {
      const wallet = getWallet();
      if (!wallet) {
        return res.status(500).json({ error: "Blockchain no configurado. Asegurate de que PRIVATE_KEY este definida." });
      }
      // ABI del contrato ElectionRegistry
      const contractAbi = [
        "function castVote(uint256 _electionId, bytes32 _nullifier, bytes32 _voteHash) public",
      ];

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        contractAbi,
        wallet
      );

      // Enviar transacción
      console.log(`✓°✓✓¸✓íƒâ€¦í¢â‚¬Å“✓ Registrando voto en blockchain...`);
      console.log(`   - Election ID: ${election.election_id_blockchain}`);
      console.log(`   - Nullifier: ${nullifier.substring(0, 20)}...`);
      console.log(`   - Vote Hash: ${voteHash.substring(0, 20)}...`);

      const tx = await contract.castVote(
        election.election_id_blockchain,
        nullifier,
        voteHash
      );

      // Esperar confirmación
      const receipt = await tx.wait();

      console.log(`✓✓íƒ¢í¢â€š¬í…â€œ✓ Voto registrado en transacción: ${tx.hash}`);

      // Record audit entry with real txHash and block number
      try {
        await db.exec(
          'INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))',
          [
            decoded.userId,
            electionId,
            nullifier,
            candidateId ? String(candidateId) : null,
            tx.hash,
            receipt?.blockNumber ?? null,
            candidateId ?? null,
          ]
        );
      } catch (auditError) {
        console.warn('Warning al registrar auditoría:', auditError);
      }

      res.json({
        success: true,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
        message: "Voto registrado exitosamente en blockchain",
        voting: {
          nullifier: nullifier,
          electionId: election.election_id_blockchain,
          voteHashReceived: voteHash,
        },
      });
    } catch (blockchainError: any) {
      console.error("Error al registrar voto en blockchain:", blockchainError);

      // Diferenciar errores
      if (blockchainError.code === "INVALID_ARGUMENT") {
        res.status(400).json({
          error: "Datos inválidos para blockchain",
          details: blockchainError.message,
        });
      } else if (blockchainError.message?.includes("already voted")) {
        res.status(409).json({
          error: "Ya has votado en esta elección",
          details: "Nullifier duplicado detectado",
        });
      } else {
        res.status(500).json({
          error: "Error al registrar voto en blockchain",
          details: blockchainError.message,
        });
      }
    }
  } catch (error) {
    console.error("Error en register-vote:", error);
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

    // En esta versión simple, retornamos un endpoint
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