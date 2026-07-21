import { describe, it, expect, vi } from 'vitest'
import type { BookMeta } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createFakeBackgroundTasks } from '../ports/background-tasks.fake.js'
import { createFakeImageGeneration } from '../ports/image-generation.fake.js'
import { createGenerateCover } from './generate-cover.js'

const BASE_META: BookMeta = {
  id: 'book-1',
  title: 'Test Book',
  prompt: 'Learn things',
  status: 'reading',
  totalChapters: 2,
  generatedUpTo: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

function makeDeps() {
  return {
    bookRepository: createFakeBookRepository(),
    artifactStore: createFakeArtifactStore(),
    backgroundTasks: createFakeBackgroundTasks(),
    imageGeneration: createFakeImageGeneration(),
  }
}

type Deps = ReturnType<typeof makeDeps>

async function waitUntilDone(deps: Deps, taskId: string): Promise<void> {
  await vi.waitFor(() => {
    const task = deps.backgroundTasks.get(taskId)
    if (!task || task.status === 'running') throw new Error('still running')
  })
}

describe('createGenerateCover', () => {
  it('refuses a second cover generation while one is already running', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    deps.backgroundTasks.start({ type: 'generate-cover', bookId: BASE_META.id, bookTitle: BASE_META.title, total: 1 })
    const generateCover = createGenerateCover(deps)

    const result = await generateCover(BASE_META.id, { prompt: 'a cover', provider: 'openai', model: 'fake-model' })

    expect(result).toEqual({ outcome: 'in-progress' })
  })

  it('generates and saves the cover, forwarding provider, model, and prompt to ImageGeneration', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    const generateCover = createGenerateCover(deps)

    const result = await generateCover(BASE_META.id, { prompt: 'a minimal cover', provider: 'openai', model: 'fake-model' })
    expect(result.outcome).toBe('started')
    if (result.outcome !== 'started') throw new Error('unreachable')

    await waitUntilDone(deps, result.taskId)

    expect(deps.imageGeneration.requests).toHaveLength(1)
    expect(deps.imageGeneration.requests[0]).toMatchObject({
      provider: 'openai',
      preferredModel: 'fake-model',
      prompt: 'a minimal cover',
    })
    expect(await deps.artifactStore.hasCover(BASE_META.id)).toBe(true)
    expect(deps.backgroundTasks.get(result.taskId)?.status).toBe('done')
  })

  it('skips saving and marks the task done with skipped when a newer cover was set after generation started', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    // The fake ArtifactStore's saved-cover mtimes come from an internal
    // clock fixed far in the future (see artifact-store.fake.ts), so any
    // cover saved before generateCover captures its own "started at" moment
    // is guaranteed to look newer, exactly like a user replacing the cover
    // mid-generation would.
    await deps.artifactStore.saveCover(BASE_META.id, Buffer.from('user-set-cover'), 'image/png')
    const generateCover = createGenerateCover(deps)

    const result = await generateCover(BASE_META.id, { prompt: 'a minimal cover', provider: 'openai', model: 'fake-model' })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const task = deps.backgroundTasks.get(result.taskId)
    expect(task?.status).toBe('done')
    expect(task?.result).toEqual({ skipped: true })
    // The image was still generated (for diagnostics/cost tracking) but never overwrote the newer cover.
    expect(deps.imageGeneration.requests).toHaveLength(1)
  })

  it('fails the task with the error message when image generation rejects', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    deps.imageGeneration.failNextAttempt('openai', 'fake-model', 'auth', 'bad key')
    const generateCover = createGenerateCover(deps)

    const result = await generateCover(BASE_META.id, { prompt: 'a minimal cover', provider: 'openai', model: 'fake-model' })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const task = deps.backgroundTasks.get(result.taskId)
    expect(task?.status).toBe('error')
    expect(task?.error).toBe('bad key')
  })

  it('does not fail the task when cancelled mid-flight', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)

    // The fake ImageGeneration resolves with no real delay, so generation
    // would otherwise complete before this test gets a chance to cancel it.
    // Gate it on a promise this test controls, so cancel() lands while the
    // background work is still genuinely in flight.
    let releaseGenerate!: () => void
    const gate = new Promise<void>((resolve) => { releaseGenerate = resolve })
    const realGenerate = deps.imageGeneration.generate.bind(deps.imageGeneration)
    deps.imageGeneration.generate = async (req) => {
      await gate
      return realGenerate(req)
    }

    const generateCover = createGenerateCover(deps)
    const result = await generateCover(BASE_META.id, { prompt: 'a minimal cover', provider: 'openai', model: 'fake-model' })
    if (result.outcome !== 'started') throw new Error('expected started')

    deps.backgroundTasks.cancel(result.taskId)
    releaseGenerate()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(deps.backgroundTasks.get(result.taskId)?.status).toBe('cancelled')
    expect(await deps.artifactStore.hasCover(BASE_META.id)).toBe(false)
  })
})
