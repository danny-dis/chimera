import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['import', 'default'],
    mainFields: ['module', 'main'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    alias: {
      // Ensure consistent module resolution between test imports and source imports
    },
  },
});
