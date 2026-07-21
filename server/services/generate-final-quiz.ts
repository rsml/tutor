import { z } from 'zod'
import type { Quiz } from '@shared/domain.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { planFinalQuiz } from '../domain/final-quiz-plan.js'
import { shuffleQuizOptions } from '../domain/quiz-scoring.js'
import { QUIZ_QUALITY_RULES } from './generate-quiz.js'

/**
 * Builds (or returns the cached) whole-book final quiz. The character
 * budget per chapter, question count, and focus instructions come from
 * domain/final-quiz-plan.ts, tiered by how many chapters the book has
 * generated so far. The shuffle is domain/quiz-scoring.ts's, not
 * generate-quiz.ts's — this service makes its own AI call through the
 * TextGeneration port rather than delegating generation elsewhere, so its
 * shuffle needs to be the one with an injectable random source.
 */

export interface GenerateFinalQuizDeps {
  books: BookRepository
  textGeneration: TextGeneration
}

export interface GenerateFinalQuizRequest {
  bookId: string
  model: string
  provider?: ProviderId
}

export function createGenerateFinalQuiz(deps: GenerateFinalQuizDeps) {
  return async function generateFinalQuiz(req: GenerateFinalQuizRequest): Promise<Quiz> {
    const { bookId, model, provider } = req

    // Return the cached final quiz if it already exists.
    if (deps.books.finalQuizExists(bookId)) {
      return await deps.books.getFinalQuiz(bookId)
    }

    const meta = await deps.books.getBook(bookId)
    const toc = await deps.books.getToc(bookId)

    // Scale context per chapter based on how many chapters exist so far.
    const totalChapters = meta.generatedUpTo
    const { charsPerChapter, focusInstructions } = planFinalQuiz(totalChapters)

    const chapterSummaries: string[] = []
    for (let i = 1; i <= totalChapters; i++) {
      try {
        const content = await deps.books.getChapter(bookId, i)
        const trimmed = content.length <= charsPerChapter ? content : content.slice(0, charsPerChapter) + '...'
        chapterSummaries.push(`Chapter ${i} "${toc.chapters[i - 1]?.title}":\n${trimmed}`)
      } catch { /* skip */ }
    }

    // Gather all prior quiz data to avoid repeating questions.
    const allFeedback = await deps.books.getAllFeedback(bookId)
    const priorQuestions = allFeedback.flatMap(fb => fb.quiz.questions.map(q => q.question))

    const result = await deps.textGeneration.generateObject({
      model: { provider: provider ?? DEFAULT_PROVIDER, model },
      schema: z.object({
        questions: z.array(z.object({
          question: z.string(),
          options: z.array(z.string()),
          correctIndex: z.number(),
        })),
      }),
      prompt: `You are creating a final comprehensive quiz for a book the reader has just finished.

Book: ${meta.title}
Topic: ${meta.prompt}

Table of Contents:
${toc.chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Chapter content:
${chapterSummaries.join('\n\n')}

${focusInstructions}
- Be meaningfully different from these previously asked questions:
${priorQuestions.map(q => `  - ${q}`).join('\n')}

${QUIZ_QUALITY_RULES}

IMPORTANT: ONLY ask about concepts, facts, and ideas explicitly discussed in the chapter content above. Do NOT draw on outside knowledge of the topic.`,
    })

    const shuffled = shuffleQuizOptions(result)
    await deps.books.saveFinalQuiz(bookId, shuffled)
    return shuffled
  }
}
