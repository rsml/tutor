import type { BookMeta, Toc } from '@shared/domain.js'
import type { ReviseTocEvent } from '@shared/events.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { TextGeneration } from '../ports/text-generation.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { Clock } from '../ports/clock.js'
import { getProfileContext } from './profile-context.js'
import { parseTocFromMarkdown, truncateChapters } from './toc-parser.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { MAX_CHAPTERS } from '../constants.js'
import { sanitizeFeedback } from '../domain/sanitize.js'

/**
 * POST /api/books/:id/toc/revise — applies the reader's targeted feedback
 * to an existing table of contents and streams the revision. The caller
 * (server/routes/generation.ts) has already checked the book is in
 * toc_review with a non-empty TOC and passes both in, so this service never
 * re-fetches them — it mutates and saves the very BookMeta it was given,
 * matching the original inline handler's behaviour exactly.
 *
 * Unlike create-book, a failure here never marks the book failed — it just
 * reports the error over the stream and leaves the book exactly as it was.
 */
export interface ReviseTocRequest {
  feedback: string
  model: string
  provider?: string
}

export function createReviseToc(deps: { ai: TextGeneration; books: BookRepository; clock: Clock }) {
  return async function reviseToc(
    bookId: string,
    book: BookMeta,
    currentToc: Toc,
    req: ReviseTocRequest,
    send: (event: ReviseTocEvent) => void,
  ): Promise<void> {
    try {
      const profileContext = await getProfileContext(deps.books)
      const feedback = sanitizeFeedback(req.feedback)

      const existingTocMarkdown = `# ${book.title}${book.subtitle ? `\n*${book.subtitle}*` : ''}\n\n${currentToc.chapters
        .map((ch, i) => `${i + 1}. **${ch.title}** — ${ch.description}`)
        .join('\n')}`

      const provider = (req.provider ?? DEFAULT_PROVIDER) as ProviderId
      let revisedText = ''
      for await (const chunk of deps.ai.streamText({
        model: { provider, model: req.model },
        system: `You are revising an existing table of contents. Apply ONLY the reader's targeted changes. Every chapter the reader did not mention must be preserved EXACTLY — same title, same description, same position.

Constraints:
- The revised TOC must have exactly ${book.totalChapters} chapters, UNLESS the reader explicitly requested a different count in their feedback.
- Preserve the title and subtitle UNLESS the reader asked to change them.
- For any chapter the reader did not reference, output it verbatim — do not rephrase, restructure, or "improve" it.
- Output in the same numbered markdown format as the existing TOC.
${profileContext ? `\nReader profile:\n${profileContext}\n` : ''}
Just output the title and table of contents, nothing else.

${MARKDOWN_FORMATTING_RULES}`,
        prompt: `Existing TOC:
${existingTocMarkdown}

Reader's requested changes:
${feedback}`,
      })) {
        revisedText += chunk
        send({ type: 'toc', text: chunk })
      }

      const parsed = parseTocFromMarkdown(revisedText)
      if (parsed.chapters.length === 0) {
        send({ type: 'error', message: "Couldn't parse the revised TOC — try rephrasing your feedback." })
        return
      }

      // Cap at the schema's hard ceiling. The AI is told the user-requested
      // count in the prompt; if they explicitly asked for more chapters, the
      // new count flows through. If the AI overshot the absolute ceiling
      // (500), truncate.
      const chaptersFinal = truncateChapters(parsed.chapters, MAX_CHAPTERS)

      // Persist — chapters only, no skills (deferred to /start)
      await deps.books.saveToc(bookId, { chapters: chaptersFinal })

      // Update meta — title, subtitle (if AI returned one), and
      // totalChapters whenever the chapter count changed.
      let metaChanged = false
      if (parsed.title && parsed.title !== book.title) {
        book.title = parsed.title
        metaChanged = true
      }
      // Only update subtitle if AI returned one — if the AI forgets to repeat the
      // subtitle line, we keep the existing one rather than clobber it. (The revise
      // prompt tells the AI to preserve subtitle unless asked to change it.) This
      // means subtitle can't be explicitly cleared via revise, which is acceptable
      // given how much more common the "AI forgot to repeat it" case is.
      if (parsed.subtitle !== undefined && parsed.subtitle !== book.subtitle) {
        book.subtitle = parsed.subtitle
        metaChanged = true
      }
      if (chaptersFinal.length !== book.totalChapters) {
        book.totalChapters = chaptersFinal.length
        metaChanged = true
      }
      if (metaChanged) {
        book.updatedAt = deps.clock.nowIso()
        await deps.books.saveBook(book)
      }

      send({
        type: 'toc_revised',
        bookId,
        title: book.title,
        subtitle: book.subtitle,
        totalChapters: chaptersFinal.length,
      })
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }
}
