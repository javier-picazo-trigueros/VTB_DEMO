import express from "express";
import { ethers } from "ethers";
import { getDatabase } from "../config/database.js";
import { verifyToken } from "../utils/auth.js";
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
// Configuración de Hardhat Local Node
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
// Provedor a nodo local
const provider = new ethers.JsonRpcProvider(RPC_URL);
/**
 * @route GET /elections
 * @desc Obtiene todas las elecciones disponibles
 */
router.get("/", async (req, res) => {
    try {
        const elections = await db.run("SELECT * FROM elections WHERE is_active = 1");
        res.json({
            elections: elections.map((e) => ({
                id: e.id,
                blockchainId: e.election_id_blockchain,
                name: e.name,
                description: e.description,
                startTime: e.start_time,
                endTime: e.end_time,
                isActive: e.is_active,
            })),
        });
    }
    catch (error) {
        console.error("Error al obtener elecciones:", error);
        res.status(500).json({ error: "Error al obtener elecciones" });
    }
});
/**
 * @route GET /elections/:id
 * @desc Obtiene detalles de una elección específica
 */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const election = await db.get("SELECT * FROM elections WHERE id = ?", [id]);
        if (!election) {
            res.status(404).json({ error: "Elección no encontrada" });
            return;
        }
        // Obtener información del blockchain si está disponible
        let blockchainInfo = null;
        if (CONTRACT_ADDRESS) {
            try {
                // ABI minimal del contrato ElectionRegistry
                const abi = [
                    "function getElection(uint256) public view returns (string, uint256, uint256, bool, uint256)",
                ];
                const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
                const onchainData = await contract.getElection(election.election_id_blockchain);
                blockchainInfo = {
                    name: onchainData[0],
                    totalVotes: onchainData[4].toString(),
                };
            }
            catch (err) {
                console.warn("No se pudo obtener datos del blockchain");
            }
        }
        res.json({
            election: {
                id: election.id,
                blockchainId: election.election_id_blockchain,
                name: election.name,
                description: election.description,
                startTime: election.start_time,
                endTime: election.end_time,
                isActive: election.is_active,
                blockchainInfo,
            },
        });
    }
    catch (error) {
        console.error("Error al obtener elección:", error);
        res.status(500).json({ error: "Error al obtener elección" });
    }
});
/**
 * @route POST /elections/register-vote
 * @desc FUNCIÓN CRÍTICA: Registra un voto en el Smart Contract
 *
 * ARQUITECTURA:
 * 1. Frontend envía: token (JWT con nullifier), electionId, voteHash
 * 2. Backend valida JWT
 * 3. Backend verifica que elección existe y está activa
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
router.post("/register-vote", async (req, res) => {
    try {
        const { token, electionId, voteHash, voteChoice } = req.body;
        // Validaciones
        if (!token || !electionId || !voteHash) {
            res.status(400).json({
                error: "Faltan datos requeridos",
                required: ["token", "electionId", "voteHash"],
            });
            return;
        }
        // Verificar JWT y extraer nullifier
        const decoded = verifyToken(token);
        if (!decoded) {
            res.status(401).json({ error: "Token inválido o expirado" });
            return;
        }
        // Verificar que elección existe en BD local
        const election = await db.get("SELECT id, election_id_blockchain FROM elections WHERE id = ? AND is_active = 1", [electionId]);
        if (!election) {
            res.status(404).json({ error: "Elección no encontrada o no activa" });
            return;
        }
        // VERIFICACIÓN DE TIEMPO (para elecciones con horarios)
        const now = Math.floor(Date.now() / 1000);
        const electionFull = await db.get("SELECT start_time, end_time FROM elections WHERE id = ?", [electionId]);
        if (electionFull &&
            (now < electionFull.start_time || now > electionFull.end_time)) {
            res.status(403).json({ error: "Elección fuera de horario" });
            return;
        }
        // Si no está configurada la conexión blockchain, retornar error
        if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
            res.status(500).json({
                error: "Blockchain no configurado. Asegúrate de que Hardhat está corriendo.",
                hint: "Ejecuta: npx hardhat node",
            });
            return;
        }
        // PREPARAR TRANSACCIÓN EN BLOCKCHAIN
        try {
            // Cargar cuenta con private key (relayer backend)
            const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
            // ABI del contrato ElectionRegistry
            const contractAbi = [
                "function castVote(uint256 _electionId, bytes32 _nullifier, bytes32 _voteHash) public",
            ];
            const contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, wallet);
            // Enviar transacción
            console.log(`📝 Registrando voto en blockchain...`);
            console.log(`   - Election ID: ${election.election_id_blockchain}`);
            console.log(`   - Nullifier: ${decoded.nullifier.substring(0, 20)}...`);
            console.log(`   - Vote Hash: ${voteHash.substring(0, 20)}...`);
            const tx = await contract.castVote(election.election_id_blockchain, decoded.nullifier, voteHash);
            // Esperar confirmación
            const receipt = await tx.wait();
            console.log(`✅ Voto registrado en transacción: ${tx.hash}`);
            // Actualizar nullifier_audit con vote_choice si se proporcionó
            if (voteChoice) {
                try {
                    await db.exec(`
            UPDATE nullifier_audit 
            SET vote_choice = ?
            WHERE user_id = ? AND election_id = ?
          `, [voteChoice, decoded.userId, electionId]);
                }
                catch (updateError) {
                    console.warn("⚠️  Warning al actualizar vote_choice:", updateError);
                }
            }
            res.json({
                success: true,
                txHash: tx.hash,
                blockNumber: receipt?.blockNumber,
                message: "Voto registrado exitosamente en blockchain",
                voting: {
                    nullifier: decoded.nullifier,
                    electionId: election.election_id_blockchain,
                    voteHashReceived: voteHash,
                },
            });
        }
        catch (blockchainError) {
            console.error("Error al registrar voto en blockchain:", blockchainError);
            // Diferenciar errores
            if (blockchainError.code === "INVALID_ARGUMENT") {
                res.status(400).json({
                    error: "Datos inválidos para blockchain",
                    details: blockchainError.message,
                });
            }
            else if (blockchainError.message?.includes("already voted")) {
                res.status(409).json({
                    error: "Ya has votado en esta elección",
                    details: "Nullifier duplicado detectado",
                });
            }
            else {
                res.status(500).json({
                    error: "Error al registrar voto en blockchain",
                    details: blockchainError.message,
                });
            }
            return;
        }
    }
    catch (error) {
        console.error("Error en register-vote:", error);
        res.status(500).json({ error: "Error al registrar voto" });
    }
});
/**
 * @route GET /elections/:electionId/vote-feed
 * @desc Obtiene el feed de votos en tiempo real
 * Usa WebSocket/EventListener para escuchar eventos del blockchain
 */
router.get("/:electionId/vote-feed", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error en vote-feed:", error);
        res.status(500).json({ error: "Error al obtener feed de votos" });
    }
});
export default router;
//# sourceMappingURL=elections.js.map