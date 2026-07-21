import { describe, it, expect } from 'vitest'
import { createFakeArtifactStore } from './artifact-store.fake.js'
import { describeArtifactStoreContract } from './artifact-store.contract.js'

/**
 * Proves the fake satisfies the port's behavioural contract today. A future
 * real adapter gets the same describeArtifactStoreContract call, pointed at
 * a temp directory, so the two never drift apart silently.
 */

describeArtifactStoreContract('fake', () => createFakeArtifactStore())

describe('createFakeArtifactStore, fake-specific behaviour', () => {
  it('is isolated per call, so two fakes never share state', async () => {
    const a = createFakeArtifactStore()
    const b = createFakeArtifactStore()

    await a.writeEpub('book-1', Buffer.from('epub bytes'))

    expect(a.epubExists('book-1')).toBe(true)
    expect(b.epubExists('book-1')).toBe(false)
  })

  it('roots paths under a caller-supplied root, still consistently', () => {
    const store = createFakeArtifactStore({ root: '/custom-root' })
    expect(store.epubPath('book-1').startsWith('/custom-root')).toBe(true)
    expect(store.audioDir('book-1').startsWith('/custom-root')).toBe(true)
  })

  it('roots paths differently across two fakes with different roots, proving the contract is root-agnostic', () => {
    const a = createFakeArtifactStore({ root: '/root-a' })
    const b = createFakeArtifactStore({ root: '/root-b' })
    expect(a.epubPath('book-1')).not.toBe(b.epubPath('book-1'))
  })
})
