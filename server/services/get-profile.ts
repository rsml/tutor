import type { ProfileResponse } from '@shared/responses.js'
import type { BookRepository } from '../ports/book-repository.js'

/**
 * GET /api/profile's shape. Joins the stored identity and style fields into
 * one aboutMe string, and defaults skills to an empty array for profiles
 * saved before that field existed. Rejects with NotFoundError when no
 * profile has been saved yet, exactly as BookRepository.getProfile() does,
 * so the route's existing 404 mapping keeps working unchanged.
 */

export interface GetProfileDeps {
  bookRepository: BookRepository
}

export async function getProfile(deps: GetProfileDeps): Promise<ProfileResponse> {
  const profile = await deps.bookRepository.getProfile()
  const aboutMe = [profile.identity, profile.style].filter(Boolean).join('\n\n')
  return { aboutMe, preferences: profile.preferences, skills: profile.skills ?? [] }
}
