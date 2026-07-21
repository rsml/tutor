import { randomUUID } from 'node:crypto'
import type { BookMeta } from '@shared/domain.js'
import type { EpubPreview } from '@shared/responses.js'
import { createEpub2Import } from '../adapters/epub2-import.js'
import { saveBook, saveToc, saveChapter, saveCover } from './book-store.js'

export type { EpubPreview }

/**
 * Parsing (preview and full read) is delegated to the EpubImport adapter,
 * which returns pure data and writes nothing. This module's job is
 * everything the adapter deliberately excludes: assigning the book its id,
 * timestamps, and status, and persisting it via book-store. A later stage
 * moves that persistence into a dedicated service; for now previewEpub and
 * importEpub keep their existing signatures and behavior.
 */
const epubImport = createEpub2Import()

/**
 * Preview an EPUB file — extract metadata only without full chapter content.
 */
export async function previewEpub(buffer: Buffer): Promise<EpubPreview> {
  return epubImport.preview(buffer)
}

/**
 * Import an EPUB file — full conversion to a Tutor book.
 */
export async function importEpub(
  buffer: Buffer,
  options?: { tags?: string[]; series?: string; seriesOrder?: number },
): Promise<BookMeta> {
  const imported = await epubImport.read(buffer)

  const bookId = randomUUID()
  const now = new Date().toISOString()

  // Create the book metadata
  const meta: BookMeta = {
    id: bookId,
    title: imported.meta.title,
    ...(imported.meta.subtitle ? { subtitle: imported.meta.subtitle } : {}),
    prompt: 'Imported from EPUB',
    status: 'reading',
    totalChapters: imported.chapters.length,
    generatedUpTo: imported.chapters.length,
    createdAt: now,
    updatedAt: now,
    imported: true,
    ...(typeof imported.meta.showTitleOnCover === 'boolean'
      ? { showTitleOnCover: imported.meta.showTitleOnCover }
      : {}),
    tags: options?.tags ?? [],
    audioGeneratedChapters: [],
    ...(options?.series ? { series: options.series } : {}),
    ...(options?.seriesOrder ? { seriesOrder: options.seriesOrder } : {}),
  }

  // Save book meta (also creates directories)
  await saveBook(meta)

  // Save TOC
  await saveToc(bookId, {
    chapters: imported.chapters.map(chapter => ({ title: chapter.title, description: chapter.description })),
  })

  // Save each chapter
  for (let i = 0; i < imported.chapters.length; i++) {
    await saveChapter(bookId, i + 1, imported.chapters[i].markdown)
  }

  // Save cover if present
  if (imported.cover) {
    await saveCover(bookId, imported.cover.data, imported.cover.mediaType)
  }

  return meta
}
