import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const zone = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url))

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
      // The Playwright journey suite. Vitest's default include collects
      // *.spec.ts, so without this line `pnpm test` would try to run the
      // journeys, and `pnpm test` is deliberately the fast one. Journeys
      // are `pnpm e2e`. Only the journeys are excluded, not all of e2e/,
      // because the scripted adapter's contract test lives under e2e/ as a
      // *.test.ts and vitest is exactly the runner that should own it.
      'e2e/**/*.spec.ts',
    ],
  },
  resolve: {
    alias: {
      '@server': zone('server'),
      '@client': zone('client'),
      '@shared': zone('shared'),
    },
  },
})
