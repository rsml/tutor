import { z } from 'zod'
import type { ProviderId } from '@shared/provider.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'

/**
 * Suggests an AI image prompt for a book's cover, extracted from the POST
 * /api/books/:id/cover/suggest-prompt route handler. Calls
 * ports.textGeneration.generateObject instead of the Vercel AI SDK
 * directly, so the adapter owns model resolution and the five-minute
 * request timeout rather than this service hand-rolling an AbortController.
 */

export interface SuggestCoverPromptDeps {
  bookRepository: Pick<BookRepository, 'getBook'>
  textGeneration: TextGeneration
}

export interface SuggestCoverPromptRequest {
  bookId: string
  provider?: ProviderId
  model: string
}

const ResponseSchema = z.object({ prompt: z.string() })

export function createSuggestCoverPrompt(deps: SuggestCoverPromptDeps) {
  const { bookRepository, textGeneration } = deps

  return async function suggestCoverPrompt(req: SuggestCoverPromptRequest): Promise<{ prompt: string }> {
    const meta = await bookRepository.getBook(req.bookId)

    return textGeneration.generateObject({
      model: { provider: req.provider ?? DEFAULT_PROVIDER, model: req.model },
      schema: ResponseSchema,
      prompt: `Output a prompt in this EXACT format (fill in the bracketed parts creatively based on this theme topic, choosing a unique visual style, color palette, and background concept):

          Generate a minimal, tasteful design

It is an art piece vaguely suggestive of or complementary of: ${meta.prompt}

very minimal abstract art

2-3 colors

lots of negative space

high resolution

--stylize 1 --v 6 --style raw --ar 21:34 --weird 0 --no photo --no realistic --no objects in center

top and bottom framing elements, large empty center

Important:
- Prefer simple abstract symbols over literal scenes
- Limit visual elements to 1–2 shapes or motifs
- Avoid complex textures, lighting, or realism
- Emphasize strong graphic design and negative space
- Keep the prompt under 450 characters`,
    })
  }
}
