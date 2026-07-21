import { z } from 'zod'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { getProfileContext } from './profile-context.js'

/**
 * Suggests specific focus areas and goals for a book topic, tailored to the
 * reader's learning profile.
 */

export interface SuggestBookDetailsDeps {
  books: BookRepository
  textGeneration: TextGeneration
}

export interface SuggestBookDetailsRequest {
  topic: string
  model: string
  provider?: ProviderId
}

export interface BookDetailsSuggestion {
  details: string
}

export function createSuggestBookDetails(deps: SuggestBookDetailsDeps) {
  return async function suggestBookDetails(req: SuggestBookDetailsRequest): Promise<BookDetailsSuggestion> {
    const { topic, model, provider } = req
    const profileContext = await getProfileContext(deps.books)

    return deps.textGeneration.generateObject({
      model: { provider: provider ?? DEFAULT_PROVIDER, model },
      schema: z.object({
        details: z.string().describe('Specific focus areas, goals, and context for this book (2-4 sentences)'),
      }),
      prompt: `You are a learning advisor. Given a book topic and the reader's learning profile, suggest specific details for what this book should cover and how it should be tailored to the reader.

=== TOPIC ===
${topic}

=== LEARNER PROFILE ===
${profileContext || 'No profile available.'}

=== INSTRUCTIONS ===
1. Suggest specific focus areas, prerequisites to cover, and learning goals for this topic
2. Tailor the suggestions to the reader's experience level, role, and interests from their profile
3. If the profile mentions relevant skills or knowledge, reference how this book should build on them
4. Keep it practical and actionable — 2-4 sentences
5. Do NOT repeat the topic name — focus on what the book should specifically cover`,
    })
  }
}
