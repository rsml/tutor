import { PROVIDERS, type ProviderId } from '@shared/provider.js'
import type { KeyVault } from './key-vault.js'

/**
 * In-memory KeyVault. Holds keys in a Map for the lifetime of the fake and
 * never touches disk or the environment, so a test gets a clean vault
 * regardless of what is configured on the machine running it.
 */
export function createFakeKeyVault(initialKeys: Partial<Record<ProviderId, string>> = {}): KeyVault {
  const keys = new Map<ProviderId, string>(Object.entries(initialKeys) as Array<[ProviderId, string]>)

  return {
    get(provider) {
      return keys.get(provider) ?? null
    },
    set(provider, key) {
      keys.set(provider, key)
    },
    remove(provider) {
      keys.delete(provider)
    },
    has(provider) {
      return keys.has(provider)
    },
    status() {
      return Object.fromEntries(PROVIDERS.map(provider => [provider, keys.has(provider)])) as Record<ProviderId, boolean>
    },
  }
}
