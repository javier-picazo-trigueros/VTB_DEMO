import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
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
// ============================================================
// CORS CONFIGURATION (BLOQUE 2.4)
// ============================================================
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173']; // Default para desarrollo
app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (Postman, curl) solo en desarrollo
        if (!origin && process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        // En producción, rechazar requests sin origin
        if (!origin) {
            return callback(new Error('CORS: origen requerido en producción'));
        }
        // Validar que el origin está permitido
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // Rechazar origin no permitido
        callback(new Error(`CORS: origen no permitido: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 horas
}));
// Middleware
app.use(express.json());
// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// ============================================================
// RATE LIMITING (BLOQUE 2.3)
// ============================================================
// Rate limit específico para login: 5 intentos en 15 minutos (producción)
// En desarrollo: permitir más intentos para testing
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 5 : 100, // 5 en prod, 100 en dev
    message: {
        error: 'Demasiados intentos de login. Inténtalo en 15 minutos.'
    },
    standardHeaders: true, // Retorna rate limit info en el header `RateLimit-*`
    legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
    skip: (req) => {
        // En desarrollo, saltarse rate limit completamente para facilitar testing
        return process.env.NODE_ENV === 'development';
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Demasiados intentos de login. Inténtalo más tarde.',
            retryAfter: req.rateLimit?.resetTime,
        });
    },
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
// Health check (BLOQUE 4.1: Para Docker healthcheck)
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        service: "VTB Backend",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        service: "VTB Backend",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Rutas de autenticación
// Aplicar rate limit al login
app.post("/auth/login", loginLimiter);
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