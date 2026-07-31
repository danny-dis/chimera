import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    // Many suites here (sandbox, pty-executor, git-tools, search-tools) spawn
    // real subprocesses. On Windows a single spawn costs 1.5-3.5s, so vitest's
    // 5s default left no margin and these tests flaked with
    // "Test timed out in 5000ms" — a different set each run, depending on load.
    // The work is genuinely slow, not hung, so give it real headroom.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
