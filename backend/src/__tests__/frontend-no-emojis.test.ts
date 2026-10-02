/**
 * La interfaz no usa emojis: se ven distinto en cada sistema, no heredan el color
 * del texto y rompen el estilo del resto de la app. Los iconos son SVG de línea
 * (frontend/src/components/Icons.jsx).
 *
 * Recorre TODO frontend/src (código y traducciones): un emoji nuevo en cualquier
 * página, componente o texto de i18n hace fallar el test. Valen los glifos de
 * texto (© ✓ ✗ y las flechas).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../../../frontend/src');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(jsx?|tsx?)$/.test(n) ? [p] : [];
  });
}

const esEmoji = (c: string) => !/[©←-⇿✓✔✗✕]/.test(c);

describe('el frontend no tiene emojis', () => {
  it('ningún fichero de frontend/src contiene emojis', () => {
    const mal: string[] = [];
    for (const f of ficheros(src)) {
      const texto = readFileSync(f, 'utf-8');
      for (const m of texto.matchAll(/\p{Extended_Pictographic}/gu)) {
        if (esEmoji(m[0])) mal.push(`${path.relative(src, f)}: ${m[0]} (U+${m[0].codePointAt(0)!.toString(16)})`);
      }
    }
    expect(mal).toEqual([]);
  });

  it('el recorrido encuentra los ficheros y detecta un emoji de verdad', () => {
    expect(ficheros(src).length).toBeGreaterThan(40);
    expect([...'Voto 🗳️ ok'.matchAll(/\p{Extended_Pictographic}/gu)].some((m) => esEmoji(m[0]))).toBe(true);
    expect([...'ver ↗ y ✓'.matchAll(/\p{Extended_Pictographic}/gu)].some((m) => esEmoji(m[0]))).toBe(false);
  });
});
