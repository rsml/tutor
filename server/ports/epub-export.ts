/**
 * Renders a book's chapters into EPUB bytes.
 *
 * Abstracts the epub-gen-memory usage inline in the POST
 * /api/books/:id/export-epub route handler in server/routes/books.ts. That
 * handler builds an options object (title, author, numberChaptersInTOC,
 * prependChapterTitles, an optional cover file URL, and optional inlined
 * CSS) plus an ordered chapter array, then calls epub-gen-memory's default
 * export to get a Buffer back. This port keeps that library, and the CJS
 * double-default handling it needs under Electron, entirely inside the
 * adapter.
 *
 * numberChaptersInTOC and prependChapterTitles are always false in current
 * usage, so they are not part of this surface. coverPath takes a filesystem
 * path rather than the file:// URL epub-gen-memory wants; the adapter owns
 * that conversion.
 */

export interface EpubExportChapter {
  title: string
  /** Chapter body as HTML, already rendered from markdown. */
  html: string
}

export interface EpubBuildRequest {
  title: string
  author: string
  /** Inlined stylesheet, e.g. KaTeX CSS when a chapter has math. */
  css?: string
  /** Filesystem path to a cover image, if the book has one. */
  coverPath?: string
  /** Chapters in the order they must appear in the EPUB. */
  chapters: EpubExportChapter[]
}

export interface EpubExport {
  build(req: EpubBuildRequest): Promise<Buffer>
}
