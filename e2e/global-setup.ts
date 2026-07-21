import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Builds the client bundle the app fixture serves out of `dist/`.
 *
 * This runs once per `playwright test` invocation rather than being a
 * separate CI step, so there is exactly one code path and no way to run the
 * journeys against a stale bundle. `vite build` also emits `dist-electron/`,
 * which the Electron project needs.
 *
 * Set `E2E_SKIP_BUILD=1` when iterating on a journey and the client has not
 * changed, which turns a 15 second startup into an instant one.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_BUILD) {
    console.log('[e2e] E2E_SKIP_BUILD set, reusing the existing dist/ build')
    return
  }
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: repoRoot, stdio: 'inherit' })
}
