/**
 * Proveedores de correo (EmailProvider): Render gratis bloquea el SMTP saliente,
 * así que solo hay APIs HTTP. Se prueba la selección por EMAIL_PROVIDER, el fallo
 * claro sin clave, que `console` no vuelca el correo completo y el mapeo de
 * cada API. Nada sale a la red: Resend se sustituye por un doble y Brevo usa un
 * fetch inyectado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const resendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class { emails = { send: resendSend }; },
}));

import {
  createEmailProvider, maskEmail, parseSender,
} from '../services/email/providers.js';

const message = { to: 'ana.garcia@universidad.es', subject: 'Tu invitación', html: '<p>cuerpo secreto</p>', text: 'cuerpo secreto' };

afterEach(() => { vi.restoreAllMocks(); resendSend.mockReset(); });

describe('selección de proveedor', () => {
  it('EMAIL_PROVIDER elige resend, brevo o console', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }).name).toBe('resend');
    expect(createEmailProvider({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k' }).name).toBe('brevo');
    expect(createEmailProvider({ EMAIL_PROVIDER: 'console' }).name).toBe('console');
  });

  it('el nombre no distingue mayúsculas ni espacios', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: ' Brevo ', BREVO_API_KEY: 'k' }).name).toBe('brevo');
  });

  it('un nombre desconocido es un error de arranque, no un envío silencioso a otro sitio', () => {
    expect(() => createEmailProvider({ EMAIL_PROVIDER: 'smtp' })).toThrow(/EMAIL_PROVIDER.*smtp/);
  });

  it('sin EMAIL_PROVIDER: resend si hay clave, console si no', () => {
    expect(createEmailProvider({ RESEND_API_KEY: 'k' }).name).toBe('resend');
    expect(createEmailProvider({}).name).toBe('console');
  });

  it('sin EMAIL_PROVIDER en producción: resend aunque falte la clave (falla claro, no finge enviar)', () => {
    const provider = createEmailProvider({ NODE_ENV: 'production' });
    expect(provider.name).toBe('resend');
    expect(provider.configError()).toMatch(/RESEND_API_KEY/);
  });
});

describe('falta la clave del proveedor elegido', () => {
  it('resend sin clave: configError con el nombre de la variable', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'resend' }).configError()).toMatch(/RESEND_API_KEY/);
  });

  it('brevo sin clave: configError con el nombre de la variable', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'brevo' }).configError()).toMatch(/BREVO_API_KEY/);
  });

  it('con clave no hay error, y console nunca lo tiene', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }).configError()).toBeNull();
    expect(createEmailProvider({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', EMAIL_FROM: 'V <v@x.es>' }).configError()).toBeNull();
    expect(createEmailProvider({ EMAIL_PROVIDER: 'console' }).configError()).toBeNull();
  });

  it('brevo con clave pero sin EMAIL_FROM: configError con el nombre de la variable', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k' }).configError()).toMatch(/EMAIL_FROM/);
  });

  it('send sin clave lanza en vez de enviar', async () => {
    const fetchSpy = vi.fn();
    await expect(createEmailProvider({ EMAIL_PROVIDER: 'brevo' }, fetchSpy).send(message)).rejects.toThrow(/BREVO_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('console', () => {
  it('no envía y el log lleva el destinatario enmascarado y el asunto, nada más', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'console' });

    const id = await provider.send(message);

    expect(provider.delivers).toBe(false);
    expect(id).toBeNull();
    const log = info.mock.calls.flat().join(' ');
    expect(log).toContain('a***@universidad.es');
    expect(log).toContain('Tu invitación');
    expect(log).not.toContain('ana.garcia');
    expect(log).not.toContain('cuerpo secreto');
  });

  it('maskEmail deja solo la inicial del usuario', () => {
    expect(maskEmail('ana.garcia@universidad.es')).toBe('a***@universidad.es');
    expect(maskEmail('sin-arroba')).toBe('***');
  });
});

describe('remitente EMAIL_FROM', () => {
  it('separa nombre y dirección, o acepta solo la dirección', () => {
    expect(parseSender('VoteTrustBlock <votos@gmail.com>')).toEqual({ name: 'VoteTrustBlock', email: 'votos@gmail.com' });
    expect(parseSender('votos@gmail.com')).toEqual({ email: 'votos@gmail.com' });
  });

  it('EMAIL_FROM manda; RESEND_FROM se sigue aceptando; hay un remitente por defecto', () => {
    const from = (env: Record<string, string>) =>
      createEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', ...env }).from;
    expect(from({ EMAIL_FROM: 'A <a@x.es>', RESEND_FROM: 'B <b@x.es>' })).toBe('A <a@x.es>');
    expect(from({ RESEND_FROM: 'B <b@x.es>' })).toBe('B <b@x.es>');
    expect(from({})).toMatch(/onboarding@resend\.dev/);
  });
});

describe('resend', () => {
  it('envía con el remitente y la clave de idempotencia, y devuelve el id', async () => {
    resendSend.mockResolvedValue({ data: { id: 'rs-1' }, error: null });
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'V <v@x.es>' });

    const id = await provider.send(message, { idempotencyKey: 'clave-1' });

    expect(id).toBe('rs-1');
    expect(resendSend).toHaveBeenCalledWith(
      { from: 'V <v@x.es>', to: message.to, subject: message.subject, html: message.html, text: message.text },
      { idempotencyKey: 'clave-1' },
    );
  });

  it('un error de Resend se lanza con su mensaje', async () => {
    resendSend.mockResolvedValue({ data: null, error: { message: 'dominio sin verificar' } });
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' });
    await expect(provider.send(message)).rejects.toThrow('dominio sin verificar');
  });
});

describe('brevo', () => {
  const brevo = (fetchImpl: typeof fetch, env: Record<string, string> = {}) =>
    createEmailProvider({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'clave-brevo', EMAIL_FROM: 'VTB <votos@gmail.com>', ...env }, fetchImpl);

  it('hace POST a la API v3 con api-key y el mensaje mapeado', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: '<abc@brevo>' }), { status: 201 }));

    const id = await brevo(fetchMock as unknown as typeof fetch).send(message);

    expect(id).toBe('<abc@brevo>');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['api-key']).toBe('clave-brevo');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'VTB', email: 'votos@gmail.com' },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    });
  });

  it('un error HTTP se lanza con el estado y el mensaje de Brevo, sin la clave ni el cuerpo del correo', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 }));

    const error = await brevo(fetchMock as unknown as typeof fetch).send(message).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).toContain('Key not found');
    expect((error as Error).message).not.toContain('clave-brevo');
    expect((error as Error).message).not.toContain('cuerpo secreto');
  });

  it('un fallo de red se lanza (la cola reintenta)', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(brevo(fetchMock as unknown as typeof fetch).send(message)).rejects.toThrow('fetch failed');
  });
});
