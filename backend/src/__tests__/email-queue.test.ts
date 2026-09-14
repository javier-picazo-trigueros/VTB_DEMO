import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getDatabase } from '../config/database.js';

/**
 * HIGH-1 — cola de emails.
 *
 * Los dos escenarios que el diseño anterior resolvía mal:
 *   1. dos mecanismos de reintento compitiendo → envíos duplicados
 *   2. el proceso muere a mitad → filas colgadas
 */

// El cliente de Resend se sustituye por un doble que cuenta envíos.
const sent: { to: string; idempotencyKey?: string }[] = [];
let failNext = 0;

vi.mock('../services/email/client.js', () => ({
  resendClient: { emails: {} },           // truthy: la cola cree que hay API key
  RESEND_FROM: 'test <test@test.vtb>',
  sendRaw: vi.fn(async (payload: any, idempotencyKey?: string) => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('simulated resend failure');
    }
    sent.push({ to: payload.to, idempotencyKey });
    return `resend-${sent.length}`;
  }),
}));

async function rows(where = '1=1') {
  const db = getDatabase();
  return db.run<any>(`SELECT * FROM email_log WHERE ${where} ORDER BY id`);
}

async function clearLog() {
  await getDatabase().exec('DELETE FROM email_log');
}

describe('HIGH-1 — cola de emails', () => {
  beforeEach(async () => {
    sent.length = 0;
    failNext = 0;
    await clearLog();
  });

  afterEach(async () => { await clearLog(); });

  it('un email encolado se envía una sola vez', async () => {
    const { enqueue, processEmailQueue } = await import('../services/email/queue.js');

    enqueue({ to: 'uno@test.vtb', subject: 's', html: '<p>h</p>', text: 't', template: 'x' });
    await vi.waitFor(async () => {
      expect((await rows("status = 'sent'")).length).toBe(1);
    }, { timeout: 5000 });

    // El job periódico corre después: no debe reenviar nada.
    await processEmailQueue();
    await processEmailQueue();

    expect(sent.filter(s => s.to === 'uno@test.vtb')).toHaveLength(1);
  });

  it('cada fila lleva su idempotency_key y se reutiliza en el reintento', async () => {
    const { enqueue, processEmailQueue } = await import('../services/email/queue.js');

    failNext = 1; // el primer intento falla
    enqueue({ to: 'idem@test.vtb', subject: 's', html: '<p>h</p>', text: 't', template: 'x' });

    await vi.waitFor(async () => {
      const [row] = await rows("recipient = 'idem@test.vtb'");
      expect(row?.attempts).toBeGreaterThanOrEqual(1);
    }, { timeout: 5000 });

    const [row] = await rows("recipient = 'idem@test.vtb'");
    expect(row.idempotency_key).toBeTruthy();
    expect(row.status).toBe('queued');       // pendiente de reintento, no 'failed'
    expect(row.next_retry_at).toBeTruthy();  // el backoff vive en la BD

    // Forzamos que sea elegible ya y dejamos que el worker lo reintente.
    await getDatabase().exec(
      'UPDATE email_log SET next_retry_at = ? WHERE id = ?',
      [new Date(Date.now() - 1000).toISOString(), row.id],
    );
    await processEmailQueue();

    expect(sent).toHaveLength(1);
    expect(sent[0].idempotencyKey).toBe(row.idempotency_key);
  });

  it('CRASH entre el INSERT y el envío: la fila no queda huérfana', async () => {
    const { processEmailQueue } = await import('../services/email/queue.js');
    const db = getDatabase();

    // Simula exactamente eso: fila insertada, proceso muerto antes de enviar.
    // Nadie la reclamó nunca, así que sigue en 'queued' con attempts = 0.
    await db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body,
          status, attempts, next_retry_at, idempotency_key, created_at)
       VALUES (?, 'crash', 's', '<p>h</p>', 't', 'queued', 0, ?, 'key-crash', CURRENT_TIMESTAMP)`,
      ['huerfano@test.vtb', new Date(Date.now() - 60_000).toISOString()],
    );

    await processEmailQueue();

    const [row] = await rows("recipient = 'huerfano@test.vtb'");
    expect(row.status).toBe('sent');
    expect(sent.map(s => s.to)).toContain('huerfano@test.vtb');
  });

  it('CRASH durante el envío: la fila en "sending" se recupera tras STUCK_MS', async () => {
    const { processEmailQueue } = await import('../services/email/queue.js');
    const db = getDatabase();

    // Fila reclamada por un proceso que murió hace 20 minutos.
    await db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body,
          status, attempts, claimed_at, idempotency_key, created_at)
       VALUES (?, 'crash', 's', '<p>h</p>', 't', 'sending', 1, ?, 'key-stuck', CURRENT_TIMESTAMP)`,
      ['colgado@test.vtb', new Date(Date.now() - 20 * 60_000).toISOString()],
    );

    await processEmailQueue();

    const [row] = await rows("recipient = 'colgado@test.vtb'");
    expect(row.status).toBe('sent');
    // Reutiliza la clave original: Resend deduplica si el envío sí salió.
    expect(sent.find(s => s.to === 'colgado@test.vtb')?.idempotencyKey).toBe('key-stuck');
  });

  it('una fila en "sending" reciente NO se toca (no hay doble envío)', async () => {
    const { processEmailQueue } = await import('../services/email/queue.js');
    const db = getDatabase();

    // Otro worker la está procesando ahora mismo.
    await db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body,
          status, attempts, claimed_at, idempotency_key, created_at)
       VALUES (?, 'inflight', 's', '<p>h</p>', 't', 'sending', 1, ?, 'key-inflight', CURRENT_TIMESTAMP)`,
      ['envuelo@test.vtb', new Date().toISOString()],
    );

    await processEmailQueue();

    const [row] = await rows("recipient = 'envuelo@test.vtb'");
    expect(row.status).toBe('sending');
    expect(sent.map(s => s.to)).not.toContain('envuelo@test.vtb');
  });

  it('tras agotar los intentos la fila termina en "dead", no reintentándose para siempre', async () => {
    const { processEmailQueue } = await import('../services/email/queue.js');
    const db = getDatabase();

    await db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body,
          status, attempts, next_retry_at, idempotency_key, created_at)
       VALUES (?, 'dead', 's', '<p>h</p>', 't', 'queued', 5, ?, 'key-dead', CURRENT_TIMESTAMP)`,
      ['muerto@test.vtb', new Date(Date.now() - 1000).toISOString()],
    );

    failNext = 1;
    await processEmailQueue();

    const [row] = await rows("recipient = 'muerto@test.vtb'");
    expect(row.status).toBe('dead');

    // Un ciclo posterior ya no lo toca.
    await processEmailQueue();
    expect(sent.map(s => s.to)).not.toContain('muerto@test.vtb');
  });
});
