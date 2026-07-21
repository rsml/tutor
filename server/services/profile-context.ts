import type { BookRepository } from '../ports/book-repository.js'
import { describeLearningProfile } from '../domain/profile-context.js'

/**
 * Reads the global learning profile and formats it for a generation prompt.
 * Swallows any failure to read one, including "no profile saved yet" (the
 * common case for a book generated before a profile was ever filled in),
 * into an empty string, so a generation prompt simply omits the "Reader
 * profile:" section instead of failing outright.
 */
export async function getProfileContext(books: BookRepository): Promise<string> {
  try {
    const profile = await books.getProfile()
    return describeLearningProfile(profile)
  } catch {
    return ''
  }
}
