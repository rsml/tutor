import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where Tutor reads and writes its data directory, meaning every book, the
 * learning profile, and stored settings.
 *
 * This lives under node/ rather than at the top of shared/ because it reads
 * process.env and process.platform, which do not exist in a browser.
 * Importing it from client code would pull process into the renderer
 * bundle, and importing it from one of the browser-safe files sitting
 * directly in shared/ would do the same, one hop removed. ESLint's import
 * boundary rule rejects both.
 */

/**
 * TUTOR_DATA_DIR overrides everything else, which is how tests and the e2e
 * harness point the whole app at a throwaway directory instead of a
 * developer's real library. Without it, macOS gets its usual Application
 * Support path, and everything else falls back to the same XDG_DATA_HOME
 * convention Linux itself uses, or its default when that is unset too.
 */
export function getDataDir(): string {
  if (process.env.TUTOR_DATA_DIR) {
    return process.env.TUTOR_DATA_DIR
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tutor')
  }
  // XDG for Linux
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdgData, 'tutor')
}
