import reactHooks from 'eslint-plugin-react-hooks';
import base from '@purrshelf/config/eslint';

export default [
  ...base,
  { ignores: ['android/**', 'ios/**', 'expo-env.d.ts', 'jest.setup.ts'] },
  reactHooks.configs.flat['recommended-latest'] ?? reactHooks.configs['recommended-latest'],
  {
    files: ['**/*.tsx', '**/*.ts'],
    rules: {
      // React Native code may use require() for assets.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
