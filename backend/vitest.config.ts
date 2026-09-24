import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // El beforeAll de setup.ts crea el esquema y siembra la base ENTERA, y se
    // ejecuta una vez por fichero de test. Con los ficheros nuevos del recuento
    // verificable son ya 26 sembrando en paralelo, y a 60 s alguno se quedaba
    // corto en frío (el seed hace bcrypt de todas las cuentas).
    hookTimeout: 120000,
    // Varios tests del camino del voto encadenan logins reales, y bcrypt no es
    // gratis: con los 5 s por defecto fallaban por tiempo, no por el código.
    testTimeout: 20000,
    pool: 'vmForks',
    // Tope de procesos simultáneos.
    //
    // Cada fichero de test arranca su propio proceso y, en su beforeAll, crea el
    // esquema y siembra la base ENTERA (con bcrypt de todas las cuentas). Sin
    // tope, los 27 ficheros hacen eso a la vez: en una máquina ocupada vitest
    // ni siquiera consigue arrancar los runners y la suite cae entera por
    // tiempo, en ficheros que no tienen nada que ver con lo que se ha tocado.
    //
    // Medido el 17-09-2026, con la máquina al 100 % de CPU y 3,5 GB libres de
    // 31: la misma revisión que pasaba 224/224 daba 39 fallos, todos por tiempo
    // y varios con "Timeout starting vmForks runner". Con el tope, 13.
    //
    // O sea: el tope reduce el daño, pero NO hace la suite inmune a un equipo
    // saturado. Con la CPU al tope, esos mismos ficheros necesitaron 268 s para
    // 28 tests ejecutados de uno en uno. Si la suite falla solo por tiempo y en
    // ficheros que no se han tocado, mira la carga del equipo antes de buscar
    // la causa en el código: se puede acotar con
    //   npx vitest run --no-file-parallelism --testTimeout=60000 <ficheros>
    // que es lo que separa un fallo real de uno de entorno.
    minForks: 1,
    maxForks: 4,
  },
});
