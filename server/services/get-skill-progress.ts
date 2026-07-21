import type { BookRepository } from '../ports/book-repository.js'
import type { SkillProgress } from '@shared/responses.js'

export interface GetSkillProgressDeps {
  books: BookRepository
}

/** GET /api/progress/skills — skill mastery rolled up across every book. */
export function createGetSkillProgress({ books }: GetSkillProgressDeps) {
  return async function getSkillProgress(): Promise<SkillProgress> {
    return books.getSkillProgress()
  }
}
