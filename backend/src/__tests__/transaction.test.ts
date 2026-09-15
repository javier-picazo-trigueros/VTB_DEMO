/**
 * Atomicidad de withTransaction.
 *
 * Estos tests corren sobre SQLite en memoria, que es donde corre todo lo demás.
 * Hasta ahora eso no habría probado nada: `SqliteAdapter.transaction` era
 * `return fn(this)`, un no-op que no revertía nada. Ahora hace BEGIN IMMEDIATE /
 * COMMIT / ROLLBACK de verdad, así que el rollback sí se puede verificar aquí.
 *
 * Lo que estos tests NO cubren, y hay que comprobar contra PostgreSQL de verdad:
 * que el callback reciba una conexión dedicada y que nada dentro del bloque se
 * escape al pool. En SQLite solo hay una conexión y ese fallo es invisible; para
 * eso está el guard estático de pg-sql.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { getDbClient, withTransaction } from '../db/index.js';

const db = getDbClient();

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `tx-${Date.now()}-${counter}@test.vtb`;
}

async function insertUser(client: { exec: typeof db.exec }, email: string): Promise<number> {
  const res = await client.exec(
    `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, is_eligible)
     VALUES (?, ?, ?, ?, 'student', TRUE, TRUE)`,
    [email, 'x', 'Tx Test', `TX-${email}`],
  );
  return res.lastID;
}

async function userExists(email: string): Promise<boolean> {
  const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  return row !== undefined;
}

describe('withTransaction — commit', () => {
  it('confirma todas las escrituras del bloque', async () => {
    const a = uniqueEmail();
    const b = uniqueEmail();

    await withTransaction(async (tx) => {
      await insertUser(tx, a);
      await insertUser(tx, b);
    });

    expect(await userExists(a)).toBe(true);
    expect(await userExists(b)).toBe(true);
  });

  it('devuelve el valor que retorna el callback', async () => {
    const result = await withTransaction(async () => 'listo');
    expect(result).toBe('listo');
  });
});

describe('withTransaction — rollback', () => {
  it('deshace TODAS las escrituras si el bloque falla a la mitad', async () => {
    // Este es el caso del CSV: 2 filas bien, la tercera revienta.
    const a = uniqueEmail();
    const b = uniqueEmail();

    await expect(
      withTransaction(async (tx) => {
        await insertUser(tx, a);
        await insertUser(tx, b);
        throw new Error('fila 3 inválida');
      }),
    ).rejects.toThrow('fila 3 inválida');

    expect(await userExists(a)).toBe(false);
    expect(await userExists(b)).toBe(false);
  });

  it('propaga el error original, no uno del rollback', async () => {
    class ImportError extends Error {}
    await expect(
      withTransaction(async (tx) => {
        await insertUser(tx, uniqueEmail());
        throw new ImportError('csv malformado');
      }),
    ).rejects.toBeInstanceOf(ImportError);
  });

  it('deshace también un fallo de la propia base de datos', async () => {
    // Segundo INSERT con el mismo email: viola UNIQUE y lanza desde el driver.
    const a = uniqueEmail();
    const dup = uniqueEmail();

    await expect(
      withTransaction(async (tx) => {
        await insertUser(tx, a);
        await insertUser(tx, dup);
        await insertUser(tx, dup); // UNIQUE constraint failed
      }),
    ).rejects.toThrow();

    expect(await userExists(a)).toBe(false);
    expect(await userExists(dup)).toBe(false);
  });
});

describe('withTransaction — lastID', () => {
  it('devuelve el id del INSERT dentro de la transacción', async () => {
    // En PostgreSQL esto sale del RETURNING id que añade normalizeSql, sin
    // consulta posterior. En SQLite, del lastID del driver. En ninguno de los
    // dos casos hay un SELECT extra que pudiera devolver la fila de otro.
    const email = uniqueEmail();
    const id = await withTransaction(async (tx) => insertUser(tx, email));

    expect(id).toBeGreaterThan(0);
    const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
    expect(row?.id).toBe(id);
  });

  it('permite encadenar: el id del primer INSERT sirve de FK en el segundo', async () => {
    // Es exactamente el patrón de import-voters: crear usuario y, con su id,
    // meterlo en el censo y generarle el token de invitación.
    const email = uniqueEmail();

    const { userId, tokenCount } = await withTransaction(async (tx) => {
      const uid = await insertUser(tx, email);
      await tx.exec(
        `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at)
         VALUES (?, ?, 'invitation', ?)`,
        [uid, `hash-${uid}-${Date.now()}`, new Date(Date.now() + 86400_000).toISOString()],
      );
      const rows = await tx.run<{ n: number }>(
        'SELECT COUNT(*) as n FROM password_reset_tokens WHERE user_id = ?',
        [uid],
      );
      return { userId: uid, tokenCount: Number(rows[0]?.n ?? 0) };
    });

    expect(userId).toBeGreaterThan(0);
    expect(tokenCount).toBe(1);
  });
});

describe('withTransaction — transacciones anidadas', () => {
  it('una transacción dentro de otra no rompe, y comparte su destino', async () => {
    const a = uniqueEmail();

    await expect(
      withTransaction(async (tx) => {
        await insertUser(tx, a);
        // Anidada: debe reutilizar la de fuera, no abrir un BEGIN nuevo
        // (SQLite daría "cannot start a transaction within a transaction").
        await tx.transaction(async (inner) => {
          await insertUser(inner, uniqueEmail());
        });
        throw new Error('falla después de la anidada');
      }),
    ).rejects.toThrow();

    // El rollback de fuera también se lleva lo escrito por la de dentro.
    expect(await userExists(a)).toBe(false);
  });
});

describe('withTransaction — concurrencia', () => {
  it('dos transacciones simultáneas no se pisan', async () => {
    // En SQLite hay una sola conexión: sin serializar, el segundo BEGIN daría
    // "cannot start a transaction within a transaction".
    const emails = [uniqueEmail(), uniqueEmail(), uniqueEmail()];

    await Promise.all(
      emails.map((e) => withTransaction(async (tx) => { await insertUser(tx, e); })),
    );

    for (const e of emails) {
      expect(await userExists(e)).toBe(true);
    }
  });

  it('el fallo de una no arrastra a la otra', async () => {
    const ok = uniqueEmail();
    const bad = uniqueEmail();

    const results = await Promise.allSettled([
      withTransaction(async (tx) => { await insertUser(tx, ok); }),
      withTransaction(async (tx) => {
        await insertUser(tx, bad);
        throw new Error('esta falla');
      }),
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(await userExists(ok)).toBe(true);
    expect(await userExists(bad)).toBe(false);
  });
});
