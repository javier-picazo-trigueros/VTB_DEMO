// @ts-check
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Ignores
  { ignores: ['dist/**', 'node_modules/**', 'migrations/**'] },

  // TypeScript files
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      prettierConfig,
    ],
    rules: {
      // No any: lo más importante del refactor. Error, no warning,
      // porque `any` esconde bugs en queries de BD y JWT.
      '@typescript-eslint/no-explicit-any': 'error',

      // Variables declaradas pero no usadas son dead code.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Catch vacíos ocultan errores.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Comparaciones estrictas.
      'eqeqeq': ['error', 'always'],

      // console.log en producción = información sensible en los logs.
      // warn porque hay muchos y se arreglan iterativamente.
      'no-console': ['warn', { allow: ['error', 'warn', 'info'] }],

      // Permitir require() donde sea necesario (interop CommonJS)
      '@typescript-eslint/no-require-imports': 'off',

      // Namespaces legacy de TypeScript (usados en express augmentation)
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // Tests — relajar algunas reglas para facilitar el setup de fixtures
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
