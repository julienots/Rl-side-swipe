// Configuration ESLint (règles de base, sans dépendance externe).
const browser = Object.fromEntries([
  'window', 'document', 'navigator', 'location', 'performance', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'getComputedStyle', 'matchMedia', 'AudioContext', 'console',
  'structuredClone', 'URL', 'self', 'caches', 'fetch', 'HTMLElement',
].map((g) => [g, 'readonly']));
const node = Object.fromEntries(['process', 'console', 'URL', 'setTimeout', 'structuredClone', 'performance', 'window'].map((g) => [g, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  'no-cond-assign': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'eqeqeq': ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': ['warn', { destructuring: 'all' }],
};

export default [
  { ignores: ['node_modules/**', 'test-results/**'] },
  { files: ['src/**/*.js', 'sw.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: browser }, rules },
  { files: ['sw.js'], languageOptions: { sourceType: 'script' } },
  { files: ['tests/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...node, ...browser } }, rules },
];
