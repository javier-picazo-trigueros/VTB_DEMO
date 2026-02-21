import { getDatabase } from "../config/database.js";
import { hashPassword } from "../utils/auth.js";

/**
 * @title Seed Script - Datos de prueba VTB
 * @author Senior Web3 Architect
 * @dev Script para poblar base de datos con usuarios y elecciones de prueba
 *
 * Uso: npm run seed
 */

async function seed() {
  try {
    const db = getDatabase();
    await db.initialize();

    console.log("🌱 Seedeando base de datos con datos de prueba...\n");

    // ============================================================
    // CREAR USUARIOS DE PRUEBA
    // ============================================================

    console.log("📝 Creando usuarios de prueba...");

    const testUsers = [
      {
        email: "juan@universidad.edu",
        name: "Juan García",
        student_id: "EST-2024-001",
        password: "password123",
        role: "student",
      },
      {
        email: "maria@universidad.edu",
        name: "María López",
        student_id: "EST-2024-002",
        password: "password123",
        role: "student",
      },
      {
        email: "carlos@alumnos.ufv.es",
        name: "Carlos Ruiz",
        student_id: "EST-UFV-001",
        password: "password123",
        role: "student",
      },
      {
        email: "isabella@alumnos.ufv.es",
        name: "Isabella Martínez",
        student_id: "EST-UFV-002",
        password: "password123",
        role: "student",
      },
      {
        email: "admin@universidad.edu",
        name: "Administrador",
        student_id: "ADMIN-001",
        password: "admin123",
        role: "admin",
      },
      {
        email: "admin@ufv.es",
        name: "Administrador UFV",
        student_id: "ADMIN-UFV-001",
        password: "admin123",
        role: "admin",
      },
    ];

    for (const user of testUsers) {
      try {
        const passwordHash = await hashPassword(user.password);
        await db.exec(
          `
          INSERT INTO users (email, password_hash, name, student_id, role, is_eligible)
          VALUES (?, ?, ?, ?, ?, 1)
        `,
          [user.email, passwordHash, user.name, user.student_id, user.role]
        );
        console.log(`  ✅ Usuario creado: ${user.email}`);
      } catch (error: any) {
        if (error.message?.includes("UNIQUE")) {
          console.log(`  ℹ️  Usuario ya existe: ${user.email}`);
        } else {
          console.error(`  ❌ Error creando usuario: ${error.message}`);
        }
      }
    }

    // ============================================================
    // CREAR ELECCIONES DE PRUEBA
    // ============================================================

    console.log("\n📋 Creando elecciones de prueba...");

    const now = Math.floor(Date.now() / 1000);

    const testElections = [
      {
        election_id_blockchain: 1,
        name: "Delegados de Clase 2026",
        description: "Elección de delegados de clase por carrera",
        start_time: now,
        end_time: now + 3600,
        is_active: 1,
      },
      {
        election_id_blockchain: 2,
        name: "Cambios en Exámenes",
        description: "Votación para cambios en el calendario de exámenes",
        start_time: now + 7200,
        end_time: now + 10800,
        is_active: 1,
      },
      {
        election_id_blockchain: 3,
        name: "Consejo de Facultad",
        description: "Elección de representantes del Consejo de Facultad",
        start_time: now + 14400,
        end_time: now + 18000,
        is_active: 1,
      },
      {
        election_id_blockchain: 4,
        name: "Rectores de Universidad",
        description: "Votación para la elección de rectores",
        start_time: now + 21600,
        end_time: now + 25200,
        is_active: 1,
      },
    ];

    const electionMap: { [key: string]: number } = {};

    for (const election of testElections) {
      try {
        const result = await db.exec(
          `
          INSERT INTO elections 
          (election_id_blockchain, name, description, start_time, end_time, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          [
            election.election_id_blockchain,
            election.name,
            election.description,
            election.start_time,
            election.end_time,
            election.is_active,
          ]
        );
        electionMap[election.name] = result.lastID;
        console.log(`  ✅ Elección creada: ${election.name}`);
      } catch (error: any) {
        console.error(`  ❌ Error creando elección: ${error.message}`);
      }
    }

    // ============================================================
    // MAPEAR ELECCIONES A DOMINIOS DE EMAIL
    // ============================================================

    console.log("\n🔗 Mapeando elecciones a dominios de email...");

    const domainMappings = [
      // @universidad.edu puede votar en todas
      { election: "Delegados de Clase 2026", domain: "universidad.edu" },
      { election: "Cambios en Exámenes", domain: "universidad.edu" },
      { election: "Consejo de Facultad", domain: "universidad.edu" },
      { election: "Rectores de Universidad", domain: "universidad.edu" },

      // @alumnos.ufv.es solo en Delegados y Cambios
      { election: "Delegados de Clase 2026", domain: "alumnos.ufv.es" },
      { election: "Cambios en Exámenes", domain: "alumnos.ufv.es" },

      // @ufv.es solo en Rectores
      { election: "Rectores de Universidad", domain: "ufv.es" },
    ];

    for (const mapping of domainMappings) {
      try {
        const electionId = electionMap[mapping.election];
        if (electionId) {
          await db.exec(
            `
            INSERT INTO election_access (election_id, email_domain)
            VALUES (?, ?)
          `,
            [electionId, mapping.domain]
          );
          console.log(
            `  ✅ Acceso: ${mapping.domain} -> ${mapping.election}`
          );
        }
      } catch (error: any) {
        if (!error.message?.includes("UNIQUE")) {
          console.error(
            `  ⚠️  Error mapeando ${mapping.domain}: ${error.message}`
          );
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Seed completado exitosamente");
    console.log("=".repeat(60));

    console.log("\n📚 Datos de prueba disponibles:");
    console.log("\nUsuarios @universidad.edu (contraseña: password123):");
    testUsers.filter(u => u.email.includes("@universidad.edu")).forEach((user) => {
      console.log(`  - ${user.email}`);
    });

    console.log("\nUsuarios @alumnos.ufv.es (contraseña: password123):");
    testUsers.filter(u => u.email.includes("@alumnos.ufv.es")).forEach((user) => {
      console.log(`  - ${user.email}`);
    });

    console.log("\nAdministradores:");
    testUsers.filter(u => u.role === "admin").forEach((user) => {
      console.log(`  - ${user.email} (contraseña: admin123)`);
    });

    console.log("\nElecciones:");
    testElections.forEach((election) => {
      console.log(`  - ${election.name}`);
    });

    console.log("\n💡 Próximos pasos:");
    console.log("  1. Inicia backend: npm run dev");
    console.log("  2. Inicia Hardhat node: npx hardhat node (en otra terminal)");
    console.log("  3. Despliega contrato: npx hardhat run scripts/deploy.ts --network localhost");
    console.log("  4. Inicia frontend: npm run dev (en frontend/)");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error en seed:", error);
    process.exit(1);
  }
}

seed();
