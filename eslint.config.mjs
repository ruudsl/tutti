import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '*.config.js',
      '*.config.ts',
      'frontend/vite.config.ts',
      'frontend/vitest.config.ts',
      'backend/vitest.config.ts',
    ],
  },

  // Base JS rules for all files
  js.configs.recommended,

  // Losse scripts in scripts/ draaien onder Node. Zonder deze globals meldt
  // eslint console en process als onbekend, terwijl dat daar juist de normale
  // manier van werken is.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
  },

  // TypeScript rules for all TS/TSX files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),

  // Shared TypeScript rule overrides
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Unused vars: warn, allow underscore-prefixed names
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Relax explicit-any to warn instead of error
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow non-null assertions (common in React refs etc.)
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // Frontend-only: React Hooks rules
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The v7 compiler-powered diagnostics flag long-standing patterns
      // (setState-in-effect, purity, memoization preservation) across the
      // existing codebase. Keep them visible as warnings until the codebase
      // is migrated; the classic rules-of-hooks stays an error.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
);
