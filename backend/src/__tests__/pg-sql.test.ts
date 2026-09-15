/**
 * Traducción SQLite→PostgreSQL de la DAL.
 *
 * Estos tests existen porque la migración a PostgreSQL se verifica en un entorno
 * sin PostgreSQL: los 73 tests del proyecto corren sobre SQLite en memoria, así
 * que ninguna incompatibilidad de motor se manifiesta en ellos. Aquí se comprueba
 * la capa de traducción en sí, que es lo único que sí se puede verificar sin una
 * base de datos delante.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSql, toPositional } from '../db/postgres.js';

describe('toPositional', () => {
  it('numera los placeholders en orden de aparición', () => {
    expect(toPositional('SELECT * FROM users WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM users WHERE a = $1 AND b = $2',
    );
  });

  it('respeta el orden cuando el WHERE se construye por concatenación', () => {
    // Reproduce el patrón de admin.ts: el SQL se monta con plantillas y el array
    // de parámetros se llena en el mismo orden. Si la numeración se desalineara,
    // el filtro por dominio compararía contra el valor equivocado.
    const where = "(email LIKE '%@' || ? OR email LIKE '%@%.' || ?)";
    const sql = `SELECT COUNT(*) FROM users WHERE status = ? AND ${where}`;
    expect(toPositional(sql)).toBe(
      "SELECT COUNT(*) FROM users WHERE status = $1 AND (email LIKE '%@' || $2 OR email LIKE '%@%.' || $3)",
    );
  });

  it('deja intacto un SQL sin placeholders', () => {
    expect(toPositional('SELECT COUNT(*) FROM elections')).toBe(
      'SELECT COUNT(*) FROM elections',
    );
  });
});

describe('normalizeSql — INSERT OR IGNORE', () => {
  it('traduce a ON CONFLICT DO NOTHING', () => {
    const out = normalizeSql(
      'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
    );
    expect(out).toBe(
      'INSERT INTO election_access (election_id, email_domain) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
    );
  });

  it('coloca RETURNING después del ON CONFLICT, no antes', () => {
    const out = normalizeSql('INSERT OR IGNORE INTO candidates (name) VALUES (?)');
    expect(out.indexOf('ON CONFLICT')).toBeLessThan(out.indexOf('RETURNING'));
  });
});

describe('normalizeSql — tablas sin columna id', () => {
  // election_voters tiene PRIMARY KEY (election_id, user_id) y ninguna columna id.
  // Añadirle RETURNING id hacía fallar la consulta con
  // `column "id" does not exist`, y es la tabla del censo: 13 llamadas.

  it('no añade RETURNING id a election_voters', () => {
    const out = normalizeSql(
      'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
    );
    expect(out).toBe(
      'INSERT INTO election_voters (election_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    );
    expect(out).not.toContain('RETURNING');
  });

  it('tampoco en un INSERT normal sobre election_voters', () => {
    const out = normalizeSql(
      'INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)',
    );
    expect(out).not.toContain('RETURNING');
  });

  it('sigue añadiendo RETURNING id a las tablas que sí lo tienen', () => {
    // El lastID de este INSERT se usa para crear el token de invitación.
    const out = normalizeSql(
      'INSERT INTO users (email, name) VALUES (?, ?)',
    );
    expect(out).toContain('RETURNING id');
  });

  it('reconoce la tabla aunque el SQL venga con saltos de línea y sangría', () => {
    const out = normalizeSql(`
      INSERT OR IGNORE INTO election_voters (election_id, user_id)
      VALUES (?, ?)
    `);
    expect(out).not.toContain('RETURNING');
  });
});

describe('normalizeSql — no toca lo que no debe', () => {
  it('no añade RETURNING a un SELECT', () => {
    const out = normalizeSql('SELECT id FROM users WHERE email = ?');
    expect(out).toBe('SELECT id FROM users WHERE email = $1');
  });

  it('no añade RETURNING a un UPDATE', () => {
    const out = normalizeSql('UPDATE users SET name = ? WHERE id = ?');
    expect(out).toBe('UPDATE users SET name = $1 WHERE id = $2');
  });

  it('no añade RETURNING a un DELETE', () => {
    const out = normalizeSql('DELETE FROM email_log WHERE id = ?');
    expect(out).toBe('DELETE FROM email_log WHERE id = $1');
  });
});

describe('sin literales 0/1 sobre columnas BOOLEAN', () => {
  // Guard estático, no un test de comportamiento.
  //
  // PostgreSQL rechaza `is_active = 1` y `VALUES (…, 1, …)` sobre una columna
  // BOOLEAN con `operator does not exist: boolean = integer`. SQLite lo acepta,
  // así que los 85 tests pasan igual y el fallo solo aparece en producción.
  //
  // Este guard existe porque el barrido manual ya falló una vez: buscaba
  // `columna = 1` y no cazó los literales posicionales dentro de un VALUES,
  // que eran 16 en 9 INSERT.

  const BOOL_COLS = [
    'is_approved', 'is_eligible', 'must_change_password',
    'is_active', 'used', 'revoked',
  ];

  const SRC_DIRS = ['src/routes', 'src/scripts', 'src/middleware', 'src/services'];

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) out.push(full);
      }
    };
    for (const d of SRC_DIRS) if (fs.existsSync(d)) walk(d);
    out.push('src/app.ts', 'src/index.ts');
    return out.filter(f => fs.existsSync(f));
  }

  it('ninguna comparación ni asignación usa 0/1 en una columna booleana', () => {
    const offenders: string[] = [];
    // Barras dobles a propósito: dentro de un template literal `\b` es el
    // carácter de retroceso y `\s` la letra s. Escrita con barras simples, esta
    // regex no podía coincidir con nada y el test pasaba siempre en vacío.
    const rx = new RegExp(`\\b(${BOOL_COLS.join('|')})\\s*=\\s*[01]\\b`, 'g');

    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        // Ignora comentarios: varios explican precisamente el cambio.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        const m = code.match(rx);
        if (m) offenders.push(`${file}:${i + 1} → ${m.join(', ')}`);
      });
    }

    expect(offenders, `Usa TRUE/FALSE:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('ningún parámetro booleano se pasa como 0/1', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/\?\s*1\s*:\s*0|\?\s*0\s*:\s*1/.test(code)) {
          offenders.push(`${file}:${i + 1} → ${code.trim()}`);
        }
      });
    }
    expect(offenders, `Pasa un boolean real:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('ninguna consulta se escapa de la transacción', () => {
  // El fallo que este guard persigue:
  //
  //   await withTransaction(async (tx) => {
  //     await tx.exec('INSERT INTO users …');
  //     await db.exec('INSERT INTO election_voters …');   // ← fuera de la tx
  //   });
  //
  // En PostgreSQL, `db` coge otra conexión del pool: ese INSERT se confirma solo
  // y el ROLLBACK no lo deshace. Compila, pasa los tests sobre SQLite (una sola
  // conexión, da igual) y solo se ve en producción como datos a medias.
  //
  // Ya pasa así en scripts/migrate-sqlite-to-pg.ts, que abre BEGIN en una
  // conexión y hace los INSERT por el pool.

  const TX_OPEN = /(?:withTransaction|\.transaction)\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  const ESCAPED = /\b(?:db|getDbClient\(\))\s*\.\s*(?:get|run|exec|transaction)\s*\(/;

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); }
        else if (entry.name.endsWith('.ts')) out.push(full);
      }
    };
    walk('src');
    return out;
  }

  /** Devuelve el cuerpo del callback desde la llave de apertura. */
  function callbackBody(text: string, braceIndex: number): string {
    let depth = 0;
    for (let i = braceIndex; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) return text.slice(braceIndex, i + 1);
      }
    }
    return text.slice(braceIndex);
  }

  it('dentro de un callback de transacción no se usa el cliente general', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      TX_OPEN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TX_OPEN.exec(text)) !== null) {
        const braceIndex = text.indexOf('{', m.index + m[0].length - 1);
        const body = callbackBody(text, braceIndex);
        const line = text.slice(0, m.index).split(/\r?\n/).length;

        for (const [i, raw] of body.split(/\r?\n/).entries()) {
          const code = raw.replace(/\/\/.*$/, '');
          if (ESCAPED.test(code)) {
            offenders.push(`${file}:${line + i} → ${code.trim()}`);
          }
        }
      }
    }

    expect(
      offenders,
      `Estas consultas quedan FUERA de la transacción. Usa el cliente del ` +
      `callback (tx), no db:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('todos los ? del SQL son placeholders de parámetro', () => {
  // toPositional hace `sql.replace(/\?/g, …)` sobre el texto entero, sin saber
  // qué es literal y qué no. Un `?` dentro de una cadena SQL o de un patrón LIKE
  // se convertiría en $N: corrompe el literal Y desplaza la numeración de todos
  // los placeholders reales que vengan después, de modo que cada parámetro se
  // aplica a la columna equivocada.
  //
  // No lo detecta el typecheck ni los tests sobre SQLite, donde `?` es el
  // placeholder nativo y nadie reescribe nada. Solo aparecería en producción,
  // como datos cruzados.

  const CALL = /\b(?:db|tx|client|inner)\s*\.\s*(?:get|run|exec)\s*(?:<[^>]*>)?\s*\(/g;

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); }
        else if (entry.name.endsWith('.ts')) out.push(full);
      }
    };
    walk('src');
    return out;
  }

  /** Extrae el literal de cadena que sigue al paréntesis de apertura. */
  function firstStringArg(text: string, from: number): string | null {
    let j = from;
    while (j < text.length && ' \n\r\t'.includes(text[j])) j++;
    const q = text[j];
    if (q !== '`' && q !== "'" && q !== '"') return null;
    let k = j + 1;
    const buf: string[] = [];
    while (k < text.length) {
      if (text[k] === '\\') { buf.push(text.slice(k, k + 2)); k += 2; continue; }
      if (text[k] === q) break;
      buf.push(text[k]); k++;
    }
    return buf.join('');
  }

  /** Devuelve los `?` que caen dentro de un literal SQL. */
  function questionMarksInsideLiterals(sql: string): string[] {
    const found: string[] = [];
    let inStr = false;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") {
        if (inStr && sql[i + 1] === "'") { i++; continue; } // '' = comilla escapada
        inStr = !inStr;
      } else if (c === '?' && inStr) {
        found.push(sql.slice(Math.max(0, i - 30), i + 10).replace(/\s+/g, ' '));
      }
    }
    return found;
  }

  it('ningún ? aparece dentro de un literal o de un patrón LIKE', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CALL.exec(text)) !== null) {
        const sql = firstStringArg(text, m.index + m[0].length);
        if (!sql) continue;
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        for (const ctx of questionMarksInsideLiterals(sql)) {
          offenders.push(`${file}:${line} → …${ctx}…`);
        }
      }
    }

    expect(
      offenders,
      `Estos ? no son placeholders y toPositional los convertiría en $N, ` +
      `descolocando los parámetros:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('marshalling de tipos numéricos de PostgreSQL', () => {
  // node-postgres devuelve BIGINT y NUMERIC como cadenas por defecto, para no
  // perder precisión por encima de 2^53. Todas las claves primarias del esquema
  // son BIGINT, igual que COUNT(*) y MAX(), así que sin registrar estos parsers
  // el código recibía "19" donde esperaba 19.
  //
  // El fallo concreto que esto arregla, encontrado ejecutando contra PostgreSQL:
  //
  //   const election_id_blockchain = (lastElection?.id || 0) + 1;
  //   // "19" + 1 === "191"   ← concatenación, no suma
  //
  // La elección creada se quedaba con election_id_blockchain 191. Los tests
  // sobre SQLite no lo veían porque allí todo llega ya como number.
  //
  // Este test no necesita base de datos: comprueba que los parsers están
  // registrados al importar el módulo.

  it('INT8 se parsea como number, no como string', async () => {
    await import('../db/postgres.js');
    const pg = (await import('pg')).default;
    const parse = pg.types.getTypeParser(pg.types.builtins.INT8);
    expect(typeof parse('19')).toBe('number');
    expect(parse('19')).toBe(19);
  });

  it('la suma sobre un INT8 parseado es aritmética, no concatenación', async () => {
    await import('../db/postgres.js');
    const pg = (await import('pg')).default;
    const parse = pg.types.getTypeParser(pg.types.builtins.INT8);
    expect((parse('19') as number) + 1).toBe(20);
  });

  it('NUMERIC se parsea como number', async () => {
    await import('../db/postgres.js');
    const pg = (await import('pg')).default;
    const parse = pg.types.getTypeParser(pg.types.builtins.NUMERIC);
    expect(typeof parse('42.5')).toBe('number');
    expect(parse('42.5')).toBe(42.5);
  });

  it('los valores reales de VTB caben de sobra bajo 2^53', () => {
    // Justifica que convertir a number sea seguro aquí.
    const mayores = {
      epochSegundos: 2_000_000_000,      // año 2033
      bloqueEthereum: 50_000_000,
      idDeFila: 1_000_000_000,
    };
    for (const [k, v] of Object.entries(mayores)) {
      expect(v, k).toBeLessThan(Number.MAX_SAFE_INTEGER);
    }
  });
});
