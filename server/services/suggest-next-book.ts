import { z } from 'zod'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { Toc } from '@shared/domain.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { buildProfileContext } from '../domain/profile-context.js'
import { formatSkillProgress } from '../domain/skill-progress-report.js'
import { summarizeBookEvidence, type ClientChapterQuizHistory } from '../domain/learning-evidence.js'

/**
 * Suggests one next book topic from the reader's full evidence hierarchy:
 * learning profile, per-book quiz/feedback performance, client-reported quiz
 * history, and cross-book skill mastery. The per-book evidence summaries
 * come from domain/learning-evidence.ts; this service's own job is the I/O
 * (loading books, feedback, TOCs, skill progress) and the prompt assembly.
 */

export interface SuggestNextBookDeps {
  books: BookRepository
  textGeneration: TextGeneration
}

export interface SuggestNextBookRequest {
  model: string
  provider?: ProviderId
  mode?: 'deepen' | 'complementary'
  quizHistory?: Record<string, Record<string, ClientChapterQuizHistory>>
}

export interface BookSuggestion {
  topic: string
  details: string
  reasoning: string
}

export function createSuggestNextBook(deps: SuggestNextBookDeps) {
  return async function suggestNextBook(req: SuggestNextBookRequest): Promise<BookSuggestion> {
    const { model, provider, quizHistory, mode } = req

    const allBooks = await deps.books.listBooks()
    const profileContext = await buildProfileContext()
    const profileUpdatedAt = await deps.books.getProfileUpdatedAt()
    const skillProgress = await deps.books.getSkillProgress()
    const skillProgressContext = formatSkillProgress(skillProgress)

    const bookSummaries: string[] = []
    for (const book of allBooks) {
      const feedback = await deps.books.getAllFeedback(book.id)
      let toc: Toc | undefined
      try {
        toc = await deps.books.getToc(book.id)
      } catch { /* no toc yet */ }
      bookSummaries.push(summarizeBookEvidence(book, feedback, toc, quizHistory?.[book.id]))
    }

    return deps.textGeneration.generateObject({
      model: { provider: provider ?? DEFAULT_PROVIDER, model },
      schemaName: 'BookSuggestion',
      schemaDescription: 'A suggested next book for the learner. Must include all three fields: topic, details, and reasoning.',
      schema: z.object({
        topic: z.string().describe('The suggested book topic (concise, like "Kubernetes Networking" not "A book about...")'),
        details: z.string().describe('Additional context and focus areas for the book (2-3 sentences)'),
        reasoning: z.string().describe('Brief explanation of why this topic was suggested based on the learning gaps (1-2 sentences)'),
      }),
      prompt: `You are a learning advisor. Based on this reader's learning data — organized as an evidence hierarchy — suggest ONE book topic they should study next.

=== SUGGESTION MODE ===
${mode === 'deepen' ? 'DEEPEN EXISTING SKILLS: Suggest a topic that goes deeper into a skill or domain the reader already has. Look for areas where they have foundational knowledge but could level up — intermediate-to-advanced progression, filling gaps in existing expertise, or mastering a subtopic they\'ve only scratched the surface of.' : mode === 'complementary' ? 'LEARN COMPLEMENTARY SKILLS: Suggest a topic in a different domain that complements the reader\'s existing skills. Look for adjacent disciplines, cross-functional knowledge, or skills that would make their existing expertise more valuable — e.g., a developer learning design, a writer learning data visualization, a manager learning negotiation.' : 'Suggest whatever topic would be most valuable for the reader\'s growth, whether deepening existing skills or branching into new areas.'}

=== LAYER 1: LEARNER PROFILE (baseline identity + preferences) ===
${profileContext || 'No profile available.'}${profileUpdatedAt ? `\nProfile last updated: ${profileUpdatedAt.split('T')[0]}` : ''}

Note: The profile was accurate when written. Trust it proportionally to recency — a profile updated last week carries more weight than one updated a year ago. Durable facts (career role, domain expertise) remain reliable regardless of age; skill self-assessments may drift over time but were true when recorded.

=== LAYER 2: QUIZ PERFORMANCE (direct observation of knowledge) ===
${bookSummaries.length > 0 ? bookSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n\n') : 'No books or quiz data yet.'}

=== LAYER 3: SKILL MASTERY FROM BOOKS (content completion tracking) ===
${skillProgressContext || 'No skill mastery data yet.'}

=== SYNTHESIS INSTRUCTIONS ===
1. Always trust the profile as true when it was written — use the "Profile last updated" date to gauge how much the learner may have changed since then
2. When Layers 2+3 have data: use as primary evidence, but still respect the profile — it provides context (role, goals, preferences) that quiz/book data cannot
3. When Layers 2+3 are empty: the profile is the best available evidence; do NOT default to "assume no knowledge"
4. When evidence conflicts with profile: quiz/book data shows current state, profile shows prior state — the learner has changed (grown or revealed a gap); weight the more recent data accordingly
5. Look for natural progressions — partial completion of a skill suggests a complementary next topic
6. Never suggest a topic they already have a book for
7. Keep the topic specific and relevant to their role/goals (not "Programming" but "Event-Driven Architecture in Node.js")
8. The details should explain what the book should focus on and why it's a good next step given their learning data`,
    })
  }
}
