import { randomUUID } from 'node:crypto'
import type { BookMeta } from '@shared/domain.js'
import type { EpubPreview } from '@shared/responses.js'
import type { EpubImport } from '../ports/epub-import.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'

export type { EpubPreview }

/**
 * Previews and imports an EPUB. Splits what server/services/epub-importer.ts
 * used to do in one module: EpubImport.preview/read already return pure
 * data and write nothing (see epub-import.ts's own doc), so this service is
 * the thing that persists, assigning the new book its id, timestamps, and
 * status, then saving it through BookRepository and ArtifactStore.
 */

export interface ImportBookDeps {
  epubImport: EpubImport
  bookRepository: Pick<BookRepository, 'saveBook' | 'saveToc' | 'saveChapter'>
  artifactStore: Pick<ArtifactStore, 'saveCover'>
}

export interface ImportBookOptions {
  tags?: string[]
  series?: string
  seriesOrder?: number
}

export function createImportBook(deps: ImportBookDeps) {
  const { epubImport, bookRepository, artifactStore } = deps

  return {
    /** Metadata only, for the import confirmation screen. Persists nothing. */
    async previewEpub(buffer: Buffer): Promise<EpubPreview> {
      return epubImport.preview(buffer)
    },

    /** Full conversion to a Tutor book, persisted and returned. */
    async importEpub(buffer: Buffer, options?: ImportBookOptions): Promise<BookMeta> {
      const imported = await epubImport.read(buffer)

      const bookId = randomUUID()
      const now = new Date().toISOString()

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

      await bookRepository.saveBook(meta)

      await bookRepository.saveToc(bookId, {
        chapters: imported.chapters.map((chapter) => ({ title: chapter.title, description: chapter.description })),
      })

      for (let i = 0; i < imported.chapters.length; i++) {
        await bookRepository.saveChapter(bookId, i + 1, imported.chapters[i].markdown)
      }

      if (imported.cover) {
        await artifactStore.saveCover(bookId, imported.cover.data, imported.cover.mediaType)
      }

      return meta
    },
  }
}
