import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const languageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: {
    ...globals.browser,
    ...globals.node,
  },
};

const sharedRules = {
  'react-refresh/only-export-components': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-restricted-syntax': ['error', {
    selector: 'JSXAttribute[name.name="href"][value.value^="#/"]',
    message: 'Use React Router Link/to instead of hash-based navigation in BrowserRouter.',
  }],
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'backend/node_modules/**', '*.cjs'],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions,
    rules: {
      ...js.configs.recommended.rules,
      ...sharedRules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...languageOptions,
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...sharedRules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
];
