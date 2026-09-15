/**
 * Todo enlace que sale por correo tiene que existir como ruta del frontend
 * (SCRUM-12).
 *
 * Durante meses los avisos de apertura y cierre apuntaron a `/elections/:id` y
 * `/elections/:id/results`, rutas que App.jsx no declara: el votante caía en el
 * comodín `path="*"` y veía la página de 404 el día que se abría la votación.
 * Nada falló nunca en el backend — las dos mitades no se hablan, así que la
 * única forma de que esto no se repita es un test que las compare.
 *
 * El test lee los dos lados del contrato en crudo, sin importar nada:
 *   - backend: los literales `${frontendUrl}/...` de donde se construyen los enlaces
 *   - frontend: los `path="..."` de App.jsx
 *
 * Es deliberadamente textual. Un test que importara el servicio de email y
 * mirara el correo renderizado no vería el problema: la URL es válida como
 * cadena, solo que al otro lado no hay nada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BACKEND_SRC = resolve(process.cwd(), 'src');
const APP_JSX = resolve(process.cwd(), '..', 'frontend', 'src', 'App.jsx');

/** Ficheros .ts del backend, sin tests. */
function backendSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      backendSources(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Enlaces emitidos: `${frontendUrl}/loquesea`. Las interpolaciones se
 * sustituyen por un valor concreto para poder compararlas con la ruta, y la
 * query string se descarta — react-router casa por path.
 */
function emittedPaths(): Array<{ path: string; file: string }> {
  const found: Array<{ path: string; file: string }> = [];

  for (const file of backendSources(BACKEND_SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const m of source.matchAll(/\$\{frontendUrl\}([^\s`'"]*)/g)) {
      const path = m[1]
        .replace(/\$\{[^}]+\}/g, '1')  // ${election.id} → 1
        .split('?')[0];
      found.push({ path, file: file.replace(BACKEND_SRC, 'src') });
    }
  }
  return found;
}

/** Rutas declaradas en App.jsx, el comodín aparte. */
function declaredRoutes(): string[] {
  const source = readFileSync(APP_JSX, 'utf-8');
  return [...source.matchAll(/path="([^"]+)"/g)]
    .map(m => m[1])
    .filter(p => p !== '*');
}

/** `/voting/:id` → casa con `/voting/1`. */
function routeMatches(route: string, path: string): boolean {
  const pattern = '^' + route
    .split('/')
    .map(seg => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/') + '$';
  return new RegExp(pattern).test(path);
}

describe('SCRUM-12 — los enlaces de los correos existen en el frontend', () => {
  it('encuentra los dos lados del contrato', () => {
    // Si un refactor mueve App.jsx o cambia la forma de construir los enlaces,
    // este test tiene que fallar en vez de pasar sin comprobar nada.
    expect(declaredRoutes().length, 'no se leyó ninguna ruta de App.jsx').toBeGreaterThan(5);
    expect(emittedPaths().length, 'no se encontró ningún enlace en el backend').toBeGreaterThan(3);
  });

  it('cada enlace emitido casa con una ruta declarada', () => {
    const routes = declaredRoutes();
    const rotos = emittedPaths()
      .filter(({ path }) => !routes.some(route => routeMatches(route, path)))
      .map(({ path, file }) => `${path} (emitido en ${file})`);

    expect(
      rotos,
      `Estos enlaces van a correos y caen en el 404 de App.jsx:\n  ${rotos.join('\n  ')}\n` +
      `Rutas declaradas: ${routes.join(', ')}`,
    ).toEqual([]);
  });

  it('los cuatro enlaces de correo siguen cubiertos', () => {
    // Las rutas concretas, por si un cambio deja de emitir alguna: el test de
    // arriba pasaría igual con cero enlaces.
    const paths = emittedPaths().map(e => e.path);

    expect(paths, 'invitación al censo').toContain('/auth/set-password');
    expect(paths, 'recuperación de contraseña').toContain('/auth/reset-password');
    expect(paths, 'aviso de apertura → papeleta').toContain('/voting/1');
    expect(paths, 'aviso de cierre → resultados').toContain('/results/1');
  });
});
