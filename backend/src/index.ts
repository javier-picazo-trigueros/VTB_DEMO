// Debe ser el primer import: valida las variables de entorno obligatorias
// (JWT_SECRET, NULLIFIER_SECRET, CORS_ORIGINS, DATABASE_URL si aplica) y
// aborta con el nombre exacto de la que falte, antes de que arranque nada
// más. Antes de este cable, config/env.ts existía pero no lo importaba
// nadie (SCRUM-14).
import "./config/env.js";
import { app } from "./app.js";
import { getDbClient, ensureSchema } from "./db/index.js";
import { PgClient } from "./db/postgres.js";
import { syncElectionsToBlockchain } from "./scripts/syncElections.js";
import { getVotePort } from "./services/voteChain.js";
import net from "node:net";
import { processEmailQueue } from "./services/email/queue.js";
import { sendCensusInvitation, sendElectionOpen, sendElectionClose } from "./services/email/index.js";
import { formatError } from "./utils/errors.js";

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
    // ensureSchema decide según DB_CLIENT: crea las tablas en SQLite, y en
    // PostgreSQL no hace nada porque el esquema lo gestionan las migraciones.
    // Antes esto llamaba a getDatabase().initialize() siempre, así que en modo
    // PostgreSQL creaba además un vtb.db vacío al lado.
    await ensureSchema();
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

    // TOCTOU warning: the vote uniqueness guarantee is only atomic on PostgreSQL.
    // On SQLite, SqliteAdapter.acquireVoteLock does a SELECT + app-level check,
    // which is still vulnerable to a concurrent duplicate vote under high load.
    // Switch to DB_CLIENT=postgres for production use.
    if (!process.env.DB_CLIENT || process.env.DB_CLIENT !== 'postgres') {
      console.warn('\n' + '!'.repeat(60));
      console.warn('⚠️  AVISO DE SEGURIDAD: DB_CLIENT != postgres');
      console.warn('   El cerrojo anti-doble-voto (TOCTOU) NO está garantizado');
      console.warn('   en modo SQLite. Un usuario podría votar dos veces bajo');
      console.warn('   carga concurrente. Usa DB_CLIENT=postgres en producción.');
      console.warn('!'.repeat(60) + '\n');
    }

    const server = app.listen(PORT);
    server.on("listening", () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 VTB Backend iniciado");
      console.log("=".repeat(60));
      console.log(`🌐 Servidor: http://localhost:${PORT}`);
      console.log(`💡 Health check: http://localhost:${PORT}/health`);
      console.log("=".repeat(60) + "\n");

      syncElectionsToBlockchain().catch(err => {
        console.warn("Election sync warning:", formatError(err));
      });

      // ── Job periódico: reintento de emails huérfanos + notificaciones ────────
      // Corre cada 5 minutos independientemente del motor de BD.
      // Recupera emails en 'queued' que no se enviaron antes de un reinicio del
      // servidor: en email_log queda el cuerpo o, si el correo lleva un enlace
      // con token, los datos para generarlo al enviar (P1-7).
      // También detecta cambios de estado en elecciones y envía notificaciones.
      const FIVE_MIN = 5 * 60 * 1000;
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
      const MAX_NOTIFY_BATCH = 1000;

      async function checkElectionNotifications(): Promise<void> {
        const db = getDbClient();
        const now = Math.floor(Date.now() / 1000);

        // ── Elecciones que acaban de abrir ──────────────────────────────────
        const toOpen = await db.run<{
          id: number; name: string; start_time: number; end_time: number;
        }>(
          `SELECT id, name, start_time, end_time FROM elections
           WHERE start_time <= ? AND is_active = TRUE
             AND notify_open_sent_at IS NULL`,
          [now],
        ).catch(() => []);

        for (const election of toOpen) {
          const voters = await db.run<{
            id: number; email: string; name: string; must_change_password: boolean | number;
          }>(
            `SELECT u.id, u.email, u.name, u.must_change_password
               FROM election_voters ev
               JOIN users u ON u.id = ev.user_id
              WHERE ev.election_id = ?
                AND u.deleted_at IS NULL
                AND u.email NOT LIKE '%@vtb.demo'
              LIMIT ${MAX_NOTIFY_BATCH}`,
            [election.id],
          ).catch(() => []);

          for (const v of voters) {
            if (v.must_change_password) {
              // Punto 2: usuario no ha activado su cuenta todavía.
              // Se le reenvía la invitación. El token nuevo (que anula los
              // anteriores) lo emite el worker de la cola al enviar, para que
              // no quede en claro en email_log (P1-7).
              sendCensusInvitation({
                to:              v.email,
                userId:          v.id,
                name:            v.name,
                electionName:    election.name,
                institutionName: 'tu institución',
              });
            } else {
              sendElectionOpen({
                to:           v.email,
                name:         v.name,
                electionName: election.name,
                startTime:    new Date(election.start_time * 1000),
                endTime:      new Date(election.end_time   * 1000),
                voteUrl:      `${frontendUrl}/voting/${election.id}`,
              });
            }
          }

          await db.exec(
            'UPDATE elections SET notify_open_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
            [election.id],
          ).catch(err => console.error('[notify-open] update failed:', err));

          console.log(`[notify-open] "${election.name}" → ${voters.length} emails encolados`);
        }

        // ── Elecciones que acaban de cerrar ─────────────────────────────────
        const toClose = await db.run<{
          id: number; name: string; end_time: number;
        }>(
          `SELECT id, name, end_time FROM elections
           WHERE end_time <= ? AND notify_close_sent_at IS NULL`,
          [now],
        ).catch(() => []);

        for (const election of toClose) {
          const voters = await db.run<{ email: string; name: string }>(
            `SELECT u.email, u.name
               FROM election_voters ev
               JOIN users u ON u.id = ev.user_id
              WHERE ev.election_id = ?
                AND u.deleted_at IS NULL
                AND u.email NOT LIKE '%@vtb.demo'
              LIMIT ${MAX_NOTIFY_BATCH}`,
            [election.id],
          ).catch(() => []);

          for (const v of voters) {
            sendElectionClose({
              to:           v.email,
              name:         v.name,
              electionName: election.name,
              closedAt:     new Date(election.end_time * 1000),
              resultsUrl:   `${frontendUrl}/results/${election.id}`,
            });
          }

          await db.exec(
            'UPDATE elections SET notify_close_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
            [election.id],
          ).catch(err => console.error('[notify-close] update failed:', err));

          console.log(`[notify-close] "${election.name}" → ${voters.length} emails encolados`);
        }
      }

      setInterval(() => {
        processEmailQueue().catch(err =>
          console.error('[email:queue-job] error:', formatError(err)),
        );
        checkElectionNotifications().catch(err =>
          console.error('[notify-job] error:', err),
        );
        // Red de seguridad de POST /admin/elections, que lanza la sincronización
        // sin esperarla: aquí se reintentan las que fallaron o se quedaron a medias.
        syncElectionsToBlockchain().catch(err =>
          console.error('[chain-sync-job] error:', formatError(err)),
        );
      }, FIVE_MIN);

      console.log('✅ Job de email, notificaciones y sincronización con blockchain activo (cada 5 min)');

      // ── Job de limpieza de votos huérfanos — solo cuando el motor es PostgreSQL
      const dbClient = getDbClient();
      if (dbClient instanceof PgClient) {
        const THIRTY_MIN = 30 * 60 * 1000;

        // Busca el evento VoteCast indexado por nullifier para confirmar la tx.
        // nullifier es bytes32 indexed en el contrato → se puede filtrar sin electionId.
        // La consulta vive en services/voteChain.ts, que es lo que los tests
        // pueden sustituir. El comportamiento no cambia en este paso: sigue
        // devolviendo null tanto si el voto no está en la cadena como si el RPC
        // falló, y cleanupStaleVoteAttempts marca 'failed' en ambos casos
        // (BC-24 / P1-14). Eso se arregla en el paso 4, no aquí.
        const checkOnChain = async (nullifierHash: string) =>
          (await getVotePort()?.findVote(nullifierHash)) ?? null;

        setInterval(() => {
          dbClient.cleanupStaleVoteAttempts(checkOnChain).catch(err => {
            console.error('[cleanup] Error limpiando votos huérfanos:', formatError(err));
          });
        }, THIRTY_MIN);

        console.log('✅ Job de limpieza de votos huérfanos activo (cada 30 min)');
      }
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



