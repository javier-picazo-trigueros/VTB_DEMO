/**
 * Comprueba que el bundle de producción no incrusta el entorno.
 *
 * Compila el frontend con VITE_API_URL apuntando a un host de mentira, en un
 * directorio temporal (no toca dist/), y falla si el resultado contiene ese
 * host o el objeto de entorno serializado. En producción la API es siempre
 * '/backend' (src/utils/apiBase.js): VITE_API_URL no debe llegar al bundle.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTINELA = 'debe-no-aparecer';
const salida = mkdtempSync(path.join(tmpdir(), 'vtb-bundle-'));

function ficheros(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : [p];
  });
}

const inicio = Date.now();
try {
  execFileSync(
    process.execPath,
    [path.join(raiz, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', salida, '--emptyOutDir'],
    {
      cwd: raiz,
      stdio: 'pipe',
      env: { ...process.env, VITE_API_URL: `https://${SENTINELA}.example`, NODE_ENV: 'production' },
    },
  );

  const problemas = [];
  for (const f of ficheros(salida).filter((x) => /\.(js|css|html)$/.test(x))) {
    const texto = readFileSync(f, 'utf8');
    if (texto.includes(SENTINELA)) problemas.push(`${path.basename(f)}: contiene "${SENTINELA}" (VITE_API_URL llegó al bundle)`);
    if (texto.includes('VITE_API_URL:')) problemas.push(`${path.basename(f)}: contiene el objeto de entorno serializado ("VITE_API_URL:")`);
  }

  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  if (problemas.length) {
    console.error(`check:bundle FALLA (${seg} s):\n- ${problemas.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`check:bundle OK (${seg} s): el bundle no incrusta VITE_API_URL ni el entorno.`);
  }
} finally {
  rmSync(salida, { recursive: true, force: true });
}
