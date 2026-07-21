import type { CreateBookEvent } from '@shared/events.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { TextGeneration } from '../ports/text-generation.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { Clock } from '../ports/clock.js'
import { getProfileContext } from './profile-context.js'
import { parseTocFromMarkdown, truncateChapters } from './toc-parser.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_CHAPTER_COUNT, TOC_ERROR_SNIPPET_CHARS } from '../constants.js'

/**
 * POST /api/books — creates a new book and streams its table of contents.
 * Persists the book immediately (status generating_toc) so it shows up in
 * the library while the TOC streams, then on a successful parse flips it to
 * toc_review and saves the chapters. A TOC that fails to parse leaves the
 * book in generating_toc rather than marking it failed — that quirk is
 * preserved from the original implementation. Any other failure (a thrown
 * error from the AI call or a persistence write) marks the book failed,
 * falling back to deleting it if even that write does not succeed.
 */
export interface CreateBookRequest {
  topic: string
  details?: string
  chapterCount?: number
  model: string
  provider?: string
}

export function createCreateBook(deps: { ai: TextGeneration; books: BookRepository; clock: Clock }) {
  return async function createBook(
    bookId: string,
    req: CreateBookRequest,
    send: (event: CreateBookEvent) => void,
  ): Promise<void> {
    const totalChapters = req.chapterCount ?? DEFAULT_CHAPTER_COUNT

    try {
      // Persist book immediately so it appears in the library during generation
      const now = deps.clock.nowIso()
      await deps.books.saveBook({
        id: bookId,
        title: req.topic,
        prompt: `${req.topic}${req.details ? `\n\n${req.details}` : ''}`,
        status: 'generating_toc',
        totalChapters,
        generatedUpTo: 0,
        createdAt: now,
        updatedAt: now,
        tags: [],
        audioGeneratedChapters: [],
      })
      send({ type: 'book_created', bookId, title: req.topic, totalChapters })

      // Phase 1: Generate TOC
      const profileContext = await getProfileContext(deps.books)
      const provider = (req.provider ?? DEFAULT_PROVIDER) as ProviderId
      let tocText = ''
      for await (const chunk of deps.ai.streamText({
        model: { provider, model: req.model },
        system: `You are creating a table of contents for a personalized learning book.

Generate a well-structured table of contents with exactly ${totalChapters} chapters.

Start with a # heading for the book title. Think like an O'Reilly or Pragmatic Bookshelf editor:
- Title: 2-5 words, memorable and specific. No filler like "Comprehensive Guide to" or "Introduction to".
- Subtitle: max 8 words, a punchy tagline — not a sentence. No "A guide to..." or "How to..." patterns.

Then list each chapter as a numbered item with:
- A **bold chapter title**
- An em-dash followed by a one-sentence description

Example format:
# Resilient CSS
*Layout Systems for the Real World*

# Temporal in Practice
*Durable Workflows Beyond Request-Response*

1. **The Box Model Revisited** — Understanding the foundation that everything else builds on.
2. **Flexbox Deep Dive** — Layout patterns that solve real problems elegantly.

${profileContext ? `\nReader profile:\n${profileContext}\n\nTailor the book structure and difficulty to match the reader's background and preferences.\n` : ''}Just output the title and table of contents, nothing else.

${MARKDOWN_FORMATTING_RULES}`,
        prompt: `Create a table of contents for a book about: ${req.topic}${req.details ? `\n\nAdditional context: ${req.details}` : ''}`,
      })) {
        tocText += chunk
        send({ type: 'toc', text: chunk })
      }

      const { title, subtitle, chapters: parsedChapters } = parseTocFromMarkdown(tocText)
      const chapters = truncateChapters(parsedChapters, totalChapters)

      if (chapters.length === 0) {
        const snippet = tocText.trim().slice(0, TOC_ERROR_SNIPPET_CHARS)
        console.error(`[create-book] TOC parse failed for "${bookId}". Raw model output:\n---\n${tocText}\n---`)
        send({
          type: 'error',
          message: snippet
            ? `Failed to parse table of contents — model returned: "${snippet}${tocText.length > 300 ? '…' : ''}"`
            : 'Failed to parse table of contents — model returned empty response',
        })
        return
      }

      // Update the early-persisted book with real title/subtitle from AI
      const existingMeta = await deps.books.getBook(bookId)
      existingMeta.title = title
      existingMeta.subtitle = subtitle
      existingMeta.status = 'toc_review'
      existingMeta.totalChapters = chapters.length
      existingMeta.updatedAt = deps.clock.nowIso()
      await deps.books.saveBook(existingMeta)
      await deps.books.saveToc(bookId, { chapters })

      send({ type: 'toc_done', bookId, title, subtitle, totalChapters: chapters.length })
      send({ type: 'done', bookId, title, totalChapters: chapters.length })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed'
      console.error(`[create-book] Book "${bookId}" generation failed:`, error)
      // Mark as failed instead of deleting — preserves any partial content
      try {
        const meta = await deps.books.getBook(bookId)
        meta.status = 'failed'
        meta.updatedAt = deps.clock.nowIso()
        await deps.books.saveBook(meta)
      } catch {
        // If we can't even update the status, delete as last resort
        try { await deps.books.deleteBook(bookId) } catch { /* ignore */ }
      }
      send({ type: 'error', message: errorMessage })
    }
  }
}
