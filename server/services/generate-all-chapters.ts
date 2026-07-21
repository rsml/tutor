import type { GenerationJobParams } from '@shared/domain.js'
import type { ProviderId } from '@shared/provider.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { JobJournal } from '../ports/job-journal.js'
import type { ChapterGenerationStream } from './chapter-generation-stream.js'
import type { GenerateNextChapter, GenerateNextChapterOptions } from './generate-next-chapter.js'

/**
 * Generates every remaining chapter of a book as one background task,
 * reusing the same GenerateNextChapter core the single-chapter SSE flow
 * uses, one chapter at a time, fire-and-forget behind the returned task id.
 *
 * Waits for any single-chapter generation already active for this book
 * (started through the SSE hub) to clear before generating each chapter,
 * so the two flows never write the same chapter concurrently. Checking
 * again after a fixed delay, rather than subscribing to the hub, mirrors
 * how server/services/generation-manager.ts polled before this refactor.
 */
export function createGenerateAllChapters(deps: {
  backgroundTasks: BackgroundTasks
  chapterStream: ChapterGenerationStream
  generateNextChapter: GenerateNextChapter
  /**
   * Optional so every existing caller and test that builds this without a
   * journal keeps compiling unchanged. When present, each completed
   * chapter's number is checkpointed against the tray task's id, purely as
   * a progress label a UI could show if this job survives to the next
   * boot. resume-interrupted-jobs.ts never reads this checkpoint to decide
   * what to redo, it always recomputes the real start point from
   * meta.generatedUpTo instead, see that module's own doc for why.
   */
  journal?: JobJournal
}) {
  return function generateAllChapters(
    bookId: string,
    meta: { title: string; generatedUpTo: number; totalChapters: number },
    options: GenerateNextChapterOptions,
  ): { taskId: string } {
    const startFrom = meta.generatedUpTo + 1
    const total = meta.totalChapters
    // Carried through to the journal so an interrupted run can be resumed
    // with the same request parameters. See GenerationJobParamsSchema for
    // why an API key can never be among these.
    const params: GenerationJobParams = {
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.provider !== undefined ? { provider: options.provider as ProviderId } : {}),
      ...(options.quizModel !== undefined ? { quizModel: options.quizModel } : {}),
      ...(options.quizProvider !== undefined ? { quizProvider: options.quizProvider as ProviderId } : {}),
      ...(options.quizLength !== undefined ? { quizLength: options.quizLength } : {}),
    }
    const task = deps.backgroundTasks.start({ type: 'generate-all', bookId, bookTitle: meta.title, total, params })

    // Fire-and-forget
    ;(async () => {
      try {
        for (let num = startFrom; num <= total; num++) {
          // Check cancellation
          if (task.signal.aborted) return

          // Wait if single-chapter generation is active
          while (deps.chapterStream.isGenerating(bookId)) {
            await new Promise(r => setTimeout(r, 1000))
            if (task.signal.aborted) return
          }

          deps.backgroundTasks.report(task.id, num, `Generating chapter ${num} of ${total}`)

          await deps.generateNextChapter(bookId, num, options, undefined, task.signal)
          deps.journal?.checkpoint(task.id, { kind: 'chapters', through: num })
        }
        deps.backgroundTasks.succeed(task.id)
      } catch (err) {
        if (task.signal.aborted) return
        deps.backgroundTasks.fail(task.id, err instanceof Error ? err.message : 'Generation failed')
      }
    })()

    return { taskId: task.id }
  }
}
