import type { EpubPreview } from '@shared/responses.js'
import type { EpubImport, ImportedBook } from './epub-import.js'

/** Canned responses a fake should return, overriding the built-in defaults. */
export interface EpubImportFixture {
  preview?: EpubPreview
  book?: ImportedBook
}

const DEFAULT_PREVIEW: EpubPreview = {
  title: 'Fake Imported Book',
  subtitle: 'A Fixture For Contract Tests',
  chapterCount: 2,
  hasCover: true,
  coverBase64: 'data:image/png;base64,ZmFrZS1jb3Zlcg==',
}

const DEFAULT_BOOK: ImportedBook = {
  meta: {
    title: 'Fake Imported Book',
    subtitle: 'A Fixture For Contract Tests',
    showTitleOnCover: true,
  },
  chapters: [
    { title: 'Chapter One', description: 'The first chapter.', markdown: '# Chapter One\n\nContent.' },
    { title: 'Chapter Two', description: 'The second chapter.', markdown: '# Chapter Two\n\nMore content.' },
  ],
  cover: { data: Buffer.from('fake-cover-bytes'), mediaType: 'image/png' },
}

function cloneBook(book: ImportedBook): ImportedBook {
  return {
    meta: { ...book.meta },
    chapters: book.chapters.map(chapter => ({ ...chapter })),
    cover: book.cover ? { data: Buffer.from(book.cover.data), mediaType: book.cover.mediaType } : undefined,
  }
}

function clonePreview(preview: EpubPreview): EpubPreview {
  return { ...preview }
}

/** One call this fake received, recorded for contract-test assertions. */
export interface FakeEpubImportCall {
  method: 'preview' | 'read'
  byteLength: number
}

export interface FakeEpubImport extends EpubImport {
  readonly calls: FakeEpubImportCall[]
}

/**
 * Deterministic in-memory EpubImport. Ignores the actual EPUB bytes and
 * always answers with the fixture (or built-in defaults), which is enough
 * to pin the port's documented behavior without a real EPUB parser.
 *
 * Returns a fresh clone on every call rather than a shared reference, the
 * same way a real adapter re-parsing the buffer would, so nothing about one
 * call's result can leak into another.
 */
export function createFakeEpubImport(fixture: EpubImportFixture = {}): FakeEpubImport {
  const preview = fixture.preview ?? DEFAULT_PREVIEW
  const book = fixture.book ?? DEFAULT_BOOK
  const calls: FakeEpubImportCall[] = []

  return {
    calls,
    async preview(bytes) {
      calls.push({ method: 'preview', byteLength: bytes.length })
      return clonePreview(preview)
    },
    async read(bytes) {
      calls.push({ method: 'read', byteLength: bytes.length })
      return cloneBook(book)
    },
  }
}
