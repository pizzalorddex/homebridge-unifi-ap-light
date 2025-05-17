import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin,
    },
    rules: {
      indent: ['error', 'tab'],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'prefer-const': 'error',
      'nonblock-statement-body-position': ['error', 'below'],
      'no-sequences': 'error',
      'eol-last': ['error', 'always'],
      'one-var': ['error', 'never'],
      'one-var-declaration-per-line': ['error', 'always'],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
    },
  },
  {
    ignores: ['coverage/**', 'dist/**'],
  },
]
