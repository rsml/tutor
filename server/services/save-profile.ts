import type { LearningProfile } from '@shared/domain.js'
import type { BookRepository } from '../ports/book-repository.js'

/**
 * PUT /api/profile's shape. The wire body keeps identity and style merged
 * into one aboutMe field; this splits it back out, always writing an empty
 * style, which mirrors what the route has always persisted.
 */

export interface SaveProfileRequest {
  aboutMe: string
  preferences: LearningProfile['preferences']
  skills?: LearningProfile['skills']
}

export interface SaveProfileDeps {
  bookRepository: BookRepository
}

export async function saveProfile(deps: SaveProfileDeps, req: SaveProfileRequest): Promise<void> {
  await deps.bookRepository.saveProfile({
    identity: req.aboutMe,
    style: '',
    preferences: req.preferences,
    skills: req.skills ?? [],
  })
}
