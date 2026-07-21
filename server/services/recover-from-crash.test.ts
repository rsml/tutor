import { describe, it, expect } from 'vitest'
import type { AudiobookManifest, BookMeta } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createRecoverFromCrash } from './recover-from-crash.js'

function makeManifest(overrides: Partial<AudiobookManifest> = {}): AudiobookManifest {
  return {
    version: 1,
    voice: 'am_michael',
    speed: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    m4bPath: 'book.m4b',
    chapters: [{ num: 1, title: 'Chapter 1', mp3Path: '01.mp3', durationSec: 120, startSec: 0 }],
    ...overrides,
  }
}

// dataDir points nowhere real on purpose. It only feeds fs-book-repository's
// cleanTmpArtifacts, which short-circuits cleanly (existsSync false, returns
// []) for a directory that does not exist, so this suite never touches a
// real path. The .tmp-sweep behaviour itself is exercised for real against a
// temp directory by the real-fs integration test alongside the fs adapters.
const FAKE_DATA_DIR = '/nonexistent-recover-from-crash-test-dir'

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn something',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('createRecoverFromCrash', () => {
  it('moves generating_toc with a saved toc to toc_review', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'generating_toc' }))
    await bookRepository.saveToc('book-1', { chapters: [{ title: 'Ch1', description: 'd' }] })
    const artifactStore = createFakeArtifactStore()

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    const report = await recoverFromCrash()

    const recovered = await bookRepository.getBook('book-1')
    expect(recovered.status).toBe('toc_review')
    expect(report.booksReset).toEqual([
      { id: 'book-1', title: 'Test Book', from: 'generating_toc', to: 'toc_review', reason: expect.any(String) },
    ])
  })

  it('moves generating_toc with no saved toc to failed', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'generating_toc' }))
    // No saveToc call — the TOC stream never got that far.
    const artifactStore = createFakeArtifactStore()

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    await recoverFromCrash()

    const recovered = await bookRepository.getBook('book-1')
    expect(recovered.status).toBe('failed')
  })

  it('moves generating with chapters saved to reading', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'generating', generatedUpTo: 2 }))
    const artifactStore = createFakeArtifactStore()

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    const report = await recoverFromCrash()

    const recovered = await bookRepository.getBook('book-1')
    expect(recovered.status).toBe('reading')
    expect(report.booksReset[0]).toMatchObject({ id: 'book-1', from: 'generating', to: 'reading' })
  })

  it('moves generating with zero chapters saved to toc_review', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'generating', generatedUpTo: 0 }))
    const artifactStore = createFakeArtifactStore()

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    await recoverFromCrash()

    const recovered = await bookRepository.getBook('book-1')
    expect(recovered.status).toBe('toc_review')
  })

  it('leaves a healthy reading book untouched, with an empty booksReset', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'reading' }))
    const before = await bookRepository.getBook('book-1')
    const artifactStore = createFakeArtifactStore()

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    const report = await recoverFromCrash()

    const after = await bookRepository.getBook('book-1')
    expect(after.status).toBe('reading')
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(report.booksReset).toEqual([])
  })

  it('folds ArtifactStore.recoverFromCrash()\'s own artifactsRemoved into the returned report', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'reading' }))
    const artifactStore = createFakeArtifactStore()
    // A saved audiobook manifest with no matching audiobook file is exactly
    // the stray artifact-store.fake.ts's own recoverFromCrash() reports as
    // removed (see its doc comment) — the fake can never make the audiobook
    // file itself appear present through its own interface.
    await artifactStore.saveAudiobookManifest('book-1', makeManifest())

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    const report = await recoverFromCrash()

    expect(report.artifactsRemoved).toContain(artifactStore.audioDir('book-1'))
  })

  it('wipes audioGeneratedChapters and bumps updatedAt when the audio dir was removed, even without a status change', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook(makeBook({ id: 'book-1', status: 'reading', audioGeneratedChapters: [1, 2] }))
    const before = await bookRepository.getBook('book-1')
    const artifactStore = createFakeArtifactStore()
    await artifactStore.saveAudiobookManifest('book-1', makeManifest())

    const recoverFromCrash = createRecoverFromCrash({ bookRepository, artifactStore, dataDir: FAKE_DATA_DIR })
    const report = await recoverFromCrash()

    const after = await bookRepository.getBook('book-1')
    expect(after.audioGeneratedChapters).toEqual([])
    expect(after.updatedAt > before.updatedAt).toBe(true)
    // No status change, so this book contributes nothing to booksReset —
    // only the audio wipe happened.
    expect(report.booksReset).toEqual([])
  })
})
