import dotenv from "dotenv";
dotenv.config({ quiet: true });
import express, { Express, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { getDatabase } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import electionRoutes from "./routes/elections.js";
import adminRoutes from "./routes/admin.js";
import registrationRoutes from "./routes/registration.js";
import organizationRoutes from "./routes/organizations.js";

const app: Express = express();

// ============================================================
// CORS CONFIGURATION
// ============================================================

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const configuredOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
      : [];

    const defaultOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:4173',
    ];

    const allowedOrigins = [...configuredOrigins, ...defaultOrigins];

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      return callback(null, true);
    }

    console.warn(`CORS rejected origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================
// RATE LIMITING
// ============================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production'
    ? parseInt(process.env.RATE_LIMIT_MAX || '10')
    : 100,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// ROUTES
// ============================================================

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

app.get("/api/org-units", async (req: any, res: Response) => {
  try {
    const db = getDatabase();
    const domain = req.query.domain as string | undefined;
    let units;
    if (domain) {
      units = await db.run(
        `SELECT * FROM org_units WHERE institution_domain = ? OR domain = ?
         ORDER BY unit_type, name`,
        [domain, domain]
      );
    } else {
      units = await db.run(
        'SELECT * FROM org_units ORDER BY institution_domain, unit_type, name'
      );
    }
    res.json({ units: units || [] });
  } catch (error) {
    console.error("Error getting public org units:", error);
    res.status(500).json({ error: "Error getting org units" });
  }
});

app.get('/api/stats', async (req: any, res: Response) => {
  try {
    const db = getDatabase();
    const totalElections = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM elections'
    );
    const totalVotes = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM nullifier_audit'
    );
    const activeInstitutions = await db.get<{ count: number }>(
      `SELECT COUNT(DISTINCT substr(email, instr(email,'@')+1)) as count
       FROM users WHERE role = 'student' AND is_approved = 1`
    );
    const blockchainTransactions = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM nullifier_audit
       WHERE tx_hash IS NOT NULL AND tx_hash != ''`
    );
    res.json({
      totalElections: totalElections?.count || 0,
      totalVotes: totalVotes?.count || 0,
      activeInstitutions: activeInstitutions?.count || 0,
      blockchainTransactions: blockchainTransactions?.count || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit/public', async (req: any, res: Response) => {
  try {
    const db = getDatabase();
    const records = await db.run<any>(
      `SELECT
         substr(na.nullifier_hash, 1, 10) || '...' || substr(na.nullifier_hash, -4) as nullifier_display,
         na.tx_hash,
         na.generated_at,
         e.name as election_name
       FROM nullifier_audit na
       JOIN elections e ON na.election_id = e.id
       ORDER BY na.generated_at DESC
       LIMIT 20`
    );
    res.json({ transactions: records || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/login", loginLimiter);
app.use("/auth", authRoutes);

app.use("/api/elections", electionRoutes);

app.use("/api/organizations", organizationRoutes);

app.use("/admin", adminRoutes);

app.use("/registration", registrationRoutes);

app.get("/api/schools-degrees", async (req: any, res: Response) => {
  try {
    const db = getDatabase();
    const domain = req.query.domain as string | undefined;
    const items = await db.run<any>(
      domain
        ? 'SELECT * FROM schools_and_degrees WHERE institution_domain = ? ORDER BY school_name, degree_name'
        : 'SELECT * FROM schools_and_degrees ORDER BY institution_domain, school_name, degree_name',
      domain ? [domain] : []
    );
    res.json({ schools_degrees: items || [] });
  } catch (error) {
    console.error("Error fetching schools/degrees:", error);
    res.status(500).json({ error: "Error fetching schools and degrees" });
  }
});

app.get("/", (req: any, res: Response) => {
  res.json({
    name: "VTB Backend API",
    version: "1.0.0",
    description: "Express backend que actúa como relayer hacia blockchain",
    endpoints: {
      auth: { register: "POST /auth/register", login: "POST /auth/login", verify: "GET /auth/verify" },
      elections: { list: "GET /elections", getById: "GET /elections/:id", registerVote: "POST /elections/register-vote" },
      system: { health: "GET /health" },
    },
  });
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor", message: err.message });
});

export { app };
