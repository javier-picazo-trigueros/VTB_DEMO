import { getDatabase } from "../config/database.js";
import { hashPassword, generateNullifier } from "../utils/auth.js";

/**
 * Seed de datos demo para VTB.
 * - Idempotente: no duplica datos si ya existen.
 * - Se llama automáticamente al arrancar la app si la BD está vacía.
 * - También ejecutable manualmente: npm run seed
 *
 * Solo genera datos para la universidad ficticia "Meridian University"
 * (dominio vtb.demo) y el superadmin de plataforma (vtb.system). No crea
 * ni mantiene ninguna otra institución — si una base de datos ya tiene
 * cuentas reales bajo otros dominios (p. ej. de un piloto real), este
 * script nunca las toca ni las borra: solo usa INSERT OR IGNORE / UPDATE
 * sobre las cuentas de vtb.demo y vtb.system.
 */
/**
 * Contraseña de una cuenta privilegiada del seed (A4).
 *
 * No hay valor por defecto: si la variable falta o es demasiado corta, el seed
 * aborta nombrándola. Antes estas contraseñas estaban escritas en el código
 * ("superadmin123", "admin123") y publicadas en el README, lo que convertía
 * cualquier despliegue sembrado en un superadmin de acceso público.
 */
function requiredSeedPassword(varName: string, account: string): string {
  const value = process.env[varName];
  if (!value || value.trim().length < 12) {
    throw new Error(
      `FATAL: la variable de entorno "${varName}" es obligatoria para sembrar ` +
      `la cuenta privilegiada ${account}, y debe tener al menos 12 caracteres.\n` +
      `  Genera una con:\n` +
      `    node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"\n` +
      `  y defínela en backend/.env (local) o en las variables de entorno de tu proveedor.\n` +
      `  Nunca vuelvas a poner una contraseña de administrador en el código ni en el README.`,
    );
  }
  return value;
}

/**
 * Contraseña de las cuentas de estudiante de demostración.
 * Estas sí conservan un valor por defecto: son cuentas sin privilegios en un
 * dominio ficticio (@vtb.demo) y existen para poder enseñar el flujo de voto.
 */
function demoStudentPassword(): string {
  return process.env.SEED_DEMO_STUDENT_PASSWORD || 'demo123';
}

export async function seedDemoData(): Promise<void> {
  const db = getDatabase();

  // Defensive typo-fix for historical rows only (does not create demo data).
  await db.exec("UPDATE users SET email = replace(email, '@highland.edu', '@highlands.edu') WHERE email LIKE '%@highland.edu'").catch(() => {});
  await db.exec("UPDATE users SET admin_domain = 'highlands.edu' WHERE admin_domain = 'highland.edu'").catch(() => {});
  await db.exec("UPDATE org_units SET domain = 'highlands.edu' WHERE domain = 'highland.edu'").catch(() => {});
  await db.exec("UPDATE org_units SET institution_domain = 'highlands.edu' WHERE institution_domain = 'highland.edu'").catch(() => {});
  await db.exec("UPDATE election_access SET email_domain = 'highlands.edu' WHERE email_domain = 'highland.edu'").catch(() => {});
  await db.exec("UPDATE election_targets SET target_value = 'highlands.edu' WHERE target_value = 'highland.edu'").catch(() => {});
  await db.exec("UPDATE schools_and_degrees SET institution_domain = 'highlands.edu' WHERE institution_domain = 'highland.edu'").catch(() => {});
  await db.exec(
    `DELETE FROM nullifier_audit
     WHERE block_number IS NULL
     AND user_id IN (SELECT id FROM users WHERE email NOT LIKE '%@vtb.demo')`
  ).catch(() => {});

  // Rename the "vtb.demo" sandbox identity to "Meridian University" for live demos.
  // Domain and emails are UNCHANGED (student@vtb.demo etc. — tests and DemoLoginModal
  // depend on these literal addresses); only display names change. Idempotent.
  await db.exec("UPDATE users SET name = 'Alex Ferrer' WHERE email = 'student@vtb.demo' AND name = 'Demo Student'").catch(() => {});
  await db.exec("UPDATE users SET name = 'Marina Costa' WHERE email = 'student2@vtb.demo' AND name = 'Demo Student VTB 2'").catch(() => {});
  await db.exec("UPDATE users SET name = 'Elena Ibarra' WHERE email = 'admin@vtb.demo' AND name = 'Demo Administrator'").catch(() => {});
  await db.exec("UPDATE users SET name = 'Marta Reyes' WHERE email = 'superadmin@vtb.demo' AND name = 'Demo Super Admin'").catch(() => {});
  await db.exec("UPDATE elections SET name = 'Meridian University Student Council Election', description = 'Elige a los representantes del consejo estudiantil de Meridian University para el curso 2026.' WHERE name = 'VTB Demo Sandbox Election'").catch(() => {});
  await db.exec("UPDATE elections SET name = 'Elección al Consejo de Estudiantes — Meridian University', description = 'Elige a tus representantes en el Consejo de Estudiantes de Meridian University para el curso 2026.' WHERE name = 'Meridian University Student Council Election'").catch(() => {});
  await db.exec("UPDATE elections SET name = 'Referéndum Conjunto entre Instituciones', description = 'Consulta sobre el modelo de auditoría de las votaciones.' WHERE name = 'Multi-Institution Demo Referendum'").catch(() => {});
  await db.exec("UPDATE elections SET name = 'Votación de Gobernanza entre Administradores', description = 'Los administradores deciden la frecuencia de las exportaciones de auditoría pública.' WHERE name = 'Admin Demo Governance Vote'").catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Laura Sáez', description = '3º de Económicas — más espacios de estudio flexibles y talleres abiertos a toda la comunidad.'
     WHERE name = 'Open Campus Proposal' AND election_id IN (SELECT id FROM elections WHERE name = 'Elección al Consejo de Estudiantes — Meridian University')`
  ).catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Marco Ibáñez', description = '2º de Ingeniería — más servicios digitales, paneles en tiempo real y participación remota.'
     WHERE name = 'Digital First Proposal' AND election_id IN (SELECT id FROM elections WHERE name = 'Elección al Consejo de Estudiantes — Meridian University')`
  ).catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Auditoría Pública Ampliada', description = 'Publicar más detalle de cada proceso electoral en el panel de auditoría pública.'
     WHERE name = 'Adopt Blockchain Audits' AND election_id IN (SELECT id FROM elections WHERE name = 'Referéndum Conjunto entre Instituciones')`
  ).catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Mantener Auditoría Actual', description = 'Mantener el nivel de detalle actual en los registros públicos.'
     WHERE name = 'Keep Internal Audits' AND election_id IN (SELECT id FROM elections WHERE name = 'Referéndum Conjunto entre Instituciones')`
  ).catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Auditoría Mensual', description = 'Exigir una exportación pública de auditoría cada mes.'
     WHERE name = 'Enable Monthly Audits' AND election_id IN (SELECT id FROM elections WHERE name = 'Votación de Gobernanza entre Administradores')`
  ).catch(() => {});
  await db.exec(
    `UPDATE candidates SET name = 'Auditoría Trimestral', description = 'Exigir una exportación pública de auditoría cada trimestre.'
     WHERE name = 'Enable Quarterly Audits' AND election_id IN (SELECT id FROM elections WHERE name = 'Votación de Gobernanza entre Administradores')`
  ).catch(() => {});
  // These two elections used to be cross-institution demos; now Meridian-only.
  await db.exec("DELETE FROM election_access WHERE email_domain != 'vtb.demo' AND election_id IN (SELECT id FROM elections WHERE name IN ('Referéndum Conjunto entre Instituciones', 'Votación de Gobernanza entre Administradores'))").catch(() => {});

  // ============================================================
  // Org unit — solo Meridian University (vtb.demo) + plataforma (vtb.system)
  // ============================================================
  const orgUnits = [
    { name: 'VTB Administration', domain: 'vtb.system', parent_domain: null, unit_type: 'institution', institution_domain: 'vtb.system', logo_url: '/logos/vtb.svg', primary_color: '#1B4D6A' },
    { name: 'Meridian University', domain: 'vtb.demo', parent_domain: null, unit_type: 'institution', institution_domain: 'vtb.demo', logo_url: '/logos/vtb.svg', primary_color: '#1B4D6A' },
  ];
  for (const ou of orgUnits) {
    await db.exec(
      `INSERT OR IGNORE INTO org_units (name, domain, parent_domain, unit_type, institution_domain, logo_url, primary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ou.name, ou.domain, ou.parent_domain, ou.unit_type, ou.institution_domain, ou.logo_url, ou.primary_color]
    ).catch(() => {});
    await db.exec(
      `UPDATE org_units SET institution_domain = ? WHERE domain = ? AND (institution_domain = '' OR institution_domain IS NULL)`,
      [ou.institution_domain, ou.domain]
    ).catch(() => {});
    await db.exec(
      `UPDATE org_units SET name = ?, logo_url = ?, primary_color = ? WHERE domain = ?`,
      [ou.name, ou.logo_url, ou.primary_color, ou.domain]
    ).catch(() => {});
  }

  // ============================================================
  // Facultades y titulaciones de Meridian University (idempotente)
  // ============================================================
  const meridianDegrees = [
    { school: 'Facultad de Ciencias Económicas y Empresariales', degree: 'Economía', code: 'MER-ECO', years: 4 },
    { school: 'Facultad de Ciencias Económicas y Empresariales', degree: 'Administración y Dirección de Empresas', code: 'MER-ADE', years: 4 },
    { school: 'Escuela de Ingeniería', degree: 'Ingeniería Informática', code: 'MER-INF', years: 4 },
    { school: 'Escuela de Ingeniería', degree: 'Ingeniería Industrial', code: 'MER-IND', years: 4 },
    { school: 'Facultad de Comunicación', degree: 'Comunicación Audiovisual', code: 'MER-CAV', years: 4 },
    { school: 'Facultad de Comunicación', degree: 'Periodismo', code: 'MER-PER', years: 4 },
    { school: 'Facultad de Ciencias de la Salud', degree: 'Psicología', code: 'MER-PSI', years: 4 },
    { school: 'Facultad de Ciencias de la Salud', degree: 'Enfermería', code: 'MER-ENF', years: 4 },
    { school: 'Facultad de Derecho', degree: 'Derecho', code: 'MER-DER', years: 4 },
    { school: 'Facultad de Derecho', degree: 'Criminología', code: 'MER-CRI', years: 4 },
  ];
  for (const item of meridianDegrees) {
    const exists = await db.get<{ id: number }>(
      'SELECT id FROM schools_and_degrees WHERE institution_domain = ? AND school_name = ? AND degree_name = ?',
      ['vtb.demo', item.school, item.degree]
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO schools_and_degrees (institution_domain, school_name, degree_name, degree_code, years)
         VALUES (?, ?, ?, ?, ?)`,
        ['vtb.demo', item.school, item.degree, item.code, item.years]
      ).catch(() => {});
    }
  }

  // ============================================================
  // Cuentas demo — se mantienen en cada arranque (idempotente)
  // ============================================================
  const criticalAccounts = [
    { email: "superadmin@vtb.system", name: "Super Admin",  student_id: "SUPERADMIN-001",  password: requiredSeedPassword('SEED_SUPERADMIN_PASSWORD', 'superadmin@vtb.system'), role: "superadmin", admin_domain: null },
    { email: "admin@vtb.demo",        name: "Elena Ibarra", student_id: "DEMO-ADM-001",    password: requiredSeedPassword('SEED_DEMO_ADMIN_PASSWORD', 'admin@vtb.demo'),           role: "admin",      admin_domain: "vtb.demo" },
    { email: "superadmin@vtb.demo",   name: "Marta Reyes",  student_id: "SUPERADMIN-DEMO", password: requiredSeedPassword('SEED_DEMO_SUPERADMIN_PASSWORD', 'superadmin@vtb.demo'), role: "superadmin", admin_domain: null },
    { email: "student@vtb.demo",      name: "Alex Ferrer",  student_id: "DEMO-STU-001",    password: demoStudentPassword(), role: "student",    admin_domain: null },
    { email: "student2@vtb.demo",     name: "Marina Costa", student_id: "VTB-DEMO-002",    password: demoStudentPassword(), role: "student",    admin_domain: null },
  ];

  console.log("🔄 Ensuring critical demo accounts exist with correct passwords...");
  const userIdMap: Record<string, number> = {};
  for (const account of criticalAccounts) {
    try {
      const hash = await hashPassword(account.password);
      const row = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [account.email]);
      if (row) {
        userIdMap[account.email] = row.id;
        await db.exec(
          "UPDATE users SET password_hash = ?, role = ?, admin_domain = ?, is_approved = 1, approved_at = CURRENT_TIMESTAMP WHERE email = ?",
          [hash, account.role, account.admin_domain, account.email]
        );
      } else {
        const result = await db.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_at, is_eligible)
           VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 1)`,
          [account.email, hash, account.name, account.student_id, account.role, account.admin_domain]
        );
        userIdMap[account.email] = result.lastID;
      }
    } catch (err: any) {
      console.error(`  ❌ Failed to upsert ${account.email}: ${err.message}`);
    }
  }
  console.log("✅ Demo accounts ensured (upserted)");

  // Datos académicos de los estudiantes demo
  const studentAcademicData = [
    { email: 'student@vtb.demo',  school: 'Facultad de Ciencias Económicas y Empresariales', degree: 'Administración y Dirección de Empresas', year: 3 },
    { email: 'student2@vtb.demo', school: 'Escuela de Ingeniería',                            degree: 'Ingeniería Informática',                  year: 2 },
  ];
  for (const s of studentAcademicData) {
    await db.exec(
      'UPDATE users SET school = ?, degree = ?, year = ? WHERE email = ?',
      [s.school, s.degree, s.year, s.email]
    ).catch(() => {});
  }

  // Limpia auditoría "pendiente" de las cuentas demo en cada arranque para que
  // el flujo de voto se pueda repetir en sucesivas demos en vivo.
  for (const email of ['student@vtb.demo', 'student2@vtb.demo']) {
    const demoUser = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
    if (demoUser) {
      await db.exec("DELETE FROM nullifier_audit WHERE user_id = ?", [demoUser.id]).catch(() => {});
    }
  }

  // ============================================================
  // Elecciones de Meridian University — se mantienen en cada arranque
  // ============================================================
  const alwaysNow = Math.floor(Date.now() / 1000);
  const alwaysDemoElections = [
    {
      election_id_blockchain: 101,
      name: "Elección al Consejo de Estudiantes — Meridian University",
      description: "Elige a tus representantes en el Consejo de Estudiantes de Meridian University para el curso 2026.",
      domains: ["vtb.demo"],
      voter_role: "student",
      candidates: [
        { name: "Laura Sáez", description: "3º de Económicas — más espacios de estudio flexibles y talleres abiertos a toda la comunidad." },
        { name: "Marco Ibáñez", description: "2º de Ingeniería — más servicios digitales, paneles en tiempo real y participación remota." },
      ],
    },
    {
      election_id_blockchain: 107,
      name: "Elección a Delegado de Centro — Meridian University",
      description: "Elige al delegado o delegada que representará a tu centro ante la dirección académica este curso.",
      domains: ["vtb.demo"],
      voter_role: "student",
      candidates: [
        { name: "Diego Roldán", description: "2º de Comunicación — mejora del calendario de exámenes y horarios de tutoría." },
        { name: "Nuria Campos", description: "3º de Psicología — más apoyo a la salud mental y programas de mentoría entre cursos." },
        { name: "Álvaro Bustos", description: "1º de Empresariales — canal directo de propuestas estudiantiles a dirección." },
      ],
    },
    {
      election_id_blockchain: 108,
      name: "Elección de Representantes de Claustro — Meridian University",
      description: "Elige a los representantes estudiantiles que formarán parte del Claustro Universitario este curso.",
      domains: ["vtb.demo"],
      voter_role: "student",
      candidates: [
        { name: "Beatriz Lerma", description: "4º de Derecho — antigua delegada de curso, defensora de la transparencia en las actas del Claustro." },
        { name: "Iván Casares", description: "3º de Ingeniería — foco en digitalización de trámites académicos." },
      ],
    },
    {
      election_id_blockchain: 105,
      name: "Referéndum Conjunto entre Instituciones",
      description: "Consulta sobre el modelo de auditoría de las votaciones.",
      domains: ["vtb.demo"],
      voter_role: "student",
      candidates: [
        { name: "Auditoría Pública Ampliada", description: "Publicar más detalle de cada proceso electoral en el panel de auditoría pública." },
        { name: "Mantener Auditoría Actual", description: "Mantener el nivel de detalle actual en los registros públicos." },
      ],
    },
    {
      election_id_blockchain: 106,
      name: "Votación de Gobernanza entre Administradores",
      description: "Los administradores deciden la frecuencia de las exportaciones de auditoría pública.",
      domains: ["vtb.demo"],
      voter_role: "admin",
      candidates: [
        { name: "Auditoría Mensual", description: "Exigir una exportación pública de auditoría cada mes." },
        { name: "Auditoría Trimestral", description: "Exigir una exportación pública de auditoría cada trimestre." },
      ],
    },
  ];

  const electionIdMap: Record<string, number> = {};

  for (const election of alwaysDemoElections) {
    let row = await db.get<{ id: number }>("SELECT id FROM elections WHERE name = ?", [election.name]);
    if (!row) {
      const result = await db.exec(
        `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, voter_role)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [
          election.election_id_blockchain,
          election.name,
          election.description,
          alwaysNow - 86400,
          alwaysNow + 90 * 86400,
          election.voter_role,
        ]
      );
      row = { id: result.lastID };
    } else {
      await db.exec(
        "UPDATE elections SET start_time = ?, end_time = ?, is_active = 1, voter_role = ? WHERE id = ?",
        [alwaysNow - 86400, alwaysNow + 90 * 86400, election.voter_role, row.id]
      ).catch(() => {});
    }
    electionIdMap[election.name] = row.id;

    for (const candidate of election.candidates) {
      const candidateExists = await db.get<{ id: number }>(
        "SELECT id FROM candidates WHERE election_id = ? AND name = ?",
        [row.id, candidate.name]
      );
      if (!candidateExists) {
        await db.exec(
          "INSERT INTO candidates (election_id, name, description) VALUES (?, ?, ?)",
          [row.id, candidate.name, candidate.description]
        ).catch(() => {});
      }
    }

    for (const domain of election.domains) {
      await db.exec(
        "INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)",
        [row.id, domain]
      ).catch(() => {});

      const voters = election.voter_role === "admin"
        ? await db.run<{ id: number }>(
            "SELECT id FROM users WHERE role = 'admin' AND admin_domain = ?",
            [domain]
          )
        : await db.run<{ id: number }>(
            "SELECT id FROM users WHERE role = 'student' AND lower(email) LIKE ?",
            [`%@${domain}`]
          );

      for (const voter of voters || []) {
        await db.exec(
          "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
          [row.id, voter.id]
        ).catch(() => {});
      }
    }

    if (election.voter_role === "admin") {
      const superAdmins = await db.run<{ id: number }>("SELECT id FROM users WHERE role = 'superadmin'");
      for (const voter of superAdmins || []) {
        await db.exec(
          "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
          [row.id, voter.id]
        ).catch(() => {});
      }
    }
  }

  // Un par de votos ya emitidos en el Consejo de Estudiantes, para que la
  // demo no arranque siempre con 0 participación. Idempotente (INSERT OR IGNORE).
  const precastVotes = [
    { userEmail: "student@vtb.demo",  electionName: "Elección al Consejo de Estudiantes — Meridian University" },
  ];
  let voteCount = 0;
  for (const vote of precastVotes) {
    const userId = userIdMap[vote.userEmail];
    const electionId = electionIdMap[vote.electionName];
    if (!userId || !electionId) continue;
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

  console.log("\n" + "=".repeat(62));
  console.log("✅ Seed completado — Meridian University lista para demo");
  console.log("=".repeat(62));
  // A4: no se imprime ninguna contraseña. Las privilegiadas vienen del entorno
  // y quien despliega ya las conoce; volcarlas aquí las dejaba en los logs de
  // Render, que son legibles por cualquiera con acceso al panel.
  console.log("\n📚 Cuentas demo:");
  console.log("  🔧 superadmin@vtb.system   (plataforma)      → SEED_SUPERADMIN_PASSWORD");
  console.log("  👨‍💼 admin@vtb.demo          (Elena Ibarra)     → SEED_DEMO_ADMIN_PASSWORD");
  console.log("  🔧 superadmin@vtb.demo     (Marta Reyes)      → SEED_DEMO_SUPERADMIN_PASSWORD");
  console.log("  🎓 student@vtb.demo        (Alex Ferrer — ya ha votado en Consejo de Estudiantes)");
  console.log("  🎓 student2@vtb.demo       (Marina Costa)");
  console.log(`\n🗳️  ${voteCount} voto(s) simulado(s) en Consejo de Estudiantes.\n`);
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
