import express from "express";
import cors from "cors";
import { getDatabase } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import electionRoutes from "./routes/elections.js";
import adminRoutes from "./routes/admin.js";
import registrationRoutes from "./routes/registration.js";
/**
 * @title VTB Backend - Express Server
 * @author Senior Web3 Architect
 * @dev Servidor Express que actúa como relayer entre Frontend y Blockchain
 *
 * ARQUITECTURA COMPLETA:
 * =====================
 *
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │           Frontend React (Vite + ethers.js)                │
 *  └────────────────────┬────────────────────────────────────────┘
 *                       │
 *           HTTP/REST API (Express)
 *           - POST /auth/login (genera nullifier)
 *           - POST /elections/register-vote (registra en blockchain)
 *           - WebSocket /ws (escucha eventos blockchain)
 *                       │
 *       ┌───────────────┼───────────────┐
 *       │               │               │
 *   ┌───▼───────────┐ ┌─▼──────────┐ ┌─▼──────────────┐
 *   │  SQLite DB    │ │  Provider  │ │  Smart Contract│
 *   │               │ │  Hardhat   │ │  ElectionReg. │
 *   │ Users         │ │  RPC       │ │  (Solidity)   │
 *   │ Elections     │ │ :8545      │ │               │
 *   │ Audit Logs    │ │            │ │  On-chain:    │
 *   │               │ │            │ │  - Votes      │
 *   │ Off-chain:    │ │  Off-chain │ │  - Events     │
 *   │ PII Storage   │ │  Connection│ │  - Auditoría  │
 *   └───────────────┘ └────────────┘ └────────────────┘
 *
 * FLOW DE VOTACIÓN PASO A PASO:
 * =============================
 *
 * 1. REGISTRO & LOGIN (Web2):
 *    POST /auth/register { email, password, name, student_id }
 *        → Registra usuario en SQLite
 *        → Valida eligibilidad de votación
 *
 *    POST /auth/login { email, password, electionId }
 *        → Valida credenciales contra SQLite
 *        → Genera nullifier = HMAC(user_id, election_id, secret)
 *        → Retorna JWT con nullifier incluido
 *
 * 2. PREPARACIÓN DE VOTO:
 *    - Frontend recibe JWT con nullifier
 *    - Frontend genera voto en local: voteHash = SHA256(opción + salt)
 *    - Frontend NUNCA envía opción de voto (solo hash cifrado)
 *
 * 3. REGISTRO DE VOTO (Web2 → Web3):
 *    POST /elections/register-vote {
 *      token: "JWT con nullifier",
 *      electionId: 1,
 *      voteHash: "0x1a2b3c..."
 *    }
 *
 *    Backend hace:
 *    a) Verifica JWT (valida que usuario está autenticado)
 *    b) Extrae nullifier del JWT
 *    c) Valida que elección existe y está activa
 *    d) Prepara transacción: castVote(electionId, nullifier, voteHash)
 *    e) FIRMA transacción con private key del servidor (relayer)
 *    f) ENVÍA a blockchain (Hardhat RPC)
 *    g) Retorna txHash para que frontend escuche evento
 *
 * 4. AUDITORÍA EN BLOCKCHAIN (Web3):
 *    Smart Contract emite: VoteCast(electionId, nullifier, voteHash, timestamp)
 *
 *    Frontend escucha evento → muestra en Live Feed
 *    Información mostrada:
 *    - Nullifier (hash anónimo, no identifica a nadie)
 *    - VoteHash (hash cifrado, no se conoce qué se votó)
 *    - Transacción Hash (auditoría pública)
 *
 * SEGURIDAD & PRIVACIDAD:
 * =======================
 * ✅ PII nunca va a blockchain (email, nombre, ID estudiante)
 * ✅ Voto nunca se conoce en claro (solo voteHash)
 * ✅ Identidad de votante protegida (solo nullifier, que es hash)
 * ✅ Double-voting prevenido (nullifier único por usuario)
 * ✅ Blockchain es auditable públicamente (eventos transparentes)
 * ✅ Backend no custodia privadas de usuario (frontend usa ethers.js)
 * ✅ Deterministic nullifier (mismo user = mismo nullifier para elección)
 */
const app = express();
const PORT = process.env.PORT || 3001;
// Middleware
app.use(cors());
app.use(express.json());
// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// ============================================================
// INICIALIZACIÓN DE BASE DE DATOS
// ============================================================
async function initializeDatabase() {
    try {
        const db = getDatabase();
        await db.initialize();
        console.log("✅ Base de datos SQLite inicializada");
    }
    catch (error) {
        console.error("❌ Error al inicializar BD:", error);
        process.exit(1);
    }
}
// ============================================================
// RUTAS
// ============================================================
// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        service: "VTB Backend",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Rutas de autenticación
app.use("/auth", authRoutes);
// Rutas de elecciones
app.use("/elections", electionRoutes);
// Rutas de administración
app.use("/admin", adminRoutes);
// Rutas de registro
app.use("/registration", registrationRoutes);
// Ruta raíz con documentación
app.get("/", (req, res) => {
    res.json({
        name: "VTB Backend API",
        version: "1.0.0",
        description: "Express backend que actúa como relayer hacia blockchain",
        endpoints: {
            auth: {
                register: "POST /auth/register",
                login: "POST /auth/login",
                verify: "GET /auth/verify",
            },
            elections: {
                list: "GET /elections",
                getById: "GET /elections/:id",
                registerVote: "POST /elections/register-vote",
                voteFeed: "GET /elections/:electionId/vote-feed",
            },
            system: {
                health: "GET /health",
            },
        },
        documentation: {
            architecture: "Ver ARCHITECTURE.md para diagrama completo de la solución hybrid Web2/Web3",
            api: "Ver API_DOCUMENTATION.md para detalles de cada endpoint",
        },
    });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Error no manejado:", err);
    res.status(500).json({
        error: "Error interno del servidor",
        message: err.message,
    });
});
// ============================================================
// STARTUP
// ============================================================
async function start() {
    try {
        // Inicializar BD
        await initializeDatabase();
        // Revisar configuración de blockchain
        if (!process.env.CONTRACT_ADDRESS || !process.env.PRIVATE_KEY) {
            console.warn("⚠️  ADVERTENCIA: CONTRACT_ADDRESS o PRIVATE_KEY no configurados");
            console.warn("   Las transacciones a blockchain no funcionarán");
            console.warn("   Configura en .env file o variables de entorno");
        }
        else {
            console.log(`✅ Blockchain configurado: ${process.env.CONTRACT_ADDRESS}`);
        }
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log("\n" + "=".repeat(60));
            console.log("🚀 VTB Backend iniciado");
            console.log("=".repeat(60));
            console.log(`📍 Servidor: http://localhost:${PORT}`);
            console.log(`📊 Documentación: http://localhost:${PORT}/`);
            console.log(`💚 Health check: http://localhost:${PORT}/health`);
            console.log("=".repeat(60) + "\n");
        });
    }
    catch (error) {
        console.error("❌ Error al iniciar servidor:", error);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map