import type { BookRepository } from '../ports/book-repository.js'
import type { SearchResults } from '@shared/responses.js'
import type { Toc } from '@shared/domain.js'
import { SEARCH_SNIPPET_RADIUS } from '../constants.js'

export interface SearchLibraryDeps {
  books: BookRepository
}

/**
 * GET /api/books/search — title/subtitle matches always, plus TOC and
 * chapter-content matches when `full` is true.
 *
 * An empty (or whitespace-only) query always yields no results, matching
 * how the search box behaves before the reader has typed anything.
 */
export function createSearchLibrary({ books }: SearchLibraryDeps) {
  return async function searchLibrary(rawQuery: string, options: { full: boolean }): Promise<SearchResults> {
    const query = rawQuery.trim().toLowerCase()
    if (!query) return { results: [] }

    const allBooks = await books.listBooks()
    const results: SearchResults['results'] = []

    for (const book of allBooks) {
      const matches: SearchResults['results'][number]['matches'] = []

      if (book.title.toLowerCase().includes(query)) {
        matches.push({ type: 'title', snippet: book.title })
      }
      if (book.subtitle && book.subtitle.toLowerCase().includes(query)) {
        matches.push({ type: 'title', snippet: book.subtitle })
      }

      if (options.full) {
        let toc: Toc | undefined
        try {
          toc = await books.getToc(book.id)
        } catch {
          // No TOC available, nothing further to search for this book.
        }

        if (toc) {
          for (let i = 0; i < toc.chapters.length; i++) {
            const ch = toc.chapters[i]
            if (ch.title.toLowerCase().includes(query) || ch.description.toLowerCase().includes(query)) {
              matches.push({ type: 'toc', chapter: i + 1, snippet: `${ch.title} — ${ch.description}` })
            }
          }

          for (let i = 0; i < toc.chapters.length; i++) {
            try {
              const content = await books.getChapter(book.id, i + 1)
              const lowerContent = content.toLowerCase()
              const idx = lowerContent.indexOf(query)
              if (idx !== -1) {
                const start = Math.max(0, idx - SEARCH_SNIPPET_RADIUS)
                const end = Math.min(content.length, idx + query.length + SEARCH_SNIPPET_RADIUS)
                let snippet = content.slice(start, end).replace(/\n/g, ' ')
                if (start > 0) snippet = '...' + snippet
                if (end < content.length) snippet = snippet + '...'
                matches.push({ type: 'chapter', chapter: i + 1, snippet })
              }
            } catch {
              // Chapter file not available, skip.
            }
          }
        }
      }

      if (matches.length > 0) {
        results.push({ bookId: book.id, matches })
      }
    }

    return { results }
  }
}
