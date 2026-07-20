import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/test/setup-env.ts'],
    // Specifying `exclude` replaces vitest's defaults rather than extending
    // them, so the real defaults (node_modules, .git) are repeated here
    // alongside this project's build output dirs. Nested git worktrees can
    // hold full repo copies of their own, including their own test files,
    // and must never be collected by a run rooted at this project.
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/dist-electron/**',
      '.worktrees/**',
      '.claude/worktrees/**',
    ],
  },
  resolve: {
    alias: {
      '@server': new URL('./server', import.meta.url).pathname,
      '@client': new URL('./client', import.meta.url).pathname,
    },
  },
})
