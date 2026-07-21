import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { resolveChapterAudioFile } from './resolve-chapter-audio-file.js'

// resolveChapterAudioFile decides between a legacy per-chapter MP3 (written
// by audiobooks generated before the unified M4B switch) and the book's
// single M4B (new audiobooks; the client seeks to the chapter's start).
// That decision is a real, current-file existence check, deliberately not
// ArtifactStore.chapterAudioExists, which answers a different question (see
// that method's own doc): it is also true once the manifest merely lists
// the chapter, which every chapter of a new-style audiobook does even
// though no physical per-chapter file was ever written for it.

const tmpDirs: string[] = []

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeArtifactStore() {
  const root = await mkdtemp(join(tmpdir(), 'resolve-chapter-audio-test-'))
  tmpDirs.push(root)
  return createFakeArtifactStore({ root })
}

describe('resolveChapterAudioFile', () => {
  it('resolves to the unified m4b with audio/mp4 when no legacy per-chapter file exists on disk', async () => {
    const artifactStore = await makeArtifactStore()

    const file = resolveChapterAudioFile('book-1', 2, artifactStore)

    expect(file).toEqual({ path: artifactStore.audiobookPath('book-1'), contentType: 'audio/mp4' })
  })

  it('resolves to the legacy per-chapter mp3 with audio/mpeg when one exists on disk', async () => {
    const artifactStore = await makeArtifactStore()
    const legacyPath = artifactStore.chapterAudioPath('book-1', 2)
    await mkdir(dirname(legacyPath), { recursive: true })
    await writeFile(legacyPath, Buffer.from('legacy mp3 bytes'))

    const file = resolveChapterAudioFile('book-1', 2, artifactStore)

    expect(file).toEqual({ path: legacyPath, contentType: 'audio/mpeg' })
  })

  it('does not fall for a chapter merely listed in the manifest without a physical legacy file', async () => {
    const artifactStore = await makeArtifactStore()
    // A new-style audiobook: the manifest lists chapter 1, but no physical
    // per-chapter MP3 was ever written for it (see artifact-store.ts's own
    // doc: chapterAudioExists is manifest driven and does not imply a real
    // file). resolveChapterAudioFile must still fall back to the m4b.
    await artifactStore.saveAudiobookManifest('book-1', {
      version: 1,
      voice: 'v',
      speed: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      m4bPath: artifactStore.audiobookPath('book-1'),
      chapters: [{ num: 1, title: 'One', mp3Path: artifactStore.chapterAudioPath('book-1', 1), durationSec: 10, startSec: 0 }],
    })
    expect(await artifactStore.chapterAudioExists('book-1', 1)).toBe(true) // manifest says yes

    const file = resolveChapterAudioFile('book-1', 1, artifactStore)

    expect(file.contentType).toBe('audio/mp4') // but no real file, so falls back to the m4b
  })
})
