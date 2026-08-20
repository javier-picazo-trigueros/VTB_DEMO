import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        // Vite reemplaza process.env en build time; ESLint necesita saberlo
        process: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // JavaScript correctness
      'eqeqeq': ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-empty': 'error',

      // React hooks — previene bugs de deps incorrectas en useEffect
      ...reactHooks.configs.recommended.rules,

      // Vite HMR fast-refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Desactivado porque el proyecto usa JS con prop-types implícitos
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },

  // Prettier desactiva las reglas estéticas de ESLint que podrían chocar
  prettierConfig,
];
