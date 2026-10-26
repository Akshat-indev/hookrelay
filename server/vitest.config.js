import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false // run test files serially to prevent SQLite file lock contention
  }
});
