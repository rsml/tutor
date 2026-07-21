import { describe, expect, it } from 'vitest'
import { PROVIDERS } from '@shared/provider.js'
import type { KeyVault } from './key-vault.js'

/**
 * The KeyVault contract. Only a fake is wired in during this phase, because
 * a real filesystem-backed adapter is later work, but `makeSubject` stays
 * typed to the plain `KeyVault` port rather than the fake's shape, since
 * every behaviour here (get/set/has/status/remove) is observable through
 * the port alone, unlike TextGeneration and ImageGeneration. A future
 * `describeKeyVaultContract('real', ...)` against a temp-dir-backed adapter
 * can reuse this file unchanged.
 */
export function describeKeyVaultContract(label: string, makeSubject: () => KeyVault | Promise<KeyVault>): void {
  describe(`KeyVault contract (${label})`, () => {
    it('returns null for a provider that was never set', async () => {
      const vault = await makeSubject()
      expect(vault.get('anthropic')).toBeNull()
    })

    it('round trips a key through set then get', async () => {
      const vault = await makeSubject()
      vault.set('anthropic', 'sk-test-123')
      expect(vault.get('anthropic')).toBe('sk-test-123')
    })

    it('overwrites a key when set again', async () => {
      const vault = await makeSubject()
      vault.set('openai', 'first')
      vault.set('openai', 'second')
      expect(vault.get('openai')).toBe('second')
    })

    it('agrees with has() before and after a key is set', async () => {
      const vault = await makeSubject()
      expect(vault.has('google')).toBe(false)
      vault.set('google', 'sk-test')
      expect(vault.has('google')).toBe(true)
    })

    it('clears a key on remove, so get and has both revert', async () => {
      const vault = await makeSubject()
      vault.set('anthropic', 'sk-test')
      vault.remove('anthropic')
      expect(vault.get('anthropic')).toBeNull()
      expect(vault.has('anthropic')).toBe(false)
    })

    it('removing a key that was never set is a no-op', async () => {
      const vault = await makeSubject()
      expect(() => vault.remove('openai')).not.toThrow()
      expect(vault.has('openai')).toBe(false)
    })

    it('status() has an entry for every provider in PROVIDERS, agreeing with has()', async () => {
      const vault = await makeSubject()
      vault.set('anthropic', 'sk-test')
      const status = vault.status()
      expect(Object.keys(status).sort()).toEqual([...PROVIDERS].sort())
      for (const provider of PROVIDERS) {
        expect(status[provider]).toBe(vault.has(provider))
      }
    })

    it('keeps each provider independent of the others', async () => {
      const vault = await makeSubject()
      vault.set('anthropic', 'sk-anthropic')
      vault.set('openai', 'sk-openai')
      vault.remove('anthropic')
      expect(vault.get('anthropic')).toBeNull()
      expect(vault.get('openai')).toBe('sk-openai')
    })
  })
}
