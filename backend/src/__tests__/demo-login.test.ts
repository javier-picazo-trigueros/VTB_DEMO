/**
 * POST /auth/demo-login — acceso de un clic a las cuentas de demostración.
 *
 * El botón "Demo" de la portada devolvía 401 para los dos perfiles: el frontend
 * llevaba 'demo123' y 'admin123' escritos a mano, y el seed dejó de usar
 * contraseñas fijas para cuentas con privilegios. Ahora el login lo hace el
 * servidor con las mismas variables de entorno que usa el seed.
 *
 * setup.ts fija SEED_DEMO_ADMIN_PASSWORD y SEED_DEMO_STUDENT_PASSWORD antes de
 * sembrar, y el endpoint las lee del mismo entorno: así se prueba que ambos
 * lados usan la misma fuente, que es justo lo que estaba roto.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

function cookieNames(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((c) => c.split('=')[0]);
}

describe('POST /auth/demo-login — camino feliz', () => {
  it('entra como votante de demostración y emite las tres cookies de sesión', async () => {
    const res = await request(app).post('/auth/demo-login').send({ profile: 'student' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('student@vtb.demo');
    expect(res.body.user.role).toBe('student');
    expect(cookieNames(res)).toEqual(
      expect.arrayContaining(['vtb_auth', 'vtb_refresh', 'vtb_csrf']),
    );
  });

  it('entra como administrador de demostración con la contraseña del entorno', async () => {
    const res = await request(app).post('/auth/demo-login').send({ profile: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@vtb.demo');
    expect(res.body.user.role).toBe('admin');
  });

  it('la sesión emitida es válida para /auth/me', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/demo-login').send({ profile: 'student' }).expect(200);
    const me = await agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('student@vtb.demo');
  });
});

describe('POST /auth/demo-login — la puerta está cerrada por defecto', () => {
  // El endpoint no pide credencial alguna al cliente: manda {profile} y el
  // servidor autentica con su propio entorno. Alcanzable desde internet, eso era
  // un bypass de autenticación — {"profile":"admin"} devolvía una sesión de
  // administrador a cualquiera. La llave la tiene ahora el despliegue.
  const saved = process.env.DEMO_LOGIN_ENABLED;
  afterEach(() => { process.env.DEMO_LOGIN_ENABLED = saved; });

  it('devuelve 404 y ninguna cookie si DEMO_LOGIN_ENABLED no está definida', async () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    const res = await request(app).post('/auth/demo-login').send({ profile: 'admin' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEMO_DISABLED');
    expect(cookieNames(res)).not.toContain('vtb_auth');
  });

  it('solo el valor exacto "true" abre la ruta', async () => {
    process.env.DEMO_LOGIN_ENABLED = 'false';
    expect((await request(app).post('/auth/demo-login').send({ profile: 'student' })).status).toBe(404);

    process.env.DEMO_LOGIN_ENABLED = '1';
    expect((await request(app).post('/auth/demo-login').send({ profile: 'student' })).status).toBe(404);
  });

  it('el perfil de administrador tampoco pasa con la ruta cerrada', async () => {
    // El caso que de verdad importa: sin esto, cualquiera obtenía rol admin.
    delete process.env.DEMO_LOGIN_ENABLED;
    const agent = request.agent(app);
    await agent.post('/auth/demo-login').send({ profile: 'admin' }).expect(404);

    const me = await agent.get('/auth/me');
    expect(me.status).toBe(401);
  });
});

describe('POST /auth/demo-login — lo que NO debe permitir', () => {
  const savedAdmin = process.env.SEED_DEMO_ADMIN_PASSWORD;
  afterEach(() => { process.env.SEED_DEMO_ADMIN_PASSWORD = savedAdmin; });

  it('rechaza un perfil que no está en la lista cerrada', async () => {
    const res = await request(app).post('/auth/demo-login').send({ profile: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('ignora cualquier email que mande el cliente', async () => {
    // Si el endpoint aceptase un email del cuerpo, sería una puerta para entrar
    // en cualquier cuenta con la contraseña de demo. La cuenta sale de la lista.
    const res = await request(app)
      .post('/auth/demo-login')
      .send({ profile: 'student', email: 'superadmin@vtb.system' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('student@vtb.demo');
    expect(res.body.user.role).toBe('student');
  });

  it('devuelve 404 si la cuenta con privilegios no tiene su variable definida', async () => {
    // admin no tiene valor por defecto: sin la variable no hay acceso de demo,
    // en vez de caer a una contraseña adivinable.
    delete process.env.SEED_DEMO_ADMIN_PASSWORD;
    const res = await request(app).post('/auth/demo-login').send({ profile: 'admin' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEMO_NOT_CONFIGURED');
    expect(cookieNames(res)).not.toContain('vtb_auth');
  });

  it('devuelve 404 si la variable no coincide con la contraseña sembrada', async () => {
    // Pasa cuando se cambia la variable en el entorno sin volver a sembrar.
    // Comprueba contra el hash de la base igual que un login normal.
    process.env.SEED_DEMO_ADMIN_PASSWORD = 'otra-contrasena-que-no-es-la-sembrada';
    const res = await request(app).post('/auth/demo-login').send({ profile: 'admin' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEMO_NOT_SEEDED');
    expect(cookieNames(res)).not.toContain('vtb_auth');
  });
});
