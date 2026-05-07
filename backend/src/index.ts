import { app } from "./app.js";
import { getDatabase } from "./config/database.js";
import { seedDemoData } from "./scripts/seedDatabase.js";
import net from "node:net";

const PORT = Number(process.env.PORT || 3001);

function checkPortAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tester = net
      .createServer()
      .once("error", reject)
      .once("listening", () => {
        tester.close(() => resolve());
      })
      .listen(port);
  });
}

function handleListenError(error: NodeJS.ErrnoException) {
  if (error.code === "EADDRINUSE") {
    console.error("\n" + "=".repeat(60));
    console.error(`Port ${PORT} is already in use.`);
    console.error("Your backend is probably already running, or another process is using that port.");
    console.error(`Check it here: http://localhost:${PORT}/health`);
    console.error("");
    console.error("Windows helpers:");
    console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | Select-Object LocalAddress,LocalPort,State,OwningProcess`);
    console.error("  Stop-Process -Id <PID>");
    console.error("");
    console.error("Alternative: set a different PORT in backend/.env, then update frontend/.env.local VITE_API_URL.");
    console.error("=".repeat(60) + "\n");
    process.exit(1);
  }

  console.error("Server listen error:", error);
  process.exit(1);
}

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
    await checkPortAvailable(PORT);
    await initializeDatabase();

    if (!process.env.CONTRACT_ADDRESS || !process.env.PRIVATE_KEY) {
      console.warn('⚠️  ADVERTENCIA: CONTRACT_ADDRESS o PRIVATE_KEY no configurados');
      console.warn('   Las transacciones a blockchain no funcionarán');
    } else {
      console.log(`✅ Blockchain configurado: ${process.env.CONTRACT_ADDRESS}`);
    }

    const server = app.listen(PORT);
    server.on("listening", () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 VTB Backend iniciado");
      console.log("=".repeat(60));
      console.log(`🌐 Servidor: http://localhost:${PORT}`);
      console.log(`💡 Health check: http://localhost:${PORT}/health`);
      console.log("=".repeat(60) + "\n");
    });
    server.on("error", handleListenError);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      handleListenError(error as NodeJS.ErrnoException);
    }
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}



