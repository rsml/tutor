import { describe, it, expect, beforeEach } from 'vitest'
import type { AudiobookManifest } from '@shared/domain.js'
import type { ArtifactStore } from './artifact-store.js'

/**
 * The behavioural specification every ArtifactStore must satisfy, whether
 * it is the in-memory fake or a future real adapter. Run this once against
 * each with describeArtifactStoreContract(label, makeSubject), rather than
 * writing the same assertions twice and letting them drift apart.
 *
 * Path-returning methods are asserted for consistency, meaning the same
 * inputs produce the same path and different inputs produce different
 * paths, rather than for an exact string. A real adapter rooted at a
 * different directory than the fake still satisfies every assertion here.
 */

function makeManifest(overrides: Partial<AudiobookManifest> = {}): AudiobookManifest {
  return {
    version: 1,
    voice: 'am_michael',
    speed: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    m4bPath: 'book.m4b',
    chapters: [
      { num: 1, title: 'Chapter 1', mp3Path: '01.mp3', durationSec: 120, startSec: 0 },
    ],
    ...overrides,
  }
}

export function describeArtifactStoreContract(
  label: string,
  makeSubject: () => ArtifactStore | Promise<ArtifactStore>,
): void {
  describe(`ArtifactStore contract (${label})`, () => {
    let store: ArtifactStore

    beforeEach(async () => {
      store = await makeSubject()
    })

    describe('cover image', () => {
      it('agrees that no cover exists before one is saved', async () => {
        expect(await store.getCoverPath('book-1')).toBeNull()
        expect(await store.hasCover('book-1')).toBe(false)
        expect(await store.getCoverMtime('book-1')).toBeNull()
      })

      it('agrees that a cover exists once one is saved', async () => {
        await store.saveCover('book-1', Buffer.from('fake image bytes'), 'image/png')
        expect(await store.hasCover('book-1')).toBe(true)
        expect(await store.getCoverPath('book-1')).not.toBeNull()
        expect(await store.getCoverMtime('book-1')).toBeInstanceOf(Date)
      })

      it('gives the same path back on repeated reads, and different paths for different books', async () => {
        await store.saveCover('book-1', Buffer.from('a'), 'image/png')
        await store.saveCover('book-2', Buffer.from('b'), 'image/png')

        const first = await store.getCoverPath('book-1')
        const second = await store.getCoverPath('book-1')
        expect(first).toBe(second)
        expect(await store.getCoverPath('book-2')).not.toBe(first)
      })

      it('advances the mtime on a second save', async () => {
        await store.saveCover('book-1', Buffer.from('a'), 'image/png')
        const first = await store.getCoverMtime('book-1')

        // Saved in a short retry loop rather than exactly once. A real
        // filesystem reports mtimes with millisecond granularity, so two
        // saves that land inside the same tick record the identical time
        // and a single-save assertion becomes a race against how fast the
        // disk is rather than a test of the behaviour. Retrying until the
        // subject's own clock moves keeps the assertion strict. The wait is
        // deliberately not a wall clock wait, because the fake advances a
        // synthetic counter rather than tracking real time, and the
        // contract must not assume either.
        let second = first
        for (let attempt = 0; attempt < 50 && second!.getTime() <= first!.getTime(); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2))
          await store.saveCover('book-1', Buffer.from('b'), 'image/jpeg')
          second = await store.getCoverMtime('book-1')
        }

        expect(second!.getTime()).toBeGreaterThan(first!.getTime())
      })

      it('makes a cover unreadable after deleting it', async () => {
        await store.saveCover('book-1', Buffer.from('a'), 'image/png')
        await store.deleteCover('book-1')
        expect(await store.hasCover('book-1')).toBe(false)
        expect(await store.getCoverPath('book-1')).toBeNull()
        expect(await store.getCoverMtime('book-1')).toBeNull()
      })

      it('does not throw when deleting a cover that was never saved', async () => {
        await expect(store.deleteCover('never-had-one')).resolves.not.toThrow()
      })
    })

    describe('epub export', () => {
      it('reports no epub before one is written', () => {
        expect(store.epubExists('book-1')).toBe(false)
      })

      it('agrees an epub exists once one is written', async () => {
        await store.writeEpub('book-1', Buffer.from('fake epub bytes'))
        expect(store.epubExists('book-1')).toBe(true)
      })

      it('gives a stable path per book, and a different path for a different book', () => {
        expect(store.epubPath('book-1')).toBe(store.epubPath('book-1'))
        expect(store.epubPath('book-1')).not.toBe(store.epubPath('book-2'))
      })
    })

    describe('audiobook paths', () => {
      it('gives stable, book-scoped paths for the audiobook file and its directory', () => {
        expect(store.audiobookPath('book-1')).toBe(store.audiobookPath('book-1'))
        expect(store.audiobookPath('book-1')).not.toBe(store.audiobookPath('book-2'))
        expect(store.audioDir('book-1')).toBe(store.audioDir('book-1'))
        expect(store.audioDir('book-1')).not.toBe(store.audioDir('book-2'))
      })

      it('gives stable, chapter-scoped paths that live under the book’s audio directory', () => {
        const mp3 = store.chapterAudioPath('book-1', 1)
        const wav = store.chapterWavPath('book-1', 1)

        expect(store.chapterAudioPath('book-1', 1)).toBe(mp3)
        expect(store.chapterAudioPath('book-1', 2)).not.toBe(mp3)
        expect(store.chapterAudioPath('book-2', 1)).not.toBe(mp3)
        expect(mp3).not.toBe(wav)

        expect(mp3.startsWith(store.audioDir('book-1'))).toBe(true)
        expect(wav.startsWith(store.audioDir('book-1'))).toBe(true)
      })

      it('reports no audiobook before one has ever been produced', async () => {
        expect(store.audiobookExists('book-1')).toBe(false)
      })
    })

    describe('chapter audio existence', () => {
      it('reports false for a chapter with no manifest entry', async () => {
        expect(await store.chapterAudioExists('book-1', 1)).toBe(false)
      })

      it('agrees with the manifest once one is saved', async () => {
        await store.saveAudiobookManifest('book-1', makeManifest({
          chapters: [
            { num: 1, title: 'Chapter 1', mp3Path: '01.mp3', durationSec: 60, startSec: 0 },
            { num: 2, title: 'Chapter 2', mp3Path: '02.mp3', durationSec: 60, startSec: 60 },
          ],
        }))

        expect(await store.chapterAudioExists('book-1', 1)).toBe(true)
        expect(await store.chapterAudioExists('book-1', 2)).toBe(true)
        expect(await store.chapterAudioExists('book-1', 3)).toBe(false)
      })
    })

    describe('audiobook manifest', () => {
      it('resolves to null before one is saved', async () => {
        expect(await store.getAudiobookManifest('book-1')).toBeNull()
      })

      it('round trips a saved manifest', async () => {
        await store.saveAudiobookManifest('book-1', makeManifest({ voice: 'onyx' }))
        const manifest = await store.getAudiobookManifest('book-1')
        expect(manifest?.voice).toBe('onyx')
        expect(manifest?.chapters).toHaveLength(1)
      })

      it('removes the manifest and chapter audio once artifacts are deleted', async () => {
        await store.saveAudiobookManifest('book-1', makeManifest())
        await store.deleteAudiobookArtifacts('book-1')

        expect(await store.getAudiobookManifest('book-1')).toBeNull()
        expect(await store.chapterAudioExists('book-1', 1)).toBe(false)
      })

      it('does not throw when deleting audiobook artifacts that were never saved', async () => {
        await expect(store.deleteAudiobookArtifacts('never-had-one')).resolves.not.toThrow()
      })
    })

    describe('crash recovery', () => {
      it('is a no-op when nothing needs recovering', async () => {
        const report = await store.recoverFromCrash()
        expect(report).toEqual({ booksReset: [], artifactsRemoved: [] })
      })

      it('treats a saved manifest with no matching audiobook file as a stray and removes it', async () => {
        await store.saveAudiobookManifest('book-1', makeManifest())

        const report = await store.recoverFromCrash()

        expect(report.artifactsRemoved).toContain(store.audioDir('book-1'))
        expect(await store.getAudiobookManifest('book-1')).toBeNull()
      })

      it('never reports a book status change, since that is BookRepository data this port cannot see', async () => {
        await store.saveAudiobookManifest('book-1', makeManifest())
        const report = await store.recoverFromCrash()
        expect(report.booksReset).toEqual([])
      })
    })
  })
}
