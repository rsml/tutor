import type { ProviderId } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { ImageGeneration } from '../ports/image-generation.js'

/**
 * Generates a book's cover via AI, extracted from the POST
 * /api/books/:id/cover/generate route handler. Real work: kick off the
 * background task, generate the image through ImageGeneration, and save it
 * through ArtifactStore, unless a newer cover was set (by the user, or a
 * different generation) after this one started.
 */

export interface GenerateCoverDeps {
  bookRepository: Pick<BookRepository, 'getBook'>
  artifactStore: Pick<ArtifactStore, 'getCoverMtime' | 'saveCover'>
  backgroundTasks: BackgroundTasks
  imageGeneration: ImageGeneration
}

export interface GenerateCoverRequest {
  prompt: string
  provider: ProviderId
  model: string
}

export type GenerateCoverResult =
  | { outcome: 'in-progress' }
  | { outcome: 'started'; taskId: string }

export function createGenerateCover(deps: GenerateCoverDeps) {
  const { bookRepository, artifactStore, backgroundTasks, imageGeneration } = deps

  return async function generateCover(bookId: string, req: GenerateCoverRequest): Promise<GenerateCoverResult> {
    const meta = await bookRepository.getBook(bookId)

    if (backgroundTasks.findActive(bookId, 'generate-cover')) {
      return { outcome: 'in-progress' }
    }

    // Captured before the task starts so the race guard below can tell a
    // cover set (by the user, or a separate generation) after this one
    // began apart from one that predates it. BackgroundTasks.start's
    // TaskHandle carries no timestamp of its own (see that port's doc), so
    // this service captures its own.
    const startedAt = new Date()
    const handle = backgroundTasks.start({ type: 'generate-cover', bookId, bookTitle: meta.title, total: 1 })

    ;(async () => {
      try {
        const image = await imageGeneration.generate({
          provider: req.provider,
          preferredModel: req.model,
          prompt: req.prompt,
          signal: handle.signal,
        })

        // Safety guard: don't overwrite a cover that was set after this task started.
        const existingMtime = await artifactStore.getCoverMtime(bookId)
        if (existingMtime && existingMtime > startedAt) {
          backgroundTasks.succeed(handle.id, { skipped: true })
          return
        }

        await artifactStore.saveCover(bookId, image.data, image.mediaType)
        backgroundTasks.succeed(handle.id)
      } catch (err) {
        if (handle.signal.aborted) return // already cancelled
        backgroundTasks.fail(handle.id, err instanceof Error ? err.message : 'Cover generation failed')
      }
    })()

    return { outcome: 'started', taskId: handle.id }
  }
}
