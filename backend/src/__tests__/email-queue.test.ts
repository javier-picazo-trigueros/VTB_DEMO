import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { createFixtureUser } from './helpers/fixtures.js';

/**
 * HIGH-1 — cola de emails.
 *
 * Los dos escenarios que el diseño anterior resolvía mal:
 *   1. dos mecanismos de reintento compitiendo → envíos duplicados
 *   2. el proceso muere a mitad → filas colgadas
 *
 * Y P1-7, más abajo: los tokens de los enlaces no pueden quedar en email_log.
 */

// El cliente de Resend se sustituye por un doble que cuenta envíos.
const sent: { to: string; idempotencyKey?: string; text: string; html: string }[] = [];
let failNext = 0;

vi.mock('../services/email/client.js', () => ({
  resendClient: { emails: {} },           // truthy: la cola cree que hay API key
  RESEND_FROM: 'test <test@test.vtb>',
  sendRaw: vi.fn(async (payload: any, idempotencyKey?: string) => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('simulated resend failure');
    }
    sent.push({ to: payload.to, idempotencyKey, text: payload.text, html: payload.html });
    return `resend-${sent.length}`;
  }),
}));

async function rows(where = '1=1', params: unknown[] = []) {
  const db = getDatabase();
  return db.run<any>(`SELECT * FROM email_log WHERE ${where} ORDER BY id`, params);
}

async function clearLog() {
  await getDatabase().exec('DELETE FROM email_log');
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const TOKEN_RE = /token=([0-9a-f]{64})/;
const past = () => new Date(Date.now() - 1000).toISOString();

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
      [past(), row.id],
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
      ['muerto@test.vtb', past()],
    );

    failNext = 1;
    await processEmailQueue();

    const [row] = await rows("recipient = 'muerto@test.vtb'");
    expect(row.status).toBe('dead');
    // Estado final: el cuerpo ya no hace falta y se vacía.
    expect(row.html_body).toBeNull();
    expect(row.text_body).toBeNull();

    // Un ciclo posterior ya no lo toca.
    await processEmailQueue();
    expect(sent.map(s => s.to)).not.toContain('muerto@test.vtb');
  });
});

describe('P1-7 — los tokens de los enlaces no quedan en email_log', () => {
  beforeEach(async () => {
    sent.length = 0;
    failNext = 0;
    await clearLog();
  });

  afterEach(async () => { await clearLog(); });

  async function tokensOf(userId: number, type: 'reset' | 'invitation') {
    return getDatabase().run<{ token_hash: string; used_at: string | null }>(
      'SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = ? AND type = ? ORDER BY id',
      [userId, type],
    );
  }

  it('un correo normal vacía su cuerpo al quedar enviado', async () => {
    const { enqueue } = await import('../services/email/queue.js');

    enqueue({ to: 'normal@test.vtb', subject: 's', html: '<p>h</p>', text: 't', template: 'x' });
    await vi.waitFor(async () => {
      expect((await rows("recipient = 'normal@test.vtb'"))[0]?.status).toBe('sent');
    }, { timeout: 5000 });

    const [row] = await rows("recipient = 'normal@test.vtb'");
    expect(row.html_body).toBeNull();
    expect(row.text_body).toBeNull();
  });

  it('recuperación: el token sale en el correo, pero nunca se guarda en email_log', async () => {
    const user = await createFixtureUser();
    const { sendPasswordReset } = await import('../services/email/index.js');

    sendPasswordReset({ to: user.email, userId: user.id, name: 'Persona' });
    await vi.waitFor(async () => {
      expect((await rows('recipient = ?', [user.email]))[0]?.status).toBe('sent');
    }, { timeout: 5000 });

    const mail = sent.find(s => s.to === user.email)!;
    const token = mail.text.match(TOKEN_RE)?.[1];
    expect(token, 'el correo enviado lleva el enlace con token').toBeTruthy();
    expect(mail.html).toContain(`/auth/reset-password?token=${token}`);

    const [row] = await rows('recipient = ?', [user.email]);
    expect(row.template_name).toBe('password_reset');
    expect(row.html_body).toBeNull();
    expect(row.text_body).toBeNull();
    // Ni el token ni su hash aparecen en ninguna columna de la fila.
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(token!);
    expect(stored).not.toContain(sha256(token!));

    // Y el enlace es válido: su hash está en password_reset_tokens, sin usar.
    const tokens = await tokensOf(user.id, 'reset');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).toBe(sha256(token!));
    expect(tokens[0].used_at).toBeNull();
  });

  it('un reintento emite token nuevo, anula el anterior y usa otra clave de idempotencia', async () => {
    const user = await createFixtureUser();
    const { sendPasswordReset } = await import('../services/email/index.js');
    const { processEmailQueue } = await import('../services/email/queue.js');

    failNext = 1; // el primer intento emite un token y falla al enviar
    sendPasswordReset({ to: user.email, userId: user.id, name: 'Persona' });
    await vi.waitFor(async () => {
      const [r] = await rows('recipient = ?', [user.email]);
      expect(r?.status).toBe('queued');
      expect(r?.attempts).toBe(1);
    }, { timeout: 5000 });

    // Esperando reintento: sin cuerpo, solo los datos para renderizar.
    const [pending] = await rows('recipient = ?', [user.email]);
    expect(pending.html_body).toBeNull();
    expect(pending.text_body).toBeNull();
    expect(JSON.parse(pending.template_data)).toMatchObject({ userId: user.id });
    expect(pending.template_data).not.toMatch(/[0-9a-f]{64}/);
    expect(await tokensOf(user.id, 'reset')).toHaveLength(1);

    await getDatabase().exec('UPDATE email_log SET next_retry_at = ? WHERE id = ?', [past(), pending.id]);
    await processEmailQueue();

    expect(sent).toHaveLength(1);
    const token = sent[0].text.match(TOKEN_RE)![1];
    const tokens = await tokensOf(user.id, 'reset');
    expect(tokens).toHaveLength(2);
    const valid = tokens.filter(t => t.used_at === null);
    expect(valid, 'solo el token del correo que salió sigue siendo válido').toHaveLength(1);
    expect(valid[0].token_hash).toBe(sha256(token));
    // El contenido cambió respecto al intento 1: la clave también.
    expect(sent[0].idempotencyKey).toBe(`${pending.idempotency_key}:2`);
  });

  it('una recuperación que lleva más de 15 minutos sin salir no se envía ni emite token', async () => {
    const user = await createFixtureUser();
    const { processEmailQueue } = await import('../services/email/queue.js');

    await getDatabase().exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, template_data,
          status, attempts, next_retry_at, idempotency_key, created_at)
       VALUES (?, 'password_reset', 's', ?, 'queued', 3, ?, 'key-late', CURRENT_TIMESTAMP)`,
      [
        user.email,
        JSON.stringify({ userId: user.id, name: 'Tarde', requestedAt: new Date(Date.now() - 16 * 60_000).toISOString() }),
        past(),
      ],
    );

    await processEmailQueue();

    const [row] = await rows('recipient = ?', [user.email]);
    expect(row.status).toBe('dead');
    expect(row.last_error).toMatch(/15 minutos/);
    expect(sent.map(s => s.to)).not.toContain(user.email);
    expect(await tokensOf(user.id, 'reset')).toHaveLength(0);
  });

  it('invitación: enlace a set-password con un token de tipo invitation', async () => {
    const user = await createFixtureUser();
    const { sendCensusInvitation } = await import('../services/email/index.js');

    sendCensusInvitation({
      to: user.email, userId: user.id, name: 'Invitada',
      electionName: 'Elección P1-7', institutionName: 'test.vtb',
    });
    await vi.waitFor(async () => {
      expect((await rows('recipient = ?', [user.email]))[0]?.status).toBe('sent');
    }, { timeout: 5000 });

    const mail = sent.find(s => s.to === user.email)!;
    const token = mail.text.match(/\/auth\/set-password\?token=([0-9a-f]{64})/)?.[1];
    expect(token).toBeTruthy();

    const tokens = await tokensOf(user.id, 'invitation');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).toBe(sha256(token!));

    const [row] = await rows('recipient = ?', [user.email]);
    expect(row.subject).toBe('Invitación para votar en "Elección P1-7" — test.vtb');
    expect(row.html_body).toBeNull();
    expect(JSON.stringify(row)).not.toContain(token!);
  });

  it('limpieza de datos antiguos: anula los tokens filtrados y vacía los cuerpos', async () => {
    const user = await createFixtureUser();
    const db = getDatabase();
    const future = new Date(Date.now() + 86400_000).toISOString();

    const leakedSent = crypto.randomBytes(32).toString('hex');
    const leakedPending = crypto.randomBytes(32).toString('hex');
    const neverLogged = crypto.randomBytes(32).toString('hex');
    for (const [token, type] of [[leakedSent, 'invitation'], [leakedPending, 'reset'], [neverLogged, 'reset']]) {
      await db.exec(
        'INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, ?, ?)',
        [user.id, sha256(token), type, future],
      );
    }

    // Filas como las dejaba el código anterior: el enlace dentro del cuerpo.
    const insert = (template: string, status: string, token: string | null, key: string) => db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body,
          status, attempts, next_retry_at, idempotency_key, created_at)
       VALUES (?, ?, 's', ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
      [
        user.email, template,
        token ? `<a href="http://x/auth/set-password?token=${token}">ir</a>` : '<p>hola</p>',
        token ? `http://x/auth/set-password?token=${token}` : 'hola',
        status, future, key,
      ],
    );
    await insert('invitation', 'sent', leakedSent, 'k-old-sent');
    await insert('password_reset', 'queued', leakedPending, 'k-old-pending');
    await insert('vote_confirmation', 'sent', null, 'k-old-vote');

    await db.scrubLoggedEmailTokens();

    const usedAt = async (token: string) =>
      (await db.get<{ used_at: string | null }>(
        'SELECT used_at FROM password_reset_tokens WHERE token_hash = ?', [sha256(token)],
      ))?.used_at;
    expect(await usedAt(leakedSent), 'token que aparecía en un correo enviado').not.toBeNull();
    expect(await usedAt(leakedPending), 'token que aparecía en un correo pendiente').not.toBeNull();
    expect(await usedAt(neverLogged), 'token que nunca se guardó en claro').toBeNull();

    const byKey = async (key: string) => (await rows('idempotency_key = ?', [key]))[0];
    const pendingRow = await byKey('k-old-pending');
    expect(pendingRow.status).toBe('dead');
    expect(pendingRow.last_error).toMatch(/P1-7/);
    for (const key of ['k-old-sent', 'k-old-pending', 'k-old-vote']) {
      const r = await byKey(key);
      expect(r.html_body, key).toBeNull();
      expect(r.text_body, key).toBeNull();
    }
  });
});
