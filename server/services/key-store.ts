import { getDataDir } from '../../lib/data-dir.js'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'

// API key store.
//
// When running embedded in Electron (process.versions.electron is set), keys
// live in-memory only — Electron persists them encrypted to per-provider .enc
// files via safeStorage. The renderer's bootstrap effect re-populates this
// store after each app launch.
//
// When running standalone (e.g. `pnpm dev:server` in a browser-only setup),
// there is no safeStorage available. We fall back to plaintext api-keys.json
// in the data dir so that keys survive server restarts. This is a dev-mode
// convenience — never the path used by the packaged app.

const VALID_PROVIDERS = ['anthropic', 'openai', 'google'] as const
type Provider = (typeof VALID_PROVIDERS)[number]

const isElectron = !!process.versions.electron
const keysFile = join(getDataDir(), 'api-keys.json')

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
    const dir = getDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(keysFile, JSON.stringify(Object.fromEntries(keys)), { encoding: 'utf-8', mode: 0o600 })
  } catch { /* non-fatal */ }
}

// In Electron, defer to safeStorage — don't load any leftover plaintext. In
// standalone mode, load plaintext from disk (and clean up the legacy file
// once we no longer have any reason to keep it around).
const keys = isElectron ? new Map<string, string>() : loadFromDisk()

if (isElectron && existsSync(keysFile)) {
  // Electron's main process is responsible for migrating + deleting the
  // plaintext file. Defensive cleanup here in case it didn't run.
  try { unlinkSync(keysFile) } catch { /* ignore */ }
}

for (const p of VALID_PROVIDERS) {
  const envKey = process.env[`${p.toUpperCase()}_API_KEY`]
  if (envKey) keys.set(p, envKey)
}

function validateProvider(provider: string): asserts provider is Provider {
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    throw new Error(`Invalid provider: ${provider}`)
  }
}

export function setKey(provider: string, key: string): void {
  validateProvider(provider)
  keys.set(provider, key)
  saveToDisk()
}

export function getKey(provider: string): string | null {
  validateProvider(provider)
  return keys.get(provider) ?? null
}

export function removeKey(provider: string): void {
  validateProvider(provider)
  keys.delete(provider)
  saveToDisk()
}

export function hasKey(provider: string): boolean {
  validateProvider(provider)
  return keys.has(provider)
}

export function keyStatus(): Record<string, boolean> {
  return Object.fromEntries(VALID_PROVIDERS.map(p => [p, keys.has(p)]))
}
