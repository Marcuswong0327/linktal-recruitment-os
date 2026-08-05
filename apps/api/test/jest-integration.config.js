/**
 * Separate Jest project for tests that hit the real database — kept out of
 * `jest.config.js` (rootDir `src`, matches every `*.spec.ts`) so the default
 * `pnpm test` stays fast, mock-only, and runnable without a DATABASE_URL.
 * Run explicitly: `pnpm test:integration`.
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30000,
};
