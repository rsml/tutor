import type { BackgroundTasks } from '../ports/background-tasks.js'
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
}) {
  return function generateAllChapters(
    bookId: string,
    meta: { title: string; generatedUpTo: number; totalChapters: number },
    options: GenerateNextChapterOptions,
  ): { taskId: string } {
    const startFrom = meta.generatedUpTo + 1
    const total = meta.totalChapters
    const task = deps.backgroundTasks.start({ type: 'generate-all', bookId, bookTitle: meta.title, total })

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
