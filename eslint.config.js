import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Flat config for the whole monorepo. Real errors fail the build; style/unused
// are warnings so `npm run lint` stays green (typecheck handles unused in web).
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/data/**',
      '**/.e2e-data/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  // Server + tooling: Node globals.
  {
    files: ['server/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'off',
    },
  },
  // Web: TypeScript + browser globals.
  ...tseslint.config({
    files: ['web/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  }),
];
