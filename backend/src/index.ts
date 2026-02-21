import dotenv from "dotenv";
dotenv.config();
import express, { Express, Response } from "express";
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
 * @dev Servidor Express que actÃƒÂºa como relayer entre Frontend y Blockchain
 *
 * ARQUITECTURA COMPLETA:
 * =====================
 *
 *  Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
 *  Ã¢â€â€š           Frontend React (Vite + ethers.js)                Ã¢â€â€š
 *  Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
 *                       Ã¢â€â€š
 *           HTTP/REST API (Express)
 *           - POST /auth/login (genera nullifier)
 *           - POST /elections/register-vote (registra en blockchain)
 *           - WebSocket /ws (escucha eventos blockchain)
 *                       Ã¢â€â€š
 *       Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
 *       Ã¢â€â€š               Ã¢â€â€š               Ã¢â€â€š
 *   Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â Ã¢â€Å’Ã¢â€â‚¬Ã¢â€“Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â Ã¢â€Å’Ã¢â€â‚¬Ã¢â€“Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
 *   Ã¢â€â€š  SQLite DB    Ã¢â€â€š Ã¢â€â€š  Provider  Ã¢â€â€š Ã¢â€â€š  Smart ContractÃ¢â€â€š
 *   Ã¢â€â€š               Ã¢â€â€š Ã¢â€â€š  Hardhat   Ã¢â€â€š Ã¢â€â€š  ElectionReg. Ã¢â€â€š
 *   Ã¢â€â€š Users         Ã¢â€â€š Ã¢â€â€š  RPC       Ã¢â€â€š Ã¢â€â€š  (Solidity)   Ã¢â€â€š
 *   Ã¢â€â€š Elections     Ã¢â€â€š Ã¢â€â€š :8545      Ã¢â€â€š Ã¢â€â€š               Ã¢â€â€š
 *   Ã¢â€â€š Audit Logs    Ã¢â€â€š Ã¢â€â€š            Ã¢â€â€š Ã¢â€â€š  On-chain:    Ã¢â€â€š
 *   Ã¢â€â€š               Ã¢â€â€š Ã¢â€â€š            Ã¢â€â€š Ã¢â€â€š  - Votes      Ã¢â€â€š
 *   Ã¢â€â€š Off-chain:    Ã¢â€â€š Ã¢â€â€š  Off-chain Ã¢â€â€š Ã¢â€â€š  - Events     Ã¢â€â€š
 *   Ã¢â€â€š PII Storage   Ã¢â€â€š Ã¢â€â€š  ConnectionÃ¢â€â€š Ã¢â€â€š  - AuditorÃƒÂ­a  Ã¢â€â€š
 *   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
 *
 * FLOW DE VOTACIÃƒâ€œN PASO A PASO:
 * =============================
 *
 * 1. REGISTRO & LOGIN (Web2):
 *    POST /auth/register { email, password, name, student_id }
 *        Ã¢â€ â€™ Registra usuario en SQLite
 *        Ã¢â€ â€™ Valida eligibilidad de votaciÃƒÂ³n
 *
 *    POST /auth/login { email, password, electionId }
 *        Ã¢â€ â€™ Valida credenciales contra SQLite
 *        Ã¢â€ â€™ Genera nullifier = HMAC(user_id, election_id, secret)
 *        Ã¢â€ â€™ Retorna JWT con nullifier incluido
 *
 * 2. PREPARACIÃƒâ€œN DE VOTO:
 *    - Frontend recibe JWT con nullifier
 *    - Frontend genera voto en local: voteHash = SHA256(opciÃƒÂ³n + salt)
 *    - Frontend NUNCA envÃƒÂ­a opciÃƒÂ³n de voto (solo hash cifrado)
 *
 * 3. REGISTRO DE VOTO (Web2 Ã¢â€ â€™ Web3):
 *    POST /elections/register-vote {
 *      token: "JWT con nullifier",
 *      electionId: 1,
 *      voteHash: "0x1a2b3c..."
 *    }
 *
 *    Backend hace:
 *    a) Verifica JWT (valida que usuario estÃƒÂ¡ autenticado)
 *    b) Extrae nullifier del JWT
 *    c) Valida que elecciÃƒÂ³n existe y estÃƒÂ¡ activa
 *    d) Prepara transacciÃƒÂ³n: castVote(electionId, nullifier, voteHash)
 *    e) FIRMA transacciÃƒÂ³n con private key del servidor (relayer)
 *    f) ENVÃƒÂA a blockchain (Hardhat RPC)
 *    g) Retorna txHash para que frontend escuche evento
 *
 * 4. AUDITORÃƒÂA EN BLOCKCHAIN (Web3):
 *    Smart Contract emite: VoteCast(electionId, nullifier, voteHash, timestamp)
 *    
 *    Frontend escucha evento Ã¢â€ â€™ muestra en Live Feed
 *    InformaciÃƒÂ³n mostrada:
 *    - Nullifier (hash anÃƒÂ³nimo, no identifica a nadie)
 *    - VoteHash (hash cifrado, no se conoce quÃƒÂ© se votÃƒÂ³)
 *    - TransacciÃƒÂ³n Hash (auditorÃƒÂ­a pÃƒÂºblica)
 *
 * SEGURIDAD & PRIVACIDAD:
 * =======================
 * Ã¢Å“â€¦ PII nunca va a blockchain (email, nombre, ID estudiante)
 * Ã¢Å“â€¦ Voto nunca se conoce en claro (solo voteHash)
 * Ã¢Å“â€¦ Identidad de votante protegida (solo nullifier, que es hash)
 * Ã¢Å“â€¦ Double-voting prevenido (nullifier ÃƒÂºnico por usuario)
 * Ã¢Å“â€¦ Blockchain es auditable pÃƒÂºblicamente (eventos transparentes)
 * Ã¢Å“â€¦ Backend no custodia privadas de usuario (frontend usa ethers.js)
 * Ã¢Å“â€¦ Deterministic nullifier (mismo user = mismo nullifier para elecciÃƒÂ³n)
 */

const app: Express = express();
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
    
    // En producciÃƒÂ³n, rechazar requests sin origin
    if (!origin) {
      return callback(new Error('CORS: origen requerido en producciÃƒÂ³n'));
    }
    
    // Validar que el origin estÃƒÂ¡ permitido
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

// Rate limit especÃƒÂ­fico para login: 5 intentos en 15 minutos (producciÃƒÂ³n)
// En desarrollo: permitir mÃƒÂ¡s intentos para testing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'production' ? 5 : 100, // 5 en prod, 100 en dev
  message: {
    error: 'Demasiados intentos de login. IntÃƒÂ©ntalo en 15 minutos.'
  },
  standardHeaders: true, // Retorna rate limit info en el header `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
  skip: (req: any) => {
    // En desarrollo, saltarse rate limit completamente para facilitar testing
    return process.env.NODE_ENV === 'development';
  },
  handler: (req: any, res: any) => {
    res.status(429).json({
      error: 'Demasiados intentos de login. IntÃƒÂ©ntalo mÃƒÂ¡s tarde.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

// ============================================================
// INICIALIZACIÃƒâ€œN DE BASE DE DATOS
// ============================================================

async function initializeDatabase() {
  try {
    const db = getDatabase();
    await db.initialize();
    console.log("Ã¢Å“â€¦ Base de datos SQLite inicializada");
  } catch (error) {
    console.error("Ã¢ÂÅ’ Error al inicializar BD:", error);
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

// Rutas de autenticaciÃƒÂ³n
// Aplicar rate limit al login
app.post("/auth/login", loginLimiter);
app.use("/auth", authRoutes);

// Rutas de elecciones
app.use("/api/elections", electionRoutes);

// Rutas de administraciÃƒÂ³n
app.use("/admin", adminRoutes);

// Rutas de registro
app.use("/registration", registrationRoutes);

// Ruta raÃƒÂ­z con documentaciÃƒÂ³n
app.get("/", (req: any, res: Response) => {
  res.json({
    name: "VTB Backend API",
    version: "1.0.0",
    description: "Express backend que actÃƒÂºa como relayer hacia blockchain",
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
      architecture:
        "Ver ARCHITECTURE.md para diagrama completo de la soluciÃƒÂ³n hybrid Web2/Web3",
      api: "Ver API_DOCUMENTATION.md para detalles de cada endpoint",
    },
  });
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
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

    // Revisar configuraciÃƒÂ³n de blockchain
    if (!process.env.CONTRACT_ADDRESS || !process.env.PRIVATE_KEY) {
      console.warn(
        "Ã¢Å¡Â Ã¯Â¸Â  ADVERTENCIA: CONTRACT_ADDRESS o PRIVATE_KEY no configurados"
      );
      console.warn("   Las transacciones a blockchain no funcionarÃƒÂ¡n");
      console.warn("   Configura en .env file o variables de entorno");
    } else {
      console.log(
        `Ã¢Å“â€¦ Blockchain configurado: ${process.env.CONTRACT_ADDRESS}`
      );
    }

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("Ã°Å¸Å¡â‚¬ VTB Backend iniciado");
      console.log("=".repeat(60));
      console.log(`Ã°Å¸â€œÂ Servidor: http://localhost:${PORT}`);
      console.log(`Ã°Å¸â€œÅ  DocumentaciÃƒÂ³n: http://localhost:${PORT}/`);
      console.log(`Ã°Å¸â€™Å¡ Health check: http://localhost:${PORT}/health`);
      console.log("=".repeat(60) + "\n");
    });
  } catch (error) {
    console.error("Ã¢ÂÅ’ Error al iniciar servidor:", error);
    process.exit(1);
  }
}

start();