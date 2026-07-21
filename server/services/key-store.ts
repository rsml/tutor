import { getDataDir } from '@shared/node/data-dir.js'
import { isProviderId, type ProviderId } from '@shared/provider.js'
import { createFileKeyVault } from '../adapters/file-key-vault.js'

/**
 * THIN SHIM over the real KeyVault adapter (`server/adapters/file-key-vault.ts`).
 *
 * This module used to hold the KeyVault's actual logic directly at module
 * scope. That logic was the data directory, the Electron-vs-standalone
 * branch, the env var fallback, and the in-memory get/set/remove/has/status
 * store. All of that now lives in `createFileKeyVault`. This file just
 * builds one instance of it, once, at module load, and re-exports the same
 * named functions with the same signatures over it.
 *
 * It exists so the singleton-to-factory conversion could land in one step
 * instead of an atomic rewrite of every call site. `services/image-generation.ts`
 * and several route files import `getKey` (and friends) at module scope,
 * so those bindings need to keep resolving to one shared, stable vault
 * instance throughout the change, rather than each call constructing (and
 * reloading from disk) its own.
 *
 * Temporary. Callers should move onto the `KeyVault` port directly in a
 * later stage, once there is a dependency-injection seam to hand them a
 * vault instance instead of reaching for a module-scope singleton.
 */

const vault = createFileKeyVault({ dataDir: getDataDir() })

function validateProvider(provider: string): asserts provider is ProviderId {
  if (!isProviderId(provider)) {
    throw new Error(`Invalid provider: ${provider}`)
  }
}

export function setKey(provider: string, key: string): void {
  validateProvider(provider)
  vault.set(provider, key)
}

export function getKey(provider: string): string | null {
  validateProvider(provider)
  return vault.get(provider)
}

export function removeKey(provider: string): void {
  validateProvider(provider)
  vault.remove(provider)
}

export function hasKey(provider: string): boolean {
  validateProvider(provider)
  return vault.has(provider)
}

export function keyStatus(): Record<string, boolean> {
  return vault.status()
}
