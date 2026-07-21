import { spawn as nodeSpawn } from 'node:child_process'
import type { OsFileManager } from '../ports/os-file-manager.js'

/**
 * The narrow slice of node:child_process's spawn this adapter actually
 * calls with. Kept intentionally smaller than spawn's own overloaded
 * signature so a test double is trivial to write.
 */
type SpawnFn = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: 'ignore' },
) => { unref(): void }

export interface OsFileManagerDeps {
  /** Defaults to node:child_process's real spawn. Inject a fake so no test ever launches a process. */
  spawn?: SpawnFn
  /** Defaults to process.platform. Inject to exercise a platform branch a test isn't running on. */
  platform?: NodeJS.Platform
}

/**
 * The real OsFileManager. Its logic is lifted from the platform switch in
 * the POST /api/books/:id/audiobook/reveal route handler in
 * server/routes/books.ts: `open -R` on macOS, `explorer.exe /select,` on
 * Windows, or `xdg-open` on the parent directory on Linux. That route is
 * not rewired to this adapter yet, it keeps its own inline copy for now,
 * so this file has no callers today. A later stage wires the route to
 * this adapter and deletes its inline copy.
 *
 * Matches the port's contract exactly: the whole platform switch is
 * wrapped in try/catch, and reveal() resolves either way, regardless of
 * whether the OS-side command actually succeeded.
 */
export function createOsFileManager(deps: OsFileManagerDeps = {}): OsFileManager {
  const spawnFn: SpawnFn = deps.spawn ?? ((command, args, options) => nodeSpawn(command, args, options))
  const platform = deps.platform ?? process.platform

  return {
    async reveal(path: string): Promise<void> {
      try {
        if (platform === 'darwin') {
          spawnFn('open', ['-R', path], { detached: true, stdio: 'ignore' }).unref()
        } else if (platform === 'win32') {
          spawnFn('explorer.exe', ['/select,', path], { detached: true, stdio: 'ignore' }).unref()
        } else {
          // Linux: xdg-open opens the parent folder (no native reveal-and-select).
          const dir = path.substring(0, path.lastIndexOf('/'))
          spawnFn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref()
        }
      } catch {
        // best-effort — caller falls back to clipboard / IPC / displaying the path
      }
    },
  }
}
