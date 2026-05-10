import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/scoring/**', 'src/visa/**', 'src/authenticity/**'],
    },
  },
  resolve: {
    alias: {
      '@swipehire/shared': '../../packages/shared/src/index.ts',
    },
  },
});
