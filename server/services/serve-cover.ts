import { readFile } from 'node:fs/promises'
import type { ArtifactStore } from '../ports/artifact-store.js'

/**
 * Reads a book's cover image for the GET /api/books/:id/cover route.
 * Extracted so node:fs stays out of the route file; ArtifactStore's cover
 * methods are path-returning, not byte-returning (see that port's own doc),
 * so a real read still has to happen somewhere, and a service is where.
 */

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
}

export interface CoverFile {
  data: Buffer
  contentType: string
}

/** Resolves to null when the book has no cover, for the route to answer 404. */
export async function getCoverFile(
  bookId: string,
  artifactStore: Pick<ArtifactStore, 'getCoverPath'>,
): Promise<CoverFile | null> {
  const coverPath = await artifactStore.getCoverPath(bookId)
  if (!coverPath) return null

  const ext = '.' + coverPath.split('.').pop()
  const contentType = MIME_MAP[ext] ?? 'image/png'
  const data = await readFile(coverPath)
  return { data, contentType }
}
