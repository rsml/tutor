import { existsSync } from 'node:fs'
import type { ArtifactStore } from '../ports/artifact-store.js'

/**
 * Decides which file backs a chapter's audio playback: a legacy per-chapter
 * MP3 if one was actually written to disk (audiobooks generated before the
 * unified M4B switch), or the book's single M4B otherwise (new audiobooks
 * seek to the chapter's start client-side; nothing per-chapter is ever
 * written for them, see server/services/generate-audiobook.ts's narration
 * loop).
 *
 * Deliberately not ArtifactStore.chapterAudioExists, which answers a
 * different question (see that method's own doc): true once the manifest
 * lists the chapter, regardless of whether a legacy per-chapter file also
 * exists. Using it here would wrongly select the legacy branch for a
 * chapter that is merely listed in the manifest, which every chapter of a
 * new-style audiobook is, even though no physical per-chapter file was ever
 * written for it. This function's existsSync check is a real, current-file
 * test, not a manifest lookup, which is why it lives in a service rather
 * than a route: node:fs must not appear in route files (see this port's own
 * doc for why path-returning methods exist), but the streaming route itself
 * still calls send-media-range.ts directly, exactly as before.
 */

export interface ChapterAudioFile {
  path: string
  contentType: 'audio/mpeg' | 'audio/mp4'
}

export function resolveChapterAudioFile(
  bookId: string,
  chapterNum: number,
  artifactStore: Pick<ArtifactStore, 'chapterAudioPath' | 'audiobookPath'>,
): ChapterAudioFile {
  const legacyMp3 = artifactStore.chapterAudioPath(bookId, chapterNum)
  if (existsSync(legacyMp3)) {
    return { path: legacyMp3, contentType: 'audio/mpeg' }
  }
  return { path: artifactStore.audiobookPath(bookId), contentType: 'audio/mp4' }
}
