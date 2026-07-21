import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROVIDERS, type ProviderId } from '@shared/provider.js'
import type { KeyVault } from '../ports/key-vault.js'

/**
 * Real KeyVault backed by a JSON file on disk.
 *
 * When running embedded in Electron (`process.versions.electron` is set),
 * keys live in-memory only for the lifetime of this instance. Electron
 * persists them encrypted to per-provider `.enc` files via safeStorage, and
 * the renderer's bootstrap effect re-populates this vault after each app
 * launch.
 *
 * When running standalone (e.g. `pnpm dev:server` in a browser-only
 * setup), there is no safeStorage available, so this vault falls back to a
 * plaintext `api-keys.json` file in `dataDir` so keys survive server
 * restarts. This is a dev-mode convenience, never the path used by the
 * packaged app.
 *
 * Every `{PROVIDER}_API_KEY` environment variable present at construction
 * time overrides whatever was loaded from disk for that provider.
 *
 * Logic lifted verbatim from the pre-port `server/services/key-store.ts`.
 * server/composition-root.ts now constructs a single instance of this
 * factory as part of building Ports.
 */
export function createFileKeyVault(opts: { dataDir: string }): KeyVault {
  const { dataDir } = opts
  const isElectron = !!process.versions.electron
  const keysFile = join(dataDir, 'api-keys.json')

  function loadFromDisk(): Map<string, string> {
    try {
      if (existsSync(keysFile)) {
        const data = JSON.parse(readFileSync(keysFile, 'utf-8'))
        return new Map(Object.entries(data))
      }
    } catch { /* start fresh */ }
    return new Map()
  }

  function saveToDisk(): void {
    if (isElectron) return // Electron path uses safeStorage; never persist plaintext here
    try {
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 })
      writeFileSync(keysFile, JSON.stringify(Object.fromEntries(keys)), { encoding: 'utf-8', mode: 0o600 })
    } catch { /* non-fatal */ }
  }

  // In Electron, defer to safeStorage. Don't load any leftover plaintext. In
  // standalone mode, load plaintext from disk (and clean up the legacy file
  // once we no longer have any reason to keep it around).
  const keys = isElectron ? new Map<string, string>() : loadFromDisk()

  if (isElectron && existsSync(keysFile)) {
    // Electron's main process is responsible for migrating + deleting the
    // plaintext file. Defensive cleanup here in case it didn't run.
    try { unlinkSync(keysFile) } catch { /* ignore */ }
  }

  for (const p of PROVIDERS) {
    const envKey = process.env[`${p.toUpperCase()}_API_KEY`]
    if (envKey) keys.set(p, envKey)
  }

  return {
    get(provider) {
      return keys.get(provider) ?? null
    },
    set(provider, key) {
      keys.set(provider, key)
      saveToDisk()
    },
    remove(provider) {
      keys.delete(provider)
      saveToDisk()
    },
    has(provider) {
      return keys.has(provider)
    },
    status() {
      return Object.fromEntries(PROVIDERS.map((p) => [p, keys.has(p)])) as Record<ProviderId, boolean>
    },
  }
}
