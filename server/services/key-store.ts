import { getDataDir } from '../../lib/data-dir.js'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const VALID_PROVIDERS = ['anthropic', 'openai', 'google'] as const
type Provider = (typeof VALID_PROVIDERS)[number]

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
  try {
    const dir = getDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(keysFile, JSON.stringify(Object.fromEntries(keys)), 'utf-8')
  } catch { /* non-fatal */ }
}

// Load persisted keys first, then override with env vars
const keys = loadFromDisk()

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
