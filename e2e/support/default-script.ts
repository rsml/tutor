import { chapterStreamChunks } from '../fixtures/chapter-stream.js'
import { QUIZ_FIXTURE } from '../fixtures/quiz.js'
import { SKILL_CLASSIFICATION } from '../fixtures/skills.js'
import { TOC_STREAM_CHUNKS } from '../fixtures/toc-stream.js'
import { promptIncludes, systemIncludes, type ScriptedTextGeneration } from './scripted-text-generation.js'

/**
 * Wires every model call site the journeys traverse to its fixture.
 *
 * The matchers below are the one place this suite knows what the server's
 * prompts say. Each is a phrase lifted verbatim from the service that builds
 * that prompt, and the comment names the service, so when a prompt is
 * reworded the fix is a one line edit here rather than an archaeology
 * expedition. A reworded prompt does not fail silently either, because an
 * unmatched call throws with the request summary attached.
 *
 * Rules are consulted newest first, so a journey adds its own rule on top to
 * override any of these. That is how journey (h) injects a failure and how
 * Phase 7 will add its per-error-class variants.
 */

/** Phrase from `server/services/create-book.ts`'s system prompt. */
const TOC_SYSTEM_PHRASE = 'creating a table of contents for a personalized learning book'

/** Phrase shared by `server/services/start-book.ts` and `server/services/generate-next-chapter.ts`. */
const CHAPTER_SYSTEM_PHRASE = 'writing a chapter for a personalized learning book'

/** Phrase from `server/services/start-book.ts`'s skill classification prompt. */
const SKILLS_PROMPT_PHRASE = 'classifying the learning content of a book'

/** Phrase from `server/services/generate-quiz.ts`'s prompt. */
const QUIZ_PROMPT_PHRASE = 'multiple-choice quiz questions to test comprehension'

/** Phrase from `server/services/revise-toc.ts`'s system prompt. */
const REVISE_SYSTEM_PHRASE = 'revising an existing table of contents'

/**
 * Which chapter a chapter-stream request is for.
 *
 * Both chapter services write `This is Chapter N of M.` into the prompt, and
 * that number is the only thing distinguishing the two streams, so it is read
 * back out rather than tracked as call-order state.
 */
export function chapterNumberFrom(prompt: string | undefined): number {
  const match = (prompt ?? '').match(/This is Chapter (\d+) of/)
  return match ? Number(match[1]) : 1
}

/** Matches any chapter-generation stream, chapter 1 or chapter N. */
export const isChapterStream = systemIncludes(CHAPTER_SYSTEM_PHRASE)

/** Matches the chapter-generation stream for one specific chapter. */
export const isChapterStreamFor = (num: number) => (req: { system?: string; prompt?: string }): boolean =>
  isChapterStream(req) && chapterNumberFrom(req.prompt) === num

/** Matches the table-of-contents stream that `POST /api/books` opens. */
export const isTocStream = systemIncludes(TOC_SYSTEM_PHRASE)

/** Installs the default rule set. Journeys may add rules on top to shadow any of these. */
export function applyDefaultScript(model: ScriptedTextGeneration): void {
  // Registered oldest first so the resulting precedence reads top to bottom
  // in this function, since each call unshifts onto the front of the list.
  model.onStreamText({
    name: 'chapter stream (start-book and generate-next-chapter)',
    match: isChapterStream,
    respond: req => ({ chunks: chapterStreamChunks(chapterNumberFrom(req.prompt)) }),
  })

  model.onStreamText({
    name: 'table of contents revision (revise-toc)',
    match: systemIncludes(REVISE_SYSTEM_PHRASE),
    respond: { chunks: TOC_STREAM_CHUNKS },
  })

  model.onStreamText({
    name: 'table of contents (create-book)',
    match: isTocStream,
    respond: { chunks: TOC_STREAM_CHUNKS },
  })

  model.onGenerateObject({
    name: 'quiz (generate-quiz)',
    match: promptIncludes(QUIZ_PROMPT_PHRASE),
    respond: { value: QUIZ_FIXTURE },
  })

  model.onGenerateObject({
    name: 'skill classification (start-book)',
    match: promptIncludes(SKILLS_PROMPT_PHRASE),
    respond: { value: SKILL_CLASSIFICATION },
  })
}
