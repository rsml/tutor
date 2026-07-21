import { randomUUID } from 'node:crypto'
import type { BookRepository } from '../../ports/book-repository.js'
import type { Clock } from '../../ports/clock.js'

export interface CreateSkeletonBody {
  title: string
  prompt: string
  totalChapters: number
  subtitle?: string
}

export interface CreateSkeletonDeps {
  books: BookRepository
  clock: Clock
}

/**
 * POST /api/books/create-skeleton — the MCP authoring surface's entry
 * point for creating a book directly, bypassing the AI TOC generation
 * flow. The id keeps its 12-character slice of a UUID rather than using
 * clock.newId(), which hands back a full, unsliced id.
 */
export function createCreateSkeleton({ books, clock }: CreateSkeletonDeps) {
  return async function createSkeleton(body: CreateSkeletonBody): Promise<{ bookId: string; title: string }> {
    const bookId = randomUUID().slice(0, 12)
    const now = clock.nowIso()
    await books.saveBook({
      id: bookId,
      title: body.title,
      subtitle: body.subtitle,
      prompt: body.prompt,
      status: 'generating',
      totalChapters: body.totalChapters,
      generatedUpTo: 0,
      createdAt: now,
      updatedAt: now,
      tags: [],
      audioGeneratedChapters: [],
    })
    return { bookId, title: body.title }
  }
}
