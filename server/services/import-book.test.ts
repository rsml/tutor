import { describe, it, expect } from 'vitest'
import type { ImportedBook } from '../ports/epub-import.js'
import { createFakeEpubImport } from '../ports/epub-import.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createImportBook } from './import-book.js'

const IMPORTED_BOOK: ImportedBook = {
  meta: {
    title: 'Imported Title',
    subtitle: 'Imported Subtitle',
    showTitleOnCover: true,
  },
  chapters: [
    { title: 'Chapter One', description: 'First chapter.', markdown: '# Chapter One\n\nFirst body.' },
    { title: 'Chapter Two', description: 'Second chapter.', markdown: '# Chapter Two\n\nSecond body.' },
  ],
  cover: { data: Buffer.from('cover-bytes'), mediaType: 'image/png' },
}

function makeDeps(book: ImportedBook = IMPORTED_BOOK) {
  return {
    epubImport: createFakeEpubImport({ book }),
    bookRepository: createFakeBookRepository(),
    artifactStore: createFakeArtifactStore(),
  }
}

describe('createImportBook', () => {
  describe('previewEpub', () => {
    it('delegates straight to the EpubImport port and persists nothing', async () => {
      const deps = makeDeps()
      const { previewEpub } = createImportBook(deps)

      const preview = await previewEpub(Buffer.from('epub bytes'))

      expect(preview.title).toBe('Fake Imported Book') // fake's DEFAULT_PREVIEW, unrelated to the `book` fixture
      expect(await deps.bookRepository.listBooks()).toEqual([])
    })
  })

  describe('importEpub', () => {
    it('reads the EPUB through the port and persists meta, TOC, and every chapter', async () => {
      const deps = makeDeps()
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'))

      expect(meta.title).toBe('Imported Title')
      expect(meta.subtitle).toBe('Imported Subtitle')
      expect(meta.showTitleOnCover).toBe(true)
      expect(meta.prompt).toBe('Imported from EPUB')
      expect(meta.status).toBe('reading')
      expect(meta.imported).toBe(true)
      expect(meta.totalChapters).toBe(2)
      expect(meta.generatedUpTo).toBe(2)
      expect(meta.tags).toEqual([])
      expect(meta.audioGeneratedChapters).toEqual([])

      const saved = await deps.bookRepository.getBook(meta.id)
      expect(saved).toEqual(meta)

      const toc = await deps.bookRepository.getToc(meta.id)
      expect(toc.chapters).toEqual([
        { title: 'Chapter One', description: 'First chapter.' },
        { title: 'Chapter Two', description: 'Second chapter.' },
      ])

      expect(await deps.bookRepository.getChapter(meta.id, 1)).toBe('# Chapter One\n\nFirst body.')
      expect(await deps.bookRepository.getChapter(meta.id, 2)).toBe('# Chapter Two\n\nSecond body.')
    })

    it('saves the cover through ArtifactStore when the EPUB had one', async () => {
      const deps = makeDeps()
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'))

      expect(await deps.artifactStore.hasCover(meta.id)).toBe(true)
    })

    it('does not touch ArtifactStore when the EPUB had no cover', async () => {
      const bookWithoutCover: ImportedBook = { ...IMPORTED_BOOK, cover: undefined }
      const deps = makeDeps(bookWithoutCover)
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'))

      expect(await deps.artifactStore.hasCover(meta.id)).toBe(false)
    })

    it('omits subtitle and showTitleOnCover from meta when the EPUB has neither', async () => {
      const minimalBook: ImportedBook = {
        meta: { title: 'Minimal Book' },
        chapters: [{ title: 'Only Chapter', description: '', markdown: '# Only\n\nBody.' }],
      }
      const deps = makeDeps(minimalBook)
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'))

      expect(meta.subtitle).toBeUndefined()
      expect(meta.showTitleOnCover).toBeUndefined()
    })

    it('applies tags, series, and seriesOrder from the caller-supplied options', async () => {
      const deps = makeDeps()
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'), {
        tags: ['fiction', 'imported'],
        series: 'The Great Series',
        seriesOrder: 3,
      })

      expect(meta.tags).toEqual(['fiction', 'imported'])
      expect(meta.series).toBe('The Great Series')
      expect(meta.seriesOrder).toBe(3)
    })

    it('defaults tags to an empty array and omits series fields when no options are given', async () => {
      const deps = makeDeps()
      const { importEpub } = createImportBook(deps)

      const meta = await importEpub(Buffer.from('epub bytes'))

      expect(meta.tags).toEqual([])
      expect(meta.series).toBeUndefined()
      expect(meta.seriesOrder).toBeUndefined()
    })
  })
})
