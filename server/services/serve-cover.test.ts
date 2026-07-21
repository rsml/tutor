import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { getCoverFile } from './serve-cover.js'

// getCoverFile reads real bytes from the path ArtifactStore hands back (see
// artifact-store.ts's own doc on why cover methods are path-returning), so
// it needs a real, writable root rather than the fake's default in-memory
// "/fake-artifacts" root.

const tmpDirs: string[] = []

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeArtifactStore() {
  const root = await mkdtemp(join(tmpdir(), 'serve-cover-test-'))
  tmpDirs.push(root)
  return createFakeArtifactStore({ root })
}

describe('getCoverFile', () => {
  it('resolves to null when the book has no cover', async () => {
    const artifactStore = await makeArtifactStore()

    const file = await getCoverFile('book-1', artifactStore)

    expect(file).toBeNull()
  })

  it('returns the bytes and content type for a saved png cover', async () => {
    const artifactStore = await makeArtifactStore()
    await artifactStore.saveCover('book-1', Buffer.from('unused'), 'image/png')
    const realPath = await artifactStore.getCoverPath('book-1')
    if (!realPath) throw new Error('expected a cover path')
    await mkdir(dirname(realPath), { recursive: true })
    await writeFile(realPath, Buffer.from('png-bytes'))

    const file = await getCoverFile('book-1', artifactStore)

    expect(file).not.toBeNull()
    expect(file?.contentType).toBe('image/png')
    expect(file?.data.toString('utf-8')).toBe('png-bytes')
  })

  it('maps a jpg extension to image/jpeg', async () => {
    const artifactStore = await makeArtifactStore()
    await artifactStore.saveCover('book-1', Buffer.from('unused'), 'image/jpeg')
    const realPath = await artifactStore.getCoverPath('book-1')
    if (!realPath) throw new Error('expected a cover path')
    await mkdir(dirname(realPath), { recursive: true })
    await writeFile(realPath, Buffer.from('jpg-bytes'))

    const file = await getCoverFile('book-1', artifactStore)

    expect(file?.contentType).toBe('image/jpeg')
  })

  it('maps a webp extension to image/webp', async () => {
    const artifactStore = await makeArtifactStore()
    await artifactStore.saveCover('book-1', Buffer.from('unused'), 'image/webp')
    const realPath = await artifactStore.getCoverPath('book-1')
    if (!realPath) throw new Error('expected a cover path')
    await mkdir(dirname(realPath), { recursive: true })
    await writeFile(realPath, Buffer.from('webp-bytes'))

    const file = await getCoverFile('book-1', artifactStore)

    expect(file?.contentType).toBe('image/webp')
  })
})
