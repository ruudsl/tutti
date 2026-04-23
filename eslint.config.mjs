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
    },
  },
);
