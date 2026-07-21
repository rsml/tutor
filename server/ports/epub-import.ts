import type { EpubPreview } from '@shared/responses.js'

/**
 * Parses an EPUB file into the data Tutor needs to preview or import it.
 *
 * Abstracts server/services/epub-importer.ts, whose current implementation
 * mixes EPUB parsing with persistence. It imports the book store and calls
 * saveBook, saveToc, saveChapter, and saveCover directly, so today the only
 * way to check "did we parse this EPUB correctly" is to also exercise the
 * filesystem. This port removes that coupling. read() returns pure data,
 * meaning the meta fields, an ordered chapters array, and optional cover
 * bytes, and it writes nothing. A later service takes that data, assigns
 * the book its id, timestamps, and status, and persists it.
 *
 * EpubPreview is the shape already sent over the wire by
 * POST /api/books/import/preview, defined once in shared/responses.ts.
 */

/** One chapter recovered from the EPUB's spine, in reading order. */
export interface ImportedChapter {
  title: string
  description: string
  /** Chapter body, already converted to markdown. */
  markdown: string
}

/** The cover image embedded in the EPUB, if it has one. */
export interface ImportedCover {
  data: Buffer
  mediaType: string
}

/**
 * Book-level fields recovered from the EPUB itself. Deliberately excludes
 * anything that belongs to persistence, such as id, status, timestamps, or
 * chapter counts, and anything supplied by the importing user rather than
 * the file, such as tags or series. Those are the persisting service's job.
 */
export interface ImportedBookMeta {
  title: string
  subtitle?: string
  showTitleOnCover?: boolean
}

/** The full result of reading an EPUB: pure data, nothing persisted. */
export interface ImportedBook {
  meta: ImportedBookMeta
  chapters: ImportedChapter[]
  cover?: ImportedCover
}

export interface EpubImport {
  /** Metadata only, for the import confirmation screen. Cheap: no chapter conversion. */
  preview(bytes: Buffer): Promise<EpubPreview>
  /** Full conversion to importable data. Must not write anything. */
  read(bytes: Buffer): Promise<ImportedBook>
}
