import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { BookMeta } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createSuggestCoverPrompt } from './suggest-cover-prompt.js'

const BASE_META: BookMeta = {
  id: 'book-1',
  title: 'Test Book',
  prompt: 'Learn about tide pools',
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
    textGeneration: createFakeTextGeneration(),
  }
}

describe('createSuggestCoverPrompt', () => {
  it('asks TextGeneration for a prompt built from the book\'s own prompt, and returns it verbatim', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    deps.textGeneration.scriptGenerateObject({ prompt: 'a minimal tide pool illustration' })
    const suggestCoverPrompt = createSuggestCoverPrompt(deps)

    const result = await suggestCoverPrompt({ bookId: BASE_META.id, provider: 'openai', model: 'fake-model' })

    expect(result).toEqual({ prompt: 'a minimal tide pool illustration' })
    expect(deps.textGeneration.requests.generateObject).toHaveLength(1)
    const req = deps.textGeneration.requests.generateObject[0]
    expect(req.model).toEqual({ provider: 'openai', model: 'fake-model' })
    expect(req.prompt).toContain('Learn about tide pools')
    expect(req.schema.safeParse({ prompt: 'x' }).success).toBe(true)
    expect(req.schema.safeParse({ prompt: 123 }).success).toBe(false)
  })

  it('defaults to the anthropic provider when none is given', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    deps.textGeneration.scriptGenerateObject({ prompt: 'anything' })
    const suggestCoverPrompt = createSuggestCoverPrompt(deps)

    await suggestCoverPrompt({ bookId: BASE_META.id, model: 'fake-model' })

    expect(deps.textGeneration.requests.generateObject[0].model.provider).toBe('anthropic')
  })

  it('propagates a schema violation from a malformed model response', async () => {
    const deps = makeDeps()
    await deps.bookRepository.saveBook(BASE_META)
    deps.textGeneration.scriptGenerateObject({ notAPrompt: true })
    const suggestCoverPrompt = createSuggestCoverPrompt(deps)

    await expect(
      suggestCoverPrompt({ bookId: BASE_META.id, provider: 'openai', model: 'fake-model' }),
    ).rejects.toThrow(z.ZodError)
  })
})
