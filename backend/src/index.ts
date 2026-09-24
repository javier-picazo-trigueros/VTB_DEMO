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
import { getVotePort, type BusquedaDeVoto } from "./services/voteChain.js";
import net from "node:net";
import { processEmailQueue } from "./services/email/queue.js";
import { sendCensusInvitation, sendElectionOpen, sendElectionClose } from "./services/email/index.js";
import { formatError } from "./utils/errors.js";
import { destroyExpiredElectionSalts } from "./services/electionSalt.js";
import { runRetentionJobs } from "./services/retention.js";

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
          let offset = 0;
          let totalQueued = 0;
          while (true) {
            const voters = await db.run<{
              id: number; email: string; name: string; must_change_password: boolean | number;
            }>(
              `SELECT u.id, u.email, u.name, u.must_change_password
                 FROM election_voters ev
                 JOIN users u ON u.id = ev.user_id
                WHERE ev.election_id = ?
                  AND u.deleted_at IS NULL
                  AND u.email NOT LIKE '%@vtb.demo'
                ORDER BY u.id ASC
                LIMIT ${MAX_NOTIFY_BATCH} OFFSET ${offset}`,
              [election.id],
            ).catch(() => []);

            if (voters.length === 0) break;

            for (const v of voters) {
              if (v.must_change_password) {
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

            totalQueued += voters.length;
            if (voters.length < MAX_NOTIFY_BATCH) break;
            offset += MAX_NOTIFY_BATCH;
          }

          await db.exec(
            'UPDATE elections SET notify_open_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
            [election.id],
          ).catch(err => console.error('[notify-open] update failed:', err));

          console.log(`[notify-open] "${election.name}" → ${totalQueued} emails encolados`);
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
          let offset = 0;
          let totalQueued = 0;
          while (true) {
            const voters = await db.run<{ email: string; name: string }>(
              `SELECT u.email, u.name
                 FROM election_voters ev
                 JOIN users u ON u.id = ev.user_id
                WHERE ev.election_id = ?
                  AND u.deleted_at IS NULL
                  AND u.email NOT LIKE '%@vtb.demo'
                ORDER BY u.id ASC
                LIMIT ${MAX_NOTIFY_BATCH} OFFSET ${offset}`,
              [election.id],
            ).catch(() => []);

            if (voters.length === 0) break;

            for (const v of voters) {
              sendElectionClose({
                to:           v.email,
                name:         v.name,
                electionName: election.name,
                closedAt:     new Date(election.end_time * 1000),
                resultsUrl:   `${frontendUrl}/results/${election.id}`,
              });
            }

            totalQueued += voters.length;
            if (voters.length < MAX_NOTIFY_BATCH) break;
            offset += MAX_NOTIFY_BATCH;
          }

          await db.exec(
            'UPDATE elections SET notify_close_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
            [election.id],
          ).catch(err => console.error('[notify-close] update failed:', err));

          console.log(`[notify-close] "${election.name}" → ${totalQueued} emails encolados`);
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
        // No hay acción explícita de "cerrar y certificar": una elección se
        // considera cerrada por end_time/is_active. Se reintenta en cada pasada
        // porque una elección con un voto todavía 'pending' en vote_attempts no
        // destruye su sal hasta que ese intento se resuelva (ver electionSalt.ts).
        destroyExpiredElectionSalts(getDbClient()).then(n => {
          if (n > 0) console.log(`[election-salt] ${n} sal(es) efímera(s) destruida(s)`);
        }).catch(err =>
          console.error('[election-salt] error:', formatError(err)),
        );
        // Plazos de conservación de la Política de Privacidad, sección 6.
        runRetentionJobs(getDbClient()).then(r => {
          const total = r.rejectedRequestsPurged + r.emailLogPurged + r.authTokensPurged
            + r.accountsAnonymized + r.adminActionLogPurged;
          if (total > 0) console.log('[retention]', r);
        }).catch(err =>
          console.error('[retention] error:', formatError(err)),
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
        // pueden sustituir. Cuando no hay evento y se conoce la tx concreta del
        // intento (pendingTx, guardado por recordPendingTx), findVote() mira su
        // recibo directamente: distingue revertida/reemplazada de simplemente
        // lenta (paso 4, antes findVote solo podía devolver 'no-esta').
        const checkOnChain = async (
          nullifierHash: string,
          onChainElectionId?: number | null,
          contractAddress?: string | null,
          pendingTx?: { txHash: string; nonce: number | null } | null,
        ): Promise<BusquedaDeVoto> =>
          (await getVotePort(contractAddress)?.findVote(nullifierHash, onChainElectionId, contractAddress, pendingTx)) ??
          // Sin cadena configurada no hay respuesta posible, que no es lo mismo
          // que "el voto no está": el intento se queda pendiente (BC-24).
          { estado: 'sin-respuesta', motivo: 'blockchain no configurada' };

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



