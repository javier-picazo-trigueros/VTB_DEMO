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
  },
});
