import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,mjs,cjs}'],
    exclude: [
      // CJS require test: Vitest 4 cannot load vitest via require() in CJS modules.
      // Run manually with: node tests/module/cjs-require.test.cjs (if you have a CJS runner)
      'tests/module/cjs-require.test.cjs',
    ],
    testTimeout: 30000,
  },
});
