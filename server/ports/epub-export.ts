/**
 * Renders a book's chapters into EPUB bytes.
 *
 * Abstracts the epub-gen-memory usage that used to be inline in the POST
 * /api/books/:id/export-epub route handler, before this port existed. That
 * handler built an options object (title, author, numberChaptersInTOC,
 * prependChapterTitles, an optional cover file URL, and optional inlined
 * CSS) plus an ordered chapter array, then called epub-gen-memory's default
 * export to get a Buffer back. This port keeps that library, and the CJS
 * double-default handling it needs under Electron, entirely inside the
 * adapter.
 *
 * numberChaptersInTOC and prependChapterTitles are always false in current
 * usage, so they are not part of this surface. coverPath takes a filesystem
 * path rather than the file:// URL epub-gen-memory wants; the adapter owns
 * that conversion.
 *
 * server/adapters/epub-gen-export.ts is the real adapter. The in-memory
 * fake is epub-export.fake.ts's createFakeEpubExport, and the shared
 * behavioural spec both must satisfy is epub-export.contract.ts's
 * describeEpubExportContract.
 */

/**
 * title here feeds only the EPUB's own chapter list and navigation entry.
 * Because prependChapterTitles is always false, per the file header above,
 * nothing here injects title into the rendered body, so a caller that
 * wants a visible heading must already have baked one into html.
 */
export interface EpubExportChapter {
  title: string
  /** Chapter body as HTML, already rendered from markdown. */
  html: string
}

/**
 * Every field here is the caller's own responsibility to assemble first.
 * This port never reads BookRepository or ArtifactStore itself, so a
 * cover, a title, or a chapter the caller forgets to include here is
 * simply absent from the EPUB, not fetched on this port's behalf.
 */
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

/**
 * This is purely a transform. build() returns bytes and writes nothing
 * itself. server/services/export-epub.ts is the caller that takes the
 * returned Buffer and persists it, through ArtifactStore.writeEpub, so
 * this port never needs its own knowledge of where an EPUB lives on disk.
 */
export interface EpubExport {
  build(req: EpubBuildRequest): Promise<Buffer>
}
