import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'results/**', 'artifacts/**', 'test-results/**', 'playwright-report/**', '.copilot-azure/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      globals: Object.fromEntries([
        'AbortController', 'AbortSignal', 'Buffer', 'URL', 'URLSearchParams',
        'Response', 'Request', 'Headers', 'TextEncoder', 'TextDecoder',
        'fetch', 'console', 'process', 'setTimeout', 'clearTimeout',
        'performance', 'structuredClone', 'document', 'window', 'location',
        'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
        'HTMLButtonElement', 'HTMLFormElement', 'HTMLDialogElement', 'Option',
        'Blob', 'File', 'navigator', 'module', 'require', 'globalThis'
      ].map(name => [name, 'readonly']))
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'error'
    }
  }
];
