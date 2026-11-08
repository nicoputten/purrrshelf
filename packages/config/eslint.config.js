// Shared flat ESLint config for every package.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.expo/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['**/test/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
