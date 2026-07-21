import type { ProviderId } from '@shared/provider.js'

/**
 * Abstracts where AI provider API keys live. `server/services/key-store.ts`
 * was the implementation before this port existed, and it mixed two
 * concerns, an in-memory get/set/remove/has/status store, plus how that
 * store was populated and persisted, a data-dir file path resolved once at
 * module load, a `{PROVIDER}_API_KEY` environment variable fallback read
 * once at module load, and an Electron-vs-standalone branch that decided
 * whether writes touched disk at all.
 *
 * Only the first concern is this port. The file path, the env var
 * fallback, and the Electron branch are adapter behaviour.
 * `adapters/file-key-vault.ts` is that adapter today, and it takes its
 * data directory as a factory argument instead of reaching for it at
 * import time. A KeyVault contract test proves the get/set/has/status/remove
 * round trip. It says nothing about persistence or the env var fallback,
 * because the fake never persists anything and never reads the
 * environment.
 *
 * Methods take a `ProviderId`, not a raw string, so the "is this a provider
 * we know about" check the pre-port key-store.ts performed on every call
 * moves to wherever an untrusted string first enters the system (already
 * `zod` parsing at the HTTP boundary), rather than living inside the vault.
 *
 * The in-memory fake referenced above is key-vault.fake.ts's
 * createFakeKeyVault, and the contract test is key-vault.contract.ts's
 * describeKeyVaultContract.
 */
export interface KeyVault {
  get(provider: ProviderId): string | null
  set(provider: ProviderId, key: string): void
  remove(provider: ProviderId): void
  has(provider: ProviderId): boolean
  status(): Record<ProviderId, boolean>
}
