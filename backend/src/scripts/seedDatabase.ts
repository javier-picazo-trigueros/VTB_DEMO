import { getDatabase } from "../config/database.js";
import { hashPassword, generateNullifier } from "../utils/auth.js";

/**
 * Seed de datos demo para VTB.
 * - Idempotente: no duplica datos si ya existen.
 * - Se llama automáticamente al arrancar la app si la BD está vacía.
 * - También ejecutable manualmente: npm run seed
 */
export async function seedDemoData(): Promise<void> {
  const db = getDatabase();

  // Comprobar si ya hay datos
  const existing = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users");
  if (existing && existing.count > 0) {
    // Asegurarse de que los usuarios demo estén aprobados aunque ya existan
    await db.exec(
      `UPDATE users SET is_approved = 1, approved_at = CURRENT_TIMESTAMP
       WHERE is_approved = 0
         AND email IN (
           'carlos@ufv.es','laura@ufv.es','miguel@ufv.es','sofia@ufv.es',
           'andres@ufv.es','patricia@ufv.es',
           'juan@universidad.edu','maria@universidad.edu',
           'elena@universidad.edu','roberto@universidad.edu',
           'admin@ufv.es','admin@universidad.edu','superadmin@vtb.system'
         )`
    );
    console.log("ℹ️  Base de datos ya tiene datos, omitiendo seed completo.");
    return;
  }

  console.log("\n🌱 Sembrando datos demo en VTB...\n");

  // ============================================================
  // 1. USUARIOS
  // ============================================================
  console.log("👥 Creando usuarios...");

  const usersToCreate = [
    // SUPERADMIN
    { email: "superadmin@vtb.system", name: "Super Admin",           student_id: "SUPERADMIN-001", password: "superadmin123", role: "superadmin", admin_domain: null },
    // ADMINS
    { email: "admin@ufv.es",           name: "Admin UFV",             student_id: "ADMIN-UFV-001",  password: "admin123",      role: "admin",      admin_domain: "ufv.es" },
    { email: "admin@universidad.edu",  name: "Admin Universidad",     student_id: "ADMIN-EDU-001",  password: "admin123",      role: "admin",      admin_domain: "universidad.edu" },
    // UFV STUDENTS
    { email: "carlos@ufv.es",          name: "Carlos López Fernández",   student_id: "UFV-2024-001", password: "demo123", role: "student", admin_domain: null },
    { email: "laura@ufv.es",           name: "Laura Martínez García",    student_id: "UFV-2024-002", password: "demo123", role: "student", admin_domain: null },
    { email: "miguel@ufv.es",          name: "Miguel Torres Sánchez",    student_id: "UFV-2024-003", password: "demo123", role: "student", admin_domain: null },
    { email: "sofia@ufv.es",           name: "Sofía Rodríguez Pérez",    student_id: "UFV-2024-004", password: "demo123", role: "student", admin_domain: null },
    { email: "andres@ufv.es",          name: "Andrés Navarro Gil",       student_id: "UFV-2024-005", password: "demo123", role: "student", admin_domain: null },
    { email: "patricia@ufv.es",        name: "Patricia Vega Moreno",     student_id: "UFV-2024-006", password: "demo123", role: "student", admin_domain: null },
    // EDU STUDENTS
    { email: "juan@universidad.edu",   name: "Juan García Martín",       student_id: "EDU-2024-001", password: "demo123", role: "student", admin_domain: null },
    { email: "maria@universidad.edu",  name: "María López Díaz",         student_id: "EDU-2024-002", password: "demo123", role: "student", admin_domain: null },
    { email: "elena@universidad.edu",  name: "Elena Castro Ruiz",        student_id: "EDU-2024-003", password: "demo123", role: "student", admin_domain: null },
    { email: "roberto@universidad.edu",name: "Roberto Sánchez Leal",     student_id: "EDU-2024-004", password: "demo123", role: "student", admin_domain: null },
  ];

  const userIdMap: Record<string, number> = {};

  for (const u of usersToCreate) {
    try {
      const hash = await hashPassword(u.password);
      const result = await db.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_at, is_eligible)
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 1)`,
        [u.email, hash, u.name, u.student_id, u.role, u.admin_domain]
      );
      userIdMap[u.email] = result.lastID;
      console.log(`  ✅ [${u.role.padEnd(10)}] ${u.email}`);
    } catch (err: any) {
      if (err.message?.includes("UNIQUE")) {
        const row = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [u.email]);
        if (row) userIdMap[u.email] = row.id;
        console.log(`  ℹ️  Ya existe: ${u.email}`);
      } else {
        console.error(`  ❌ Error: ${err.message}`);
      }
    }
  }

  // ============================================================
  // 2. ELECCIONES
  // ============================================================
  console.log("\n🗳️  Creando elecciones...");

  const now   = Math.floor(Date.now() / 1000);
  const past  = (days: number) => now - days * 86400;
  const future= (days: number) => now + days * 86400;

  type CandidateDef = { name: string; description: string };
  type ElectionDef = {
    election_id_blockchain: number;
    name: string;
    description: string;
    start_time: number;
    end_time: number;
    is_active: number;
    domains: string[];
    candidates: CandidateDef[];
  };

  const electionsToCreate: ElectionDef[] = [
    // ── UFV ──────────────────────────────────────────────────────────
    {
      election_id_blockchain: 1,
      name: "Delegado UFV 2026-2027",
      description: "Elige al delegado estudiantil que representará a tu año en el consejo académico.",
      start_time: past(7), end_time: future(60), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Ana Beltrán",    description: "3º Ingeniería Informática — mejora de horarios de laboratorio" },
        { name: "Pablo Méndez",   description: "2º Administración — programa de mentoring entre estudiantes" },
        { name: "Lucía Herrera",  description: "4º Derecho — opciones vegetarianas en la cafetería" },
      ],
    },
    {
      election_id_blockchain: 2,
      name: "Mejora Campus UFV 2026",
      description: "Vota la iniciativa de mejora del campus que quieres ver implementada el próximo semestre.",
      start_time: past(3), end_time: future(30), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Nuevo Polideportivo",    description: "Pabellón moderno con pistas cubiertas y piscina" },
        { name: "Biblioteca 24h",         description: "Ampliar la biblioteca a horario 24/7 en época de exámenes" },
        { name: "Campus Verde",           description: "Paneles solares, puntos de reciclaje y lanzaderas eléctricas" },
        { name: "Upgrade Laboratorios",   description: "Nuevos equipos y realidad virtual en todos los labs" },
      ],
    },
    {
      election_id_blockchain: 3,
      name: "Premio Mejor Profesor UFV 2026",
      description: "Nomina al profesor que más ha impactado tu experiencia académica este curso.",
      start_time: past(10), end_time: future(5), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Prof. García Moreno",  description: "Ingeniería de Sistemas — métodos de enseñanza innovadores" },
        { name: "Prof. Sánchez Vega",   description: "Ciencia de Datos — siempre disponible para tutorías" },
        { name: "Prof. Ortiz Luna",     description: "IA & Machine Learning — conecta teoría con proyectos reales" },
      ],
    },
    {
      election_id_blockchain: 4,
      name: "Elección Finalizada: Renovación Aulas UFV",
      description: "Votación ya cerrada sobre la renovación de aulas. Consulta los resultados.",
      start_time: past(30), end_time: past(5), is_active: 0,
      domains: ["ufv.es"],
      candidates: [
        { name: "Pizarras digitales",     description: "Instalar pizarras táctiles en todas las aulas" },
        { name: "Proyectores 4K",         description: "Reemplazar proyectores actuales por modelos 4K" },
        { name: "Mobiliario flexible",    description: "Mesas y sillas reorganizables para trabajo en grupo" },
      ],
    },
    // ── UNIVERSIDAD.EDU ──────────────────────────────────────────────
    {
      election_id_blockchain: 5,
      name: "Prioridad Investigación EDU 2026",
      description: "Ayuda al comité académico a decidir qué áreas de investigación priorizar.",
      start_time: past(5), end_time: future(45), is_active: 1,
      domains: ["universidad.edu"],
      candidates: [
        { name: "Inteligencia Artificial & Ética", description: "Desarrollo responsable de IA y gobernanza" },
        { name: "Soluciones Cambio Climático",      description: "Energías renovables y estudios de sostenibilidad" },
        { name: "Ingeniería Biomédica",             description: "Prótesis avanzadas e innovación en dispositivos médicos" },
      ],
    },
    {
      election_id_blockchain: 6,
      name: "Presidente Consejo Estudiantil EDU 2026-2027",
      description: "Elige al presidente del Consejo Estudiantil para el año académico 2026-2027.",
      start_time: past(2), end_time: future(20), is_active: 1,
      domains: ["universidad.edu"],
      candidates: [
        { name: "Claudia Fernández", description: "Establecer convenios para prácticas de estudiantes" },
        { name: "Daniel Morales",    description: "Centro de bienestar y salud mental para el campus" },
        { name: "Sara Ibáñez",       description: "Ampliación de la oferta de transporte universitario" },
      ],
    },
    // ── INTER-UNIVERSITARIA ──────────────────────────────────────────
    {
      election_id_blockchain: 7,
      name: "Formato Debate Interuniversitario",
      description: "Ambas comunidades votan el formato del próximo debate interuniversitario.",
      start_time: past(1), end_time: future(14), is_active: 1,
      domains: ["ufv.es", "universidad.edu"],
      candidates: [
        { name: "Formato Oxford",         description: "Debate estructurado tradicional entre dos equipos" },
        { name: "Lincoln-Douglas",        description: "Debate uno-a-uno basado en valores" },
        { name: "Estilo Parlamentario",   description: "Gobierno vs. Oposición con múltiples oradores" },
      ],
    },
  ];

  const electionIdMap: Record<string, number> = {};

  for (const e of electionsToCreate) {
    try {
      const result = await db.exec(
        `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [e.election_id_blockchain, e.name, e.description, e.start_time, e.end_time, e.is_active]
      );
      electionIdMap[e.name] = result.lastID;

      for (let i = 0; i < e.candidates.length; i++) {
        await db.exec(
          "INSERT INTO candidates (election_id, name, description, position) VALUES (?, ?, ?, ?)",
          [result.lastID, e.candidates[i].name, e.candidates[i].description, i]
        );
      }

      for (const domain of e.domains) {
        await db.exec(
          "INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)",
          [result.lastID, domain]
        );
      }

      const status = e.is_active ? "activa" : "cerrada";
      console.log(`  ✅ [${status.padEnd(7)}] ${e.name} — dominios: ${e.domains.join(", ")}`);
    } catch (err: any) {
      console.error(`  ❌ Error creando elección "${e.name}": ${err.message}`);
    }
  }

  // ============================================================
  // 3. ASIGNAR VOTANTES POR DOMINIO
  // ============================================================
  console.log("\n📝 Asignando votantes...");

  const allStudents = await db.run<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE role = 'student'"
  );
  const allAccess = await db.run<{ election_id: number; email_domain: string }>(
    "SELECT election_id, email_domain FROM election_access"
  );

  let assigned = 0;
  for (const user of allStudents) {
    const domain = user.email.split("@")[1];
    for (const access of allAccess) {
      if (access.email_domain === domain) {
        try {
          await db.exec(
            "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
            [access.election_id, user.id]
          );
          assigned++;
        } catch { /* ya asignado */ }
      }
    }
  }
  console.log(`  ✅ ${assigned} asignaciones creadas`);

  // ============================================================
  // 4. SIMULAR VOTOS YA EMITIDOS (nullifier_audit)
  //
  //  Elección 1 "Delegado UFV"       → carlos + laura + andres ya votaron
  //  Elección 2 "Mejora Campus"       → nadie ha votado aún
  //  Elección 3 "Premio Profesor"     → TODOS los de UFV han votado
  //  Elección 4 "Renovación Aulas"    → cerrada, todos votaron
  //  Elección 5 "Investigación EDU"   → juan + maria ya votaron
  //  Elección 6 "Consejo EDU"         → nadie ha votado aún
  //  Elección 7 "Debate Inter"        → carlos + juan ya votaron
  // ============================================================
  console.log("\n🗳️  Simulando votos ya emitidos...");

  type VoteEntry = { userEmail: string; electionName: string };

  const precastVotes: VoteEntry[] = [
    // Elección 1 — parcialmente votada (UFV)
    { userEmail: "carlos@ufv.es",          electionName: "Delegado UFV 2026-2027" },
    { userEmail: "laura@ufv.es",           electionName: "Delegado UFV 2026-2027" },
    { userEmail: "andres@ufv.es",          electionName: "Delegado UFV 2026-2027" },

    // Elección 3 — totalmente votada (UFV)
    { userEmail: "carlos@ufv.es",          electionName: "Premio Mejor Profesor UFV 2026" },
    { userEmail: "laura@ufv.es",           electionName: "Premio Mejor Profesor UFV 2026" },
    { userEmail: "miguel@ufv.es",          electionName: "Premio Mejor Profesor UFV 2026" },
    { userEmail: "sofia@ufv.es",           electionName: "Premio Mejor Profesor UFV 2026" },
    { userEmail: "andres@ufv.es",          electionName: "Premio Mejor Profesor UFV 2026" },
    { userEmail: "patricia@ufv.es",        electionName: "Premio Mejor Profesor UFV 2026" },

    // Elección 4 — cerrada, todos votaron (UFV)
    { userEmail: "carlos@ufv.es",          electionName: "Elección Finalizada: Renovación Aulas UFV" },
    { userEmail: "laura@ufv.es",           electionName: "Elección Finalizada: Renovación Aulas UFV" },
    { userEmail: "miguel@ufv.es",          electionName: "Elección Finalizada: Renovación Aulas UFV" },
    { userEmail: "sofia@ufv.es",           electionName: "Elección Finalizada: Renovación Aulas UFV" },
    { userEmail: "andres@ufv.es",          electionName: "Elección Finalizada: Renovación Aulas UFV" },
    { userEmail: "patricia@ufv.es",        electionName: "Elección Finalizada: Renovación Aulas UFV" },

    // Elección 5 — parcialmente votada (EDU)
    { userEmail: "juan@universidad.edu",   electionName: "Prioridad Investigación EDU 2026" },
    { userEmail: "maria@universidad.edu",  electionName: "Prioridad Investigación EDU 2026" },

    // Elección 7 — inter-universitaria, parcialmente votada
    { userEmail: "carlos@ufv.es",          electionName: "Formato Debate Interuniversitario" },
    { userEmail: "sofia@ufv.es",           electionName: "Formato Debate Interuniversitario" },
    { userEmail: "juan@universidad.edu",   electionName: "Formato Debate Interuniversitario" },
    { userEmail: "elena@universidad.edu",  electionName: "Formato Debate Interuniversitario" },
  ];

  let voteCount = 0;
  for (const vote of precastVotes) {
    const userId    = userIdMap[vote.userEmail];
    const electionId = electionIdMap[vote.electionName];

    if (!userId || !electionId) {
      console.warn(`  ⚠️  No encontrado: ${vote.userEmail} / ${vote.electionName}`);
      continue;
    }

    const nullifierHash = generateNullifier(userId, electionId);

    try {
      await db.exec(
        `INSERT OR IGNORE INTO nullifier_audit (user_id, election_id, nullifier_hash)
         VALUES (?, ?, ?)`,
        [userId, electionId, nullifierHash]
      );
      voteCount++;
    } catch (err: any) {
      console.error(`  ❌ Error simulando voto: ${err.message}`);
    }
  }
  console.log(`  ✅ ${voteCount} votos simulados`);

  // ============================================================
  // RESUMEN
  // ============================================================
  console.log("\n" + "=".repeat(62));
  console.log("✅ Seed completado — datos demo listos");
  console.log("=".repeat(62));
  console.log("\n📚 Cuentas demo:");
  console.log("  🔧 superadmin@vtb.system     / superadmin123");
  console.log("  👨‍💼 admin@ufv.es               / admin123");
  console.log("  👨‍💼 admin@universidad.edu      / admin123");
  console.log("  🎓 carlos@ufv.es             / demo123  (ha votado en varias)");
  console.log("  🎓 miguel@ufv.es             / demo123  (puede votar)");
  console.log("  🎓 sofia@ufv.es              / demo123  (ha votado en alguna)");
  console.log("  🎓 juan@universidad.edu      / demo123  (ha votado en alguna)");
  console.log("  🎓 elena@universidad.edu     / demo123  (puede votar)");
  console.log("\n🗳️  Estado de las elecciones:");
  console.log("  ✔  Delegado UFV              → 3/6 votos emitidos");
  console.log("  ✔  Mejora Campus UFV         → 0/6 votos (nadie ha votado aún)");
  console.log("  ✔  Premio Profesor UFV       → 6/6 votos (participación completa)");
  console.log("  ✔  Renovación Aulas UFV      → cerrada, 6/6 votos");
  console.log("  ✔  Investigación EDU         → 2/4 votos emitidos");
  console.log("  ✔  Consejo Estudiantil EDU   → 0/4 votos (nadie ha votado aún)");
  console.log("  ✔  Debate Interuniversitario → 4/10 votos emitidos");
  console.log("");
}

// ─── Ejecución directa (npm run seed) ───────────────────────────────────────
async function runSeedScript() {
  try {
    const db = getDatabase();
    await db.initialize();
    // En modo script forzamos el seed aunque haya datos
    const row = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users");
    if (row && row.count > 0) {
      console.log("⚠️  La BD ya tiene datos. Borrando para re-sembrar...");
      await db.exec("DELETE FROM nullifier_audit");
      await db.exec("DELETE FROM election_voters");
      await db.exec("DELETE FROM election_access");
      await db.exec("DELETE FROM candidates");
      await db.exec("DELETE FROM elections");
      await db.exec("DELETE FROM users");
    }
    await seedDemoData();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error en seed:", err);
    process.exit(1);
  }
}

// Detectar si se ejecuta directamente (no importado como módulo)
const isMain = process.argv[1]?.includes("seedDatabase");
if (isMain) {
  runSeedScript();
}
