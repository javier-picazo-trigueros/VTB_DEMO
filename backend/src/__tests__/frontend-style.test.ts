/**
 * Un solo estilo en todas las páginas: el color de marca (brand, azul petróleo)
 * para las acciones principales, sin azules, verdes ni violetas sueltos.
 *
 * Los colores de ESTADO (insignias verdes/ámbar/rojas, puntos de "en vivo") y el
 * rojo de las acciones destructivas se quedan: significan algo. Lo que no puede
 * haber es un botón principal o una pestaña activa en otro color.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../../../frontend/src');
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.jsx$/.test(n) ? [p] : [];
  });
}
const paginas = ficheros(src);
const rel = (f: string) => path.relative(src, f).split(path.sep).join('/');

describe('estilo unificado', () => {
  it('ningún botón o banner se rellena de azul genérico (bg-blue-500/600/700)', () => {
    const mal = paginas.filter((f) => /\bbg-blue-(500|600|700)\b/.test(readFileSync(f, 'utf-8'))).map(rel);
    expect(mal).toEqual([]);
  });

  it('ningún botón se rellena de verde, violeta o morado (bg-emerald/violet/purple-500..800 con hover)', () => {
    const mal = paginas
      .filter((f) => /\bbg-(emerald|violet|purple)-(500|600|700) hover:bg-/.test(readFileSync(f, 'utf-8')))
      .map(rel);
    expect(mal).toEqual([]);
  });

  it('las pestañas activas del panel y de resultados usan el color de marca', () => {
    expect(readFileSync(path.join(src, 'pages/AdminPanel.jsx'), 'utf-8')).toMatch(/\? "bg-brand-600 text-white"/);
    expect(readFileSync(path.join(src, 'pages/ElectionResults.jsx'), 'utf-8')).toMatch(/'bg-brand-600 text-white'/);
  });

  it('los textos en español de la Landing llevan tilde y no hay tarjeta "privado"', () => {
    const i18n = readFileSync(path.join(src, 'i18n/config.ts'), 'utf-8');
    expect(i18n).not.toMatch(/Democratico|Matematicamente privado|Mathematically Private|Como funciona VTB|auditoria publica/);
    expect(i18n).toMatch(/privateTitle: "Un voto por persona"/);
  });
});
