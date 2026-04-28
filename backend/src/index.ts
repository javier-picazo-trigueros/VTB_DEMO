import { app } from "./app.js";
import { getDatabase } from "./config/database.js";
import { seedDemoData } from "./scripts/seedDatabase.js";

const PORT = process.env.PORT || 3001;

async function initializeDatabase() {
  try {
    const db = getDatabase();
    await db.initialize();
    console.log('✅ Base de datos SQLite inicializada');
    await seedDemoData();
  } catch (error) {
    console.error('❌ Error al inicializar BD:', error);
    process.exit(1);
  }
}

async function start() {
  try {
    await initializeDatabase();

    if (!process.env.CONTRACT_ADDRESS || !process.env.PRIVATE_KEY) {
      console.warn('⚠️  ADVERTENCIA: CONTRACT_ADDRESS o PRIVATE_KEY no configurados');
      console.warn('   Las transacciones a blockchain no funcionarán');
    } else {
      console.log(`✅ Blockchain configurado: ${process.env.CONTRACT_ADDRESS}`);
    }

    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 VTB Backend iniciado");
      console.log("=".repeat(60));
      console.log(`🌐 Servidor: http://localhost:${PORT}`);
      console.log(`💡 Health check: http://localhost:${PORT}/health`);
      console.log("=".repeat(60) + "\n");
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
