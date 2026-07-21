import { describe, expect, it } from 'vitest'
import * as genManager from './generation-manager.js'
import * as generateQuizModule from './generate-quiz.js'
import type { ChapterGenerationStream } from './chapter-generation-stream.js'

// generation-manager.ts is now a thin backward-compatibility shim, kept only
// for the two call sites that have not migrated onto ports yet:
// server/routes/library.ts (getStatus) and server/routes/assessment.ts
// (generateQuiz, QUIZ_QUALITY_RULES, shuffleQuizOptions). It no longer owns
// any generation logic itself — see chapter-generation-stream.ts and
// generate-quiz.ts for that.

describe('generation-manager (legacy shim)', () => {
  it('reports inactive until a chapter generation stream is registered, then delegates to it', () => {
    expect(genManager.getStatus('book-never-registered')).toEqual({ active: false })

    const stub: ChapterGenerationStream = {
      isGenerating: () => true,
      getStatus: () => ({ active: true, chapterNum: 2, stage: 'streaming', contentLength: 10 }),
      subscribe: () => () => {},
      startGeneration: () => {},
    }
    genManager.registerChapterGenerationStream(stub)

    expect(genManager.getStatus('any-book-id')).toEqual({ active: true, chapterNum: 2, stage: 'streaming', contentLength: 10 })
  })

  it('re-exports QUIZ_QUALITY_RULES and shuffleQuizOptions from generate-quiz.ts, not a second copy', () => {
    expect(genManager.QUIZ_QUALITY_RULES).toBe(generateQuizModule.QUIZ_QUALITY_RULES)
    expect(genManager.shuffleQuizOptions).toBe(generateQuizModule.shuffleQuizOptions)
  })

  it('generateQuiz builds a real adapter and fails synchronously with no API key configured, never reaching the network', async () => {
    await expect(
      genManager.generateQuiz('anthropic', 'claude-sonnet-4-6', 'chapter text'),
    ).rejects.toThrow('No API key configured for provider: anthropic')
  })
})
