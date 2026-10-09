/**
 * Pantalla de resultados: casa con el resto de la app.
 *
 * Tenía emojis en botones, pestañas y avisos, botones rojo y morado, pestañas
 * verdes y un ancho distinto al de la cabina. Estos tests leen el código, como
 * voting-booth-ui.test.ts, y nombran lo que impiden que vuelva.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../../../frontend/src');
const results = readFileSync(path.join(src, 'pages/ElectionResults.jsx'), 'utf-8');

describe('ElectionResults.jsx', () => {
  it('no tiene emojis (los glifos de texto como ✓ valen)', () => {
    // las flechas de texto (↗ en los enlaces externos) no son emojis
    const emojis = [...results.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]).filter((c) => !/[←-⇿]/.test(c));
    expect(emojis).toEqual([]);
  });

  it('usa el color de marca en vez de botones rojo, morado y pestañas verdes', () => {
    expect(results).not.toMatch(/bg-red-600|bg-purple-600|bg-emerald-500 text-white/);
    expect(results).toMatch(/bg-brand-600 hover:bg-brand-700 text-white[^"]*"\s*>\s*Export PDF/);
    expect(results).toMatch(/activeTab === tabId\s*\?\s*'bg-brand-600 text-white'/);
  });

  it('tiene el mismo ancho de contenido que la cabina (max-w-6xl)', () => {
    expect(results).toMatch(/<main className="max-w-6xl mx-auto/);
  });
});
