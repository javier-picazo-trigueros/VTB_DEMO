import dotenv from "dotenv";
dotenv.config({ quiet: true });
import express, { Express, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { getDatabase } from "./config/database.js";
import { syncElectionsToBlockchain } from "./scripts/syncElections.js";
import { verifyToken, validateCsrfToken, COOKIE_NAME_ACCESS, COOKIE_NAME_CSRF } from "./utils/auth.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import electionRoutes from "./routes/elections.js";
import adminRoutes from "./routes/admin.js";
import registrationRoutes from "./routes/registration.js";
import organizationRoutes from "./routes/organizations.js";

const app: Express = express();

// ============================================================
// SECURITY HEADERS (helmet)
// ============================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", 'https://eth-sepolia.g.alchemy.com', 'https://sepolia.etherscan.io'],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false,
}));

// ============================================================
// COOKIE PARSER — must be before any middleware that reads cookies
// ============================================================

app.use(cookieParser());

// ============================================================
// CORS CONFIGURATION
// ============================================================

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    // Server-to-server or same-origin requests have no Origin header.
    if (!origin) return callback(null, true);

    const configured = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const allowed = [...configured, ...DEV_ORIGINS];

    if (allowed.some(a => a !== '*' && origin === a)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked: ${origin}`);
    return callback(new Error(`Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 86400,
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================
// MUST-CHANGE-PASSWORD GUARD
// Blocks all requests (except login/me/change-password) for
// users whose must_change_password = 1.
// Reads JWT from Authorization header OR from the vtb_auth httpOnly cookie.
// ============================================================

const ALLOWED_WHILE_MUST_CHANGE = new Set([
  'POST /auth/login',
  'GET /auth/me',
  'PATCH /auth/change-password',
  'GET /health',
  'GET /api/health',
  'GET /',
]);

/** Extract a raw JWT from the httpOnly access cookie. */
function extractToken(req: any): string | null {
  const cookieToken = req.cookies?.[COOKIE_NAME_ACCESS];
  if (typeof cookieToken === 'string' && cookieToken) return cookieToken;
  return null;
}

app.use(async (req: any, res: any, next: any) => {
  const routeKey = `${req.method} ${req.path}`;
  if (ALLOWED_WHILE_MUST_CHANGE.has(routeKey)) return next();

  const raw = extractToken(req);
  if (!raw) return next();

  const decoded = verifyToken(raw);
  if (!decoded?.userId) return next();

  try {
    const db = getDatabase();
    const user = await db.get<{ must_change_password: number }>(
      'SELECT must_change_password FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (user?.must_change_password) {
      return res.status(403).json({
        error: 'Debes cambiar tu contraseña antes de continuar',
        code: 'MUST_CHANGE_PASSWORD',
      });
    }
  } catch {
    // If DB lookup fails, let the route handler deal with it
  }

  next();
});

// ============================================================
// CSRF PROTECTION
// Applies to state-changing requests that authenticate via cookie.
// Requests using Authorization: Bearer are exempt (custom headers
// cannot be sent cross-origin without CORS preflight, which we reject).
// ============================================================

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set(['/auth/login', '/auth/refresh']);

app.use((req: any, res: any, next: any) => {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  // Enforce CSRF on all state-changing requests that carry the access cookie.
  const usingCookie = req.cookies?.[COOKIE_NAME_ACCESS];
  if (!usingCookie) return next();

  const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
  const csrfCookie = req.cookies?.[COOKIE_NAME_CSRF] as string | undefined;

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: 'CSRF token inválido', code: 'CSRF_MISMATCH' });
  }

  // Additional server-side validation: the cookie value must match what the
  // server would derive for the current user (prevents cookie stuffing).
  const decoded = verifyToken(req.cookies[COOKIE_NAME_ACCESS]);
  if (decoded && !validateCsrfToken(csrfCookie, decoded.userId, decoded.email)) {
    return res.status(403).json({ error: 'CSRF token inválido', code: 'CSRF_INVALID' });
  }

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

// Per-user vote limiter: 3 per minute keyed on authenticated userId.
// requireAuth must have already set req.user before this runs.
// In test mode the limit is lifted so sequential tests don't exhaust the quota.
const voteUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000_000 : 3,
  keyGenerator: (req: any) => `vote:user:${req.user?.userId ?? 'anon'}`,
  message: { error: 'Demasiados intentos de voto. Espera un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// IP backstop — high enough to not block a NAT'd campus (typically
// hundreds of users behind one public IP), low enough to stop scripted floods.
const voteIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000_000 : 500,
  keyGenerator: (req: any) => `vote:ip:${req.ip ?? 'unknown'}`,
  message: { error: 'Demasiados intentos de voto desde esta red. Espera un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// ROUTES
// ============================================================

// S15 fix: un solo health check. /api/health era alias duplicado.
app.get(["/health", "/api/health"], (_req, res) => {
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
       JOIN users u ON nullifier_audit.user_id = u.id
       WHERE nullifier_audit.tx_hash IS NOT NULL AND nullifier_audit.tx_hash != ''
       AND nullifier_audit.block_number IS NOT NULL
       AND u.email NOT LIKE '%@vtb.demo'`
    );
    res.json({
      totalElections: totalElections?.count || 0,
      totalVotes: totalVotes?.count || 0,
      activeInstitutions: activeInstitutions?.count || 0,
      blockchainTransactions: blockchainTransactions?.count || 0,
    });
  } catch (err: any) {
    console.error('Error getting stats:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/admin/sync-blockchain', requireAdmin, async (req: any, res: Response) => {
  res.json({ message: 'Sync started', status: 'running' });
  syncElectionsToBlockchain().catch(err => {
    console.error('Manual sync error:', err);
  });
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
       JOIN users u ON na.user_id = u.id
       WHERE u.email NOT LIKE '%@vtb.demo'
       AND na.block_number IS NOT NULL
       ORDER BY na.generated_at DESC
       LIMIT 20`
    );
    res.json({ transactions: records || [] });
  } catch (err: any) {
    console.error('Error getting audit records:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post("/auth/login", loginLimiter);
app.use("/auth", authRoutes);

// requireAuth runs first so req.user is available to voteUserLimiter's keyGenerator.
app.post("/api/elections/register-vote", requireAuth, voteIpLimiter, voteUserLimiter);
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
  res.status(500).json({ error: "Error interno del servidor" });
});

export { app };
