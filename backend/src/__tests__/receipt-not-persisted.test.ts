/**
 * SCRUM-17: el comprobante del voto (hash de la transacción, nullifier) se
 * muestra una sola vez y el frontend no lo persiste.
 *
 * Guardarlo en localStorage/sessionStorage/IndexedDB lo dejaría en el
 * navegador, recuperable después, que es justo lo que "un solo uso" evita.
 * Recorre el código del frontend: una llamada de almacenamiento que mencione
 * txData, txHash, nullifier o el recibo hace fallar el test.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const frontendSrc = path.resolve(__dirname, '../../../frontend/src');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(jsx?|tsx?)$/.test(n) ? [p] : [];
  });
}

/** Cada llamada de almacenamiento, con sus argumentos completos. */
function llamadasDeAlmacenamiento(codigo: string): string[] {
  const res: string[] = [];
  const re = /(localStorage|sessionStorage|indexedDB)\s*\.\s*\w+\(|document\.cookie\s*=/g;
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    let prof = m[0].endsWith('(') ? 1 : 0;
    let i = m.index + m[0].length;
    if (prof === 0) { while (i < codigo.length && codigo[i] !== '\n' && codigo[i] !== ';') i++; }
    else { for (; i < codigo.length && prof > 0; i++) { if (codigo[i] === '(') prof++; else if (codigo[i] === ')') prof--; } }
    res.push(codigo.slice(m.index, i));
  }
  return res;
}

const DELATA = /txData|txHash|tx_hash|nullifier|receipt|recibo|comprobante/i;

describe('el frontend no persiste el comprobante del voto', () => {
  it('ninguna llamada a localStorage, sessionStorage, IndexedDB o cookie menciona el comprobante', () => {
    const mal: string[] = [];
    for (const f of ficheros(frontendSrc)) {
      for (const l of llamadasDeAlmacenamiento(readFileSync(f, 'utf-8'))) {
        if (DELATA.test(l)) mal.push(`${path.relative(frontendSrc, f)}: ${l}`);
      }
    }
    expect(mal).toEqual([]);
  });

  it('el recorrido detecta un guardado del comprobante', () => {
    const malo = "localStorage.setItem('last-receipt', JSON.stringify(txData));";
    expect(llamadasDeAlmacenamiento(malo).filter((l) => DELATA.test(l))).toHaveLength(1);
  });

  it('el recorrido encuentra el código del frontend (no pasa en vacío)', () => {
    expect(ficheros(frontendSrc).length).toBeGreaterThan(20);
    expect(readFileSync(path.join(frontendSrc, 'pages/VotingBooth.jsx'), 'utf-8')).toMatch(/useState\(null\)/);
  });
});
