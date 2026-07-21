import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'
import type { LibraryBook } from '@shared/responses.js'

export interface ListLibraryDeps {
  books: BookRepository
  artifacts: ArtifactStore
}

/**
 * GET /api/books — every saved book, augmented with cover, progress, and
 * audiobook flags for the library grid.
 *
 * Never throws. A failure listing books at all falls back to an empty
 * library, and a failure augmenting one book falls back to that book's
 * defaults, so one corrupt book can't blank the whole screen. Mirrors the
 * try/catch swallowing server/routes/library.ts always did.
 */
export function createListLibrary({ books, artifacts }: ListLibraryDeps) {
  return async function listLibrary(): Promise<LibraryBook[]> {
    let allBooks: Awaited<ReturnType<typeof books.listBooks>>
    try {
      allBooks = await books.listBooks()
    } catch (err) {
      console.error('[listLibrary] listBooks() failed:', err)
      allBooks = []
    }

    return Promise.all(allBooks.map(async (book): Promise<LibraryBook> => {
      try {
        return {
          ...book,
          hasCover: await artifacts.hasCover(book.id),
          showTitleOnCover: book.showTitleOnCover ?? false,
          coverUpdatedAt: (await artifacts.getCoverMtime(book.id))?.toISOString() ?? null,
          chaptersRead: await books.getChaptersRead(book.id),
          // m4b presence is the source of truth — see the crash recovery
          // comment on ArtifactStore for why.
          hasAudiobook: artifacts.audiobookExists(book.id),
        }
      } catch (err) {
        console.error(`[listLibrary] Failed to augment book "${book.id}":`, err)
        return {
          ...book,
          hasCover: false,
          showTitleOnCover: false,
          coverUpdatedAt: null,
          chaptersRead: 0,
          hasAudiobook: false,
        }
      }
    }))
  }
}
