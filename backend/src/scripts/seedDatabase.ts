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

  // Seed org units always (idempotent)
  // logo_url and primary_color are only set for top-level institution entries
  const orgUnits = [
    // UFV — institution root
    { name: 'Universidad Francisco de Vitoria', domain: 'ufv.es', parent_domain: null, unit_type: 'institution', institution_domain: 'ufv.es', logo_url: '/logos/ufv.png', primary_color: '#004b87' },
    { name: 'School of Engineering', domain: 'eps.ufv.es', parent_domain: 'ufv.es', unit_type: 'school', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'Computer Science', domain: 'cs.eps.ufv.es', parent_domain: 'eps.ufv.es', unit_type: 'degree', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'CS Year 1', domain: 'cs1.eps.ufv.es', parent_domain: 'cs.eps.ufv.es', unit_type: 'year', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'CS Year 2', domain: 'cs2.eps.ufv.es', parent_domain: 'cs.eps.ufv.es', unit_type: 'year', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'CS Year 3', domain: 'cs3.eps.ufv.es', parent_domain: 'cs.eps.ufv.es', unit_type: 'year', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'Business Administration', domain: 'ba.ufv.es', parent_domain: 'ufv.es', unit_type: 'degree', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'BA Year 1', domain: 'ba1.ufv.es', parent_domain: 'ba.ufv.es', unit_type: 'year', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    { name: 'BA Year 2', domain: 'ba2.ufv.es', parent_domain: 'ba.ufv.es', unit_type: 'year', institution_domain: 'ufv.es', logo_url: null, primary_color: null },
    // Highland — institution root (dark navy brand)
    { name: 'Highlands School', domain: 'highland.edu', parent_domain: null, unit_type: 'institution', institution_domain: 'highland.edu', logo_url: '/logos/highland.png', primary_color: '#0f204b' },
    { name: 'Highland Secondary', domain: 'secondary.highland.edu', parent_domain: 'highland.edu', unit_type: 'school', institution_domain: 'highland.edu', logo_url: null, primary_color: null },
    { name: 'Year 10', domain: 'y10.secondary.highland.edu', parent_domain: 'secondary.highland.edu', unit_type: 'year', institution_domain: 'highland.edu', logo_url: null, primary_color: null },
    { name: 'Year 11', domain: 'y11.secondary.highland.edu', parent_domain: 'secondary.highland.edu', unit_type: 'year', institution_domain: 'highland.edu', logo_url: null, primary_color: null },
    // VTB Administration — superadmin portal
    { name: 'VTB Administration', domain: 'vtb.system', parent_domain: null, unit_type: 'institution', institution_domain: 'vtb.system', logo_url: '/logos/vtb.svg', primary_color: '#3b82f6' },
  ];
  for (const ou of orgUnits) {
    await db.exec(
      `INSERT OR IGNORE INTO org_units (name, domain, parent_domain, unit_type, institution_domain, logo_url, primary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ou.name, ou.domain, ou.parent_domain, ou.unit_type, ou.institution_domain, ou.logo_url, ou.primary_color]
    ).catch(() => {});
    // Update columns for pre-existing rows that are missing data
    await db.exec(
      `UPDATE org_units SET institution_domain = ? WHERE domain = ? AND (institution_domain = '' OR institution_domain IS NULL)`,
      [ou.institution_domain, ou.domain]
    ).catch(() => {});
    // Always keep name, logo_url, primary_color up to date for institution roots
    if (ou.unit_type === 'institution') {
      await db.exec(
        `UPDATE org_units SET name = ?, logo_url = ?, primary_color = ? WHERE domain = ?`,
        [ou.name, ou.logo_url, ou.primary_color, ou.domain]
      ).catch(() => {});
    }
  }

  // Always upsert critical demo accounts so production DB stays consistent
  const criticalAccounts = [
    { email: "superadmin@vtb.system", name: "Super Admin",           student_id: "SUPERADMIN-001", password: "superadmin123", role: "superadmin", admin_domain: null },
    { email: "admin@ufv.es",           name: "Admin UFV",             student_id: "ADMIN-UFV-001",  password: "admin123",      role: "admin",      admin_domain: "ufv.es" },
    { email: "admin@universidad.edu",  name: "Admin Universidad",     student_id: "ADMIN-EDU-001",  password: "admin123",      role: "admin",      admin_domain: "universidad.edu" },
    { email: "admin@highland.edu",     name: "Admin Highland",        student_id: "ADMIN-HLD-001",  password: "admin123",      role: "admin",      admin_domain: "highland.edu" },
    { email: "admin@eps.ufv.es",       name: "Admin EPS UFV",         student_id: "ADMIN-EPS-001",  password: "admin123",      role: "admin",      admin_domain: "eps.ufv.es" },
    { email: "carlos@ufv.es",          name: "Carlos López Fernández", student_id: "UFV-2024-001", password: "demo123",       role: "student",    admin_domain: null },
    { email: "laura@ufv.es",           name: "Laura Martínez García",  student_id: "UFV-2024-002", password: "demo123",       role: "student",    admin_domain: null },
    { email: "miguel@ufv.es",          name: "Miguel Torres Sánchez",  student_id: "UFV-2024-003", password: "demo123",       role: "student",    admin_domain: null },
    { email: "sofia@ufv.es",           name: "Sofía Rodríguez Pérez",  student_id: "UFV-2024-004", password: "demo123",       role: "student",    admin_domain: null },
    { email: "andres@ufv.es",          name: "Andrés Navarro Gil",      student_id: "UFV-2024-005", password: "demo123",       role: "student",    admin_domain: null },
    { email: "patricia@ufv.es",        name: "Patricia Vega Moreno",    student_id: "UFV-2024-006", password: "demo123",       role: "student",    admin_domain: null },
    { email: "student5@highland.edu",  name: "James Wilson",            student_id: "HLD-001",      password: "demo123",       role: "student",    admin_domain: null },
    { email: "student6@highland.edu",  name: "Emma Thompson",           student_id: "HLD-002",      password: "demo123",       role: "student",    admin_domain: null },
    { email: "juan@universidad.edu",   name: "Juan García Martín",      student_id: "EDU-2024-001", password: "demo123",       role: "student",    admin_domain: null },
    { email: "elena@universidad.edu",  name: "Elena Castro Ruiz",       student_id: "EDU-2024-003", password: "demo123",       role: "student",    admin_domain: null },
  ];

  console.log("🔄 Ensuring critical demo accounts exist with correct passwords...");
  for (const account of criticalAccounts) {
    try {
      const hash = await hashPassword(account.password);
      const row = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [account.email]);
      if (row) {
        await db.exec(
          "UPDATE users SET password_hash = ?, role = ?, admin_domain = ?, is_approved = 1, approved_at = CURRENT_TIMESTAMP WHERE email = ?",
          [hash, account.role, account.admin_domain, account.email]
        );
      } else {
        await db.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_at, is_eligible)
           VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 1)`,
          [account.email, hash, account.name, account.student_id, account.role, account.admin_domain]
        );
      }
    } catch (err: any) {
      console.error(`  ❌ Failed to upsert ${account.email}: ${err.message}`);
    }
  }
  console.log("✅ Demo accounts ensured (upserted)");

  // Comprobar si ya hay datos
  const existing = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users");
  if (existing && existing.count > 0) {
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
    { email: "admin@highland.edu",     name: "Admin Highland",        student_id: "ADMIN-HLD-001",  password: "admin123",      role: "admin",      admin_domain: "highland.edu" },
    { email: "admin@eps.ufv.es",       name: "Admin EPS UFV",         student_id: "ADMIN-EPS-001",  password: "admin123",      role: "admin",      admin_domain: "eps.ufv.es" },
    // UFV STUDENTS
    { email: "carlos@ufv.es",          name: "Carlos López Fernández",   student_id: "UFV-2024-001", password: "demo123", role: "student", admin_domain: null },
    { email: "laura@ufv.es",           name: "Laura Martínez García",    student_id: "UFV-2024-002", password: "demo123", role: "student", admin_domain: null },
    { email: "miguel@ufv.es",          name: "Miguel Torres Sánchez",    student_id: "UFV-2024-003", password: "demo123", role: "student", admin_domain: null },
    { email: "sofia@ufv.es",           name: "Sofía Rodríguez Pérez",    student_id: "UFV-2024-004", password: "demo123", role: "student", admin_domain: null },
    { email: "andres@ufv.es",          name: "Andrés Navarro Gil",       student_id: "UFV-2024-005", password: "demo123", role: "student", admin_domain: null },
    { email: "patricia@ufv.es",        name: "Patricia Vega Moreno",     student_id: "UFV-2024-006", password: "demo123", role: "student", admin_domain: null },
    // HIGHLAND STUDENTS
    { email: "student5@highland.edu",  name: "James Wilson",             student_id: "HLD-001",      password: "demo123", role: "student", admin_domain: null },
    { email: "student6@highland.edu",  name: "Emma Thompson",            student_id: "HLD-002",      password: "demo123", role: "student", admin_domain: null },
    { email: "student7@highland.edu",  name: "Oliver Davis",             student_id: "HLD-003",      password: "demo123", role: "student", admin_domain: null },
    // EDU STUDENTS
    { email: "juan@universidad.edu",   name: "Juan García Martín",       student_id: "EDU-2024-001", password: "demo123", role: "student", admin_domain: null },
    { email: "maria@universidad.edu",  name: "María López Díaz",         student_id: "EDU-2024-002", password: "demo123", role: "student", admin_domain: null },
    { email: "elena@universidad.edu",  name: "Elena Castro Ruiz",        student_id: "EDU-2024-003", password: "demo123", role: "student", admin_domain: null },
    { email: "roberto@universidad.edu",name: "Roberto Sánchez Leal",     student_id: "EDU-2024-004", password: "demo123", role: "student", admin_domain: null },
    // NEW UFV STUDENTS
    { email: "student8@ufv.es",   name: "María José García",       student_id: "UFV-2024-008", password: "demo123", role: "student", admin_domain: null },
    { email: "student9@ufv.es",   name: "Carlos Alberto López",    student_id: "UFV-2024-009", password: "demo123", role: "student", admin_domain: null },
    { email: "student10@ufv.es",  name: "Ana Belén Martínez",      student_id: "UFV-2024-010", password: "demo123", role: "student", admin_domain: null },
    { email: "student11@ufv.es",  name: "David Fernández Ruiz",    student_id: "UFV-2024-011", password: "demo123", role: "student", admin_domain: null },
    { email: "student12@ufv.es",  name: "Laura González Torres",   student_id: "UFV-2024-012", password: "demo123", role: "student", admin_domain: null },
    // NEW HIGHLAND STUDENTS
    { email: "student8@highland.edu",  name: "William Johnson",    student_id: "HLD-008",      password: "demo123", role: "student", admin_domain: null },
    { email: "student9@highland.edu",  name: "Charlotte Williams", student_id: "HLD-009",      password: "demo123", role: "student", admin_domain: null },
    { email: "student10@highland.edu", name: "George Taylor",      student_id: "HLD-010",      password: "demo123", role: "student", admin_domain: null },
    // NEW UNIVERSIDAD STUDENTS
    { email: "student8@universidad.edu", name: "Roberto Sánchez",  student_id: "EDU-2024-008", password: "demo123", role: "student", admin_domain: null },
    { email: "student9@universidad.edu", name: "Carmen Díaz",      student_id: "EDU-2024-009", password: "demo123", role: "student", admin_domain: null },
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
    voter_role?: string;
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
    // ── HIGHLAND SCHOOL ──────────────────────────────────────────────
    {
      election_id_blockchain: 7,
      name: "Highland School Council Election 2026",
      description: "Vote for your student council representatives",
      start_time: past(3), end_time: future(365), is_active: 1,
      domains: ["highland.edu"],
      candidates: [
        { name: "Alice Johnson",  description: "Student welfare and activities coordinator" },
        { name: "Bob Martinez",   description: "Academic support and resources" },
        { name: "Carol White",    description: "Sports and extracurriculars" },
      ],
    },
    // ── INTER-UNIVERSITARIA ──────────────────────────────────────────
    {
      election_id_blockchain: 8,
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
    // ── NEW UFV ELECTIONS ────────────────────────────────────────────
    {
      election_id_blockchain: 9,
      name: "Faculty Representative Election — Engineering 2026",
      description: "Choose your faculty representative for the School of Engineering academic committee",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Dr. Carlos Mendoza",    description: "Research & innovation advocate" },
        { name: "Prof. Ana Ruiz",        description: "Student welfare and curriculum reform" },
        { name: "Dr. Luis Fernández",    description: "Industry partnerships coordinator" },
      ],
    },
    {
      election_id_blockchain: 10,
      name: "VTB Platform Feedback Survey 2026",
      description: "Rate your experience with the VTB voting platform and suggest improvements",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Excellent — No changes needed",  description: "The platform meets all our needs" },
        { name: "Good — Minor improvements",      description: "Small UX tweaks would help" },
        { name: "Needs significant work",         description: "Major features are missing" },
      ],
    },
    {
      election_id_blockchain: 11,
      name: "Campus Sustainability Initiative Vote",
      description: "Vote for the sustainability project you want implemented on campus this semester",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Solar Panel Installation",           description: "Renewable energy for campus buildings" },
        { name: "Bike Sharing Program",               description: "Green transport between campus zones" },
        { name: "Campus Food Garden",                 description: "Community organic garden project" },
        { name: "Electric Vehicle Charging Stations", description: "EV infrastructure for students and staff" },
      ],
    },
    {
      election_id_blockchain: 12,
      name: "Student Union Budget Allocation 2026",
      description: "Help decide how the student union budget should be allocated this academic year",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Sports & Recreation (40%)",  description: "Facilities, equipment and sports events" },
        { name: "Cultural Events (40%)",      description: "Concerts, exhibitions and cultural trips" },
        { name: "Academic Resources (40%)",   description: "Books, software licences and tutoring" },
        { name: "Social Spaces (40%)",        description: "Common areas and study lounges" },
      ],
    },
    {
      election_id_blockchain: 13,
      name: "Best Professor Award — Engineering Faculty",
      description: "Nominate and vote for the best professor in the School of Engineering",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["ufv.es"],
      candidates: [
        { name: "Prof. García (Web Development)", description: "Innovative teaching and real-world projects" },
        { name: "Prof. Martínez (Algorithms)",    description: "Clear explanations and student support" },
        { name: "Prof. López (Networks)",         description: "Industry experience and practical labs" },
        { name: "Prof. Sánchez (Databases)",      description: "Research-driven and always available" },
      ],
    },
    // ── NEW HIGHLAND ELECTIONS ───────────────────────────────────────
    {
      election_id_blockchain: 14,
      name: "Highland School Prefect Election 2026",
      description: "Vote for your school prefect representatives for the 2026 academic year",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["highland.edu"],
      candidates: [
        { name: "James Wilson",    description: "Student welfare and inclusion champion" },
        { name: "Sophie Clarke",   description: "Academic excellence and peer support" },
        { name: "Oliver Brown",    description: "Sports and extra-curricular activities" },
        { name: "Emma Thompson",   description: "Environmental and sustainability lead" },
      ],
    },
    {
      election_id_blockchain: 15,
      name: "Highland School Trip Destination Vote",
      description: "Choose where the school trip should go this year",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["highland.edu"],
      candidates: [
        { name: "Paris, France",         description: "Art, culture and the Eiffel Tower" },
        { name: "Rome, Italy",           description: "History, cuisine and the Colosseum" },
        { name: "Barcelona, Spain",      description: "Gaudí architecture and beach culture" },
        { name: "Amsterdam, Netherlands", description: "Canals, museums and cycling" },
      ],
    },
    // ── NEW UNIVERSIDAD ELECTIONS ────────────────────────────────────
    {
      election_id_blockchain: 16,
      name: "Research Department Priority Vote 2026",
      description: "Help the faculty board decide which research area receives additional funding",
      start_time: past(7), end_time: future(365), is_active: 1,
      domains: ["universidad.edu"],
      candidates: [
        { name: "Machine Learning & AI",  description: "Neural networks, LLMs and applied AI systems" },
        { name: "Cybersecurity",          description: "Threat detection, cryptography and secure systems" },
        { name: "Blockchain & Web3",      description: "Decentralised protocols and smart contracts" },
        { name: "Biomedical Computing",   description: "Medical imaging, genomics and health data" },
      ],
    },
    // ── ADMIN-TO-ADMIN ELECTION ─────────────────────────────────
    {
      election_id_blockchain: 17,
      name: "EPS Department Heads Vote 2026",
      description: "School of Engineering administrators vote on academic priorities for 2026-2027",
      start_time: past(7), end_time: future(365), is_active: 1,
      voter_role: 'admin',
      domains: ["ufv.es"],
      candidates: [
        { name: "Increase industry partnerships",  description: "Strengthen links between EPS and tech companies" },
        { name: "Expand research programs",        description: "Grow funded research groups and PhD positions" },
        { name: "Improve student mentorship",      description: "Structured mentoring by faculty and alumni" },
      ],
    },
  ];

  const electionIdMap: Record<string, number> = {};

  for (const e of electionsToCreate) {
    try {
      const voterRole = e.voter_role || 'student';
      const result = await db.exec(
        `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, voter_role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e.election_id_blockchain, e.name, e.description, e.start_time, e.end_time, e.is_active, voterRole]
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
      const roleLabel = voterRole !== 'student' ? ` [${voterRole}]` : '';
      console.log(`  ✅ [${status.padEnd(7)}] ${e.name} — dominios: ${e.domains.join(", ")}${roleLabel}`);
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

  // Assign admins to admin-role elections
  console.log("\n👔 Asignando admins a elecciones de admins...");
  const adminElectionAccess = await db.run<{ election_id: number; email_domain: string }>(
    `SELECT ea.election_id, ea.email_domain FROM election_access ea
     JOIN elections e ON ea.election_id = e.id
     WHERE e.voter_role = 'admin'`
  );
  const allAdmins = await db.run<{ id: number; email: string; admin_domain: string | null }>(
    "SELECT id, email, admin_domain FROM users WHERE role IN ('admin', 'superadmin')"
  );
  let adminAssigned = 0;
  for (const admin of allAdmins) {
    for (const access of adminElectionAccess) {
      const adminDomain = admin.admin_domain || '';
      if (adminDomain === access.email_domain || adminDomain.endsWith('.' + access.email_domain)) {
        try {
          await db.exec(
            "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
            [access.election_id, admin.id]
          );
          adminAssigned++;
        } catch { /* ya asignado */ }
      }
    }
  }
  console.log(`  ✅ ${adminAssigned} asignaciones de admin creadas`);

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
  console.log("  👨‍💼 admin@highland.edu        / admin123");
  console.log("  👨‍💼 admin@eps.ufv.es          / admin123");
  console.log("  🎓 student5@highland.edu     / demo123");
  console.log("  🎓 student6@highland.edu     / demo123");
  console.log("  🎓 student7@highland.edu     / demo123");
  console.log("  🎓 student8@ufv.es           / demo123  (María José García)");
  console.log("  🎓 student9@ufv.es           / demo123  (Carlos Alberto López)");
  console.log("  🎓 student10@ufv.es          / demo123  (Ana Belén Martínez)");
  console.log("  🎓 student11@ufv.es          / demo123  (David Fernández Ruiz)");
  console.log("  🎓 student12@ufv.es          / demo123  (Laura González Torres)");
  console.log("  🎓 student8@highland.edu     / demo123  (William Johnson)");
  console.log("  🎓 student9@highland.edu     / demo123  (Charlotte Williams)");
  console.log("  🎓 student10@highland.edu    / demo123  (George Taylor)");
  console.log("  🎓 student8@universidad.edu  / demo123  (Roberto Sánchez)");
  console.log("  🎓 student9@universidad.edu  / demo123  (Carmen Díaz)");
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
