import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/cli-main.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // CLAUDE.md: the indexer budget needs 100%.
        'src/modules/budget/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // …and so do the request status machine and the search that spends it.
        'src/modules/requests/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/modules/search/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
