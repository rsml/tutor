import { generateObject } from 'ai'
import { z } from 'zod'
import { createModelClient } from './model-client.js'
import * as genManager from './generation-manager.js'
import { DEFAULT_QUIZ_LENGTH } from '../constants.js'
import { createTimeout } from '../http/ai-timeout.js'

export async function generateQuiz(
  provider: string,
  model: string,
  chapterContent: string,
  quizLength: number = DEFAULT_QUIZ_LENGTH,
): Promise<{ questions: Array<{ question: string; options: string[]; correctIndex: number }> }> {
  const timeout = createTimeout()
  try {
    const result = await generateObject({
      model: createModelClient(provider, model),
      abortSignal: timeout.signal,
      schema: z.object({
        questions: z.array(z.object({
          question: z.string(),
          options: z.array(z.string()),
          correctIndex: z.number(),
        })),
      }),
      prompt: `Based on this chapter content, generate exactly ${quizLength} multiple-choice quiz questions to test comprehension. Each question should have 4 options with exactly one correct answer.

${genManager.QUIZ_QUALITY_RULES}

Chapter content:
${chapterContent}`,
    })
    return genManager.shuffleQuizOptions(result.object)
  } finally {
    timeout.clear()
  }
}
