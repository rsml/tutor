import type { BookRepository } from '../ports/book-repository.js'
import type { SkillProgress } from '@shared/responses.js'

export interface GetSkillProgressDeps {
  books: BookRepository
}

/**
 * GET /api/progress/skills — skill mastery rolled up across every book.
 * A pure forward to the port, kept so every route goes through a service
 * and the route-service-port layering stays uniform across the server.
 */
export function createGetSkillProgress({ books }: GetSkillProgressDeps) {
  return async function getSkillProgress(): Promise<SkillProgress> {
    return books.getSkillProgress()
  }
}
