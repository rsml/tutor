import { getDataDir } from '@shared/node/data-dir.js'
import type { GenerationStatus } from '@shared/responses.js'
import type { Quiz } from '@shared/domain.js'
import { type ProviderId } from '@shared/provider.js'
import { createAiSdkTextGeneration } from '../adapters/ai-sdk-text-generation.js'
import { createFileKeyVault } from '../adapters/file-key-vault.js'
import { createGenerateQuiz, QUIZ_QUALITY_RULES, shuffleQuizOptions } from './generate-quiz.js'
import type { ChapterGenerationStream } from './chapter-generation-stream.js'

/**
 * TEMPORARY COMPATIBILITY SHIM, in the same spirit as book-store.ts,
 * key-store.ts, and task-manager.ts elsewhere in this codebase. This module
 * used to hold every piece of chapter-generation logic and state directly.
 * All of that has moved: the in-memory stream hub is now
 * chapter-generation-stream.ts, the single-chapter generation core is
 * generate-next-chapter.ts, and quiz generation is generate-quiz.ts. This
 * file only bridges the two pieces that still have an external caller which
 * has not migrated onto ports yet:
 *
 * - getStatus(bookId), read by server/routes/library.ts to embed generation
 *   status on GET /api/books/:id. registerChapterGenerationStream() is
 *   called once by server/routes/generation.ts, when it builds its own
 *   ports-derived ChapterGenerationStream, so this shim observes that exact
 *   same live state instead of a separate, always-empty one.
 * - generateQuiz/QUIZ_QUALITY_RULES/shuffleQuizOptions, read by
 *   server/routes/assessment.ts. The two rules/shuffle exports are the real
 *   ones from generate-quiz.ts, re-exported rather than copied, so there is
 *   only one implementation. generateQuiz below builds its own real
 *   TextGeneration adapter per call, exactly like book-store.ts and
 *   key-store.ts build their own real adapter instances while their
 *   callers migrate one at a time.
 *
 * Both callers move onto their own ports directly in a later stage, and
 * this file goes away.
 */

export { QUIZ_QUALITY_RULES, shuffleQuizOptions }

let sharedChapterGenerationStream: ChapterGenerationStream | undefined

/**
 * Called once by server/routes/generation.ts's plugin registration. Not
 * called at all means no generation has ever started in this process, so
 * getStatus() below falls back to reporting inactive rather than throwing.
 */
export function registerChapterGenerationStream(stream: ChapterGenerationStream): void {
  sharedChapterGenerationStream = stream
}

export function getStatus(bookId: string): GenerationStatus {
  return sharedChapterGenerationStream?.getStatus(bookId) ?? { active: false }
}

/**
 * @deprecated Backward-compatible shim for server/routes/assessment.ts,
 * which has not migrated onto the TextGeneration port yet. Builds its own
 * adapter instance per call, the same way the other legacy shims in this
 * codebase do while call sites migrate one at a time. Always includes the
 * shared markdown formatting rules, matching this module's own historical
 * generateQuiz (the one assessment.ts has always called).
 */
export async function generateQuiz(
  provider: string,
  model: string,
  chapterContent: string,
  quizLength?: number,
): Promise<Quiz> {
  const ai = createAiSdkTextGeneration({ keyVault: createFileKeyVault({ dataDir: getDataDir() }) })
  return createGenerateQuiz({ ai })({
    provider: provider as ProviderId,
    model,
    chapterContent,
    quizLength,
    includeFormattingRules: true,
  })
}
