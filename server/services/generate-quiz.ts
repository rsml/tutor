import { z } from 'zod'
import type { Quiz } from '@shared/domain.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_QUIZ_LENGTH } from '../constants.js'

/**
 * Quality rules embedded in every quiz prompt. The "longest answer wins" pattern
 * emerges because models write the correct answer thoroughly while distractors
 * stay terse — a reader can score 100% by picking the longest option without
 * reading the question. These rules push the model toward length-balanced,
 * genuinely plausible distractors.
 */
export const QUIZ_QUALITY_RULES = `Quality rules for the options — every question MUST follow these:
- All 4 options MUST be similar in length (within ~20% character count of each other) and written at the same level of detail. The correct answer must NOT be noticeably longer, more specific, or more thoroughly hedged than the distractors. If you find yourself writing a long correct answer and short distractors, expand the distractors with equally plausible specifics.
- Distractors must be genuinely plausible to a reader who skimmed the chapter — common misconceptions, near-misses, or partially-correct statements. No obvious throwaways.
- Do not use "All of the above" or "None of the above".
- Do not start options with telltale qualifiers ("always", "never", "only") on incorrect answers and softer language on the correct one. Match register across all four.
- Vary which option index is correct across the question set — do not cluster the correct answer at the same position.`

// Deliberately looser than shared/domain.ts's QuizQuestionSchema (no exact
// option count, no correctIndex range). Both historical call sites this
// service reconciles (server/services/generate-quiz.ts and the private copy
// that lived in server/services/generation-manager.ts) validated against
// this same loose shape, so keeping it here preserves what an out-of-range
// or short model response does today rather than making it newly rejected.
const GeneratedQuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()),
    correctIndex: z.number(),
  })),
})

// Shuffles each question's options and updates correctIndex accordingly.
// Defence-in-depth against any positional bias the model exhibits.
export function shuffleQuizOptions<T extends { questions: Array<{ question: string; options: string[]; correctIndex: number }> }>(quiz: T): T {
  return {
    ...quiz,
    questions: quiz.questions.map(q => {
      const correctOption = q.options[q.correctIndex]
      const shuffled = [...q.options]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return { ...q, options: shuffled, correctIndex: shuffled.indexOf(correctOption) }
    }),
  }
}

export interface GenerateQuizRequest {
  model: string
  provider?: string
  chapterContent: string
  quizLength?: number
  /**
   * Whether to append the shared markdown formatting rules to the quiz
   * prompt. The two historical call sites disagreed on this: chapter-N quiz
   * generation (server/services/generation-manager.ts) always included
   * them, first-chapter quiz generation (server/services/generate-quiz.ts)
   * never did. Kept as an explicit flag, defaulting to false, so each
   * caller keeps its own prior behaviour instead of silently unifying it.
   */
  includeFormattingRules?: boolean
  /** Cancellation only, never a timeout — the TextGeneration adapter owns the timeout. */
  signal?: AbortSignal
}

export function createGenerateQuiz(deps: { ai: TextGeneration }) {
  return async function generateQuiz(req: GenerateQuizRequest): Promise<Quiz> {
    const quizLength = req.quizLength ?? DEFAULT_QUIZ_LENGTH
    const provider = (req.provider ?? DEFAULT_PROVIDER) as ProviderId

    const result = await deps.ai.generateObject({
      model: { provider, model: req.model },
      schema: GeneratedQuizSchema,
      signal: req.signal,
      prompt: `Based on this chapter content, generate exactly ${quizLength} multiple-choice quiz questions to test comprehension. Each question should have 4 options with exactly one correct answer.

${QUIZ_QUALITY_RULES}
${req.includeFormattingRules ? `\n${MARKDOWN_FORMATTING_RULES}\n` : ''}
Chapter content:
${req.chapterContent}`,
    })

    return shuffleQuizOptions(result)
  }
}
