import { join } from 'node:path'
import { getDataDir } from '@shared/node/data-dir.js'
import { createFsBookRepository, cleanTmpArtifacts } from '../adapters/fs-book-repository.js'
import { createFsArtifactStore } from '../adapters/fs-artifact-store.js'
import type {
  BookMeta,
  Toc,
  Progress,
  ChapterProgress,
  Feedback,
  Quiz,
  LearningProfile,
  ChapterSummary,
  ReferenceManifest,
  AudiobookManifest,
} from '@shared/domain.js'
import type { SkillProgress } from '@shared/responses.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore, CrashRecoveryReport } from '../ports/artifact-store.js'

/**
 * Temporary compatibility shim over the two real adapters that replaced
 * this file's original, monolithic filesystem implementation:
 * fs-book-repository.ts (YAML metadata and Markdown chapters, behind the
 * BookRepository port) and fs-artifact-store.ts (covers, EPUB exports, and
 * audiobook audio, behind the ArtifactStore port).
 *
 * It exists so the move from a singleton module to two factory-built
 * adapters could land in one atomic step, rather than leaving every
 * caller, meaning every route file, epub-importer.ts, audiobook-
 * generator.ts, generation-manager.ts, and mcp-server.ts, half converted
 * while each migrated on its own schedule. Every function below re-exports
 * the exact name and signature this module has always exported, and
 * simply delegates to whichever adapter owns that piece of behaviour.
 *
 * Every caller will move onto BookRepository and ArtifactStore directly in
 * a later stage. Until then, treat this file as a bridge, not a place to
 * add new behaviour.
 *
 * Both adapters are rebuilt on every call, each resolving getDataDir()
 * fresh rather than once at module load. This preserves the original
 * module's lazy timing, which existing tests depend on: audiobook-
 * generator.test.ts and book-store.test.ts both change the effective data
 * directory between tests within a single file (through a mock or a real
 * env var) and expect the very next call into this module to see the new
 * value, not whatever was current the first time the module was imported.
 */

function bookRepository(): BookRepository {
  return createFsBookRepository({ dataDir: getDataDir() })
}

function artifactStore(): ArtifactStore {
  return createFsArtifactStore({ dataDir: getDataDir() })
}

export type { CrashRecoveryReport } from '../ports/artifact-store.js'
export type { SkillProgress as SkillProgressResult } from '@shared/responses.js'

// --- Learning Profile ---

export async function getProfile(): Promise<LearningProfile> {
  return bookRepository().getProfile()
}

export async function saveProfile(profile: LearningProfile): Promise<void> {
  return bookRepository().saveProfile(profile)
}

export async function getProfileUpdatedAt(): Promise<string | null> {
  return bookRepository().getProfileUpdatedAt()
}

// --- Book CRUD ---

export async function listBooks(): Promise<BookMeta[]> {
  return bookRepository().listBooks()
}

export async function getBook(bookId: string): Promise<BookMeta> {
  return bookRepository().getBook(bookId)
}

export async function saveBook(meta: BookMeta): Promise<void> {
  return bookRepository().saveBook(meta)
}

export async function deleteBook(bookId: string): Promise<void> {
  return bookRepository().deleteBook(bookId)
}

// --- Reset ---

export async function resetBook(bookId: string): Promise<void> {
  return bookRepository().resetBook(bookId)
}

// --- Table of Contents ---

export async function getToc(bookId: string): Promise<Toc> {
  return bookRepository().getToc(bookId)
}

export async function saveToc(bookId: string, toc: Toc): Promise<void> {
  return bookRepository().saveToc(bookId, toc)
}

// --- Chapters ---

export async function getChapter(bookId: string, chapterNum: number): Promise<string> {
  return bookRepository().getChapter(bookId, chapterNum)
}

export async function saveChapter(bookId: string, chapterNum: number, content: string): Promise<void> {
  return bookRepository().saveChapter(bookId, chapterNum, content)
}

export async function chapterExists(bookId: string, chapterNum: number): Promise<boolean> {
  return bookRepository().chapterExists(bookId, chapterNum)
}

// --- Quiz ---

export async function getQuiz(bookId: string, chapterNum: number): Promise<Quiz> {
  return bookRepository().getQuiz(bookId, chapterNum)
}

export async function saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
  return bookRepository().saveQuiz(bookId, chapterNum, quiz)
}

export async function quizExists(bookId: string, chapterNum: number): Promise<boolean> {
  return bookRepository().quizExists(bookId, chapterNum)
}

// --- Final Quiz ---

export async function getFinalQuiz(bookId: string): Promise<Quiz> {
  return bookRepository().getFinalQuiz(bookId)
}

export async function saveFinalQuiz(bookId: string, quiz: Quiz): Promise<void> {
  return bookRepository().saveFinalQuiz(bookId, quiz)
}

export function finalQuizExists(bookId: string): boolean {
  return bookRepository().finalQuizExists(bookId)
}

// --- Progress ---

export async function getProgress(bookId: string): Promise<Progress> {
  return bookRepository().getProgress(bookId)
}

export async function saveChapterProgress(
  bookId: string,
  chapterNum: number,
  progress: ChapterProgress,
): Promise<void> {
  return bookRepository().saveChapterProgress(bookId, chapterNum, progress)
}

export async function getChaptersRead(bookId: string): Promise<number> {
  return bookRepository().getChaptersRead(bookId)
}

// --- Feedback ---

export async function getFeedback(bookId: string, chapterNum: number): Promise<Feedback> {
  return bookRepository().getFeedback(bookId, chapterNum)
}

export async function saveFeedback(bookId: string, chapterNum: number, feedback: Feedback): Promise<void> {
  return bookRepository().saveFeedback(bookId, chapterNum, feedback)
}

export async function getAllFeedback(bookId: string): Promise<Feedback[]> {
  return bookRepository().getAllFeedback(bookId)
}

// --- Skill progress ---

export async function getSkillProgress(): Promise<SkillProgress> {
  return bookRepository().getSkillProgress()
}

// --- Cover ---

export async function getCoverPath(bookId: string): Promise<string | null> {
  return artifactStore().getCoverPath(bookId)
}

export async function hasCover(bookId: string): Promise<boolean> {
  return artifactStore().hasCover(bookId)
}

export async function getCoverMtime(bookId: string): Promise<Date | null> {
  return artifactStore().getCoverMtime(bookId)
}

export async function saveCover(bookId: string, data: Buffer, mediaType: string): Promise<void> {
  return artifactStore().saveCover(bookId, data, mediaType)
}

export async function deleteCover(bookId: string): Promise<void> {
  return artifactStore().deleteCover(bookId)
}

// --- EPUB cache ---

export function epubPath(bookId: string): string {
  return artifactStore().epubPath(bookId)
}

export function epubExists(bookId: string): boolean {
  return artifactStore().epubExists(bookId)
}

// --- Audiobook ---

export function audioDir(bookId: string): string {
  return artifactStore().audioDir(bookId)
}

export function audiobookPath(bookId: string): string {
  return artifactStore().audiobookPath(bookId)
}

/**
 * Not part of the ArtifactStore port, only audioDir() and the manifest
 * read/write methods are. Derived here from audioDir() so the one external
 * caller that reaches for the manifest's path directly today,
 * audiobook-generator.test.ts, keeps working unchanged.
 */
export function audiobookManifestPath(bookId: string): string {
  return join(artifactStore().audioDir(bookId), 'manifest.yml')
}

export function chapterAudioPath(bookId: string, chapterNum: number): string {
  return artifactStore().chapterAudioPath(bookId, chapterNum)
}

export function chapterWavPath(bookId: string, chapterNum: number): string {
  return artifactStore().chapterWavPath(bookId, chapterNum)
}

export function audiobookExists(bookId: string): boolean {
  return artifactStore().audiobookExists(bookId)
}

export async function chapterAudioExists(bookId: string, chapterNum: number): Promise<boolean> {
  return artifactStore().chapterAudioExists(bookId, chapterNum)
}

export async function getAudiobookManifest(bookId: string): Promise<AudiobookManifest | null> {
  return artifactStore().getAudiobookManifest(bookId)
}

export async function saveAudiobookManifest(bookId: string, manifest: AudiobookManifest): Promise<void> {
  return artifactStore().saveAudiobookManifest(bookId, manifest)
}

export async function deleteAudiobookArtifacts(bookId: string): Promise<void> {
  return artifactStore().deleteAudiobookArtifacts(bookId)
}

// --- Brief ---

export async function saveBrief(bookId: string, content: string): Promise<void> {
  return bookRepository().saveBrief(bookId, content)
}

export async function getBrief(bookId: string): Promise<string> {
  return bookRepository().getBrief(bookId)
}

// --- Summaries ---

export async function saveSummary(bookId: string, chapterNum: number, summary: ChapterSummary): Promise<void> {
  return bookRepository().saveSummary(bookId, chapterNum, summary)
}

export async function getSummary(bookId: string, chapterNum: number): Promise<ChapterSummary> {
  return bookRepository().getSummary(bookId, chapterNum)
}

export async function getAllSummaries(bookId: string): Promise<ChapterSummary[]> {
  return bookRepository().getAllSummaries(bookId)
}

// --- References ---

export async function saveReference(bookId: string, name: string, content: string): Promise<void> {
  return bookRepository().saveReference(bookId, name, content)
}

export async function getReference(bookId: string, name: string): Promise<string> {
  return bookRepository().getReference(bookId, name)
}

export async function listReferences(bookId: string): Promise<ReferenceManifest> {
  return bookRepository().listReferences(bookId)
}

// --- Crash recovery ---

/**
 * The one export that cannot be a single delegating line. ArtifactStore's
 * own recoverFromCrash() (see its port doc comment) only ever reports
 * artifactsRemoved, because reconciling a book's status after a crash
 * needs to read and write BookRepository data that ArtifactStore cannot
 * see. This function is that composition: it runs the artifact-only
 * recovery, sweeps this repository's own leftover .tmp files book by
 * book, then walks every book through BookRepository to reconcile status
 * and audioGeneratedChapters, exactly as this module has always done in
 * one combined pass.
 */
export async function recoverFromCrash(): Promise<CrashRecoveryReport> {
  const dataDir = getDataDir()
  const repo = createFsBookRepository({ dataDir })
  const artifacts = createFsArtifactStore({ dataDir })

  const report = await artifacts.recoverFromCrash()
  const books = await repo.listBooks()

  for (const book of books) {
    const tmpRemoved = await cleanTmpArtifacts(dataDir, book.id)
    report.artifactsRemoved.push(...tmpRemoved)
  }

  for (const book of books) {
    const audioWiped = report.artifactsRemoved.includes(artifacts.audioDir(book.id))

    const originalStatus = book.status
    let newStatus = originalStatus
    let reason = ''

    if (originalStatus === 'generating_toc') {
      // A file that exists but fails to parse or validate still counts as
      // "the TOC was written", matching the original's plain existsSync
      // check on toc.yml; only a genuinely missing file (ENOENT) means the
      // stream never got that far.
      let tocExists = true
      try {
        await repo.getToc(book.id)
      } catch (err) {
        tocExists = (err as { code?: string })?.code !== 'ENOENT'
      }
      if (tocExists) {
        newStatus = 'toc_review'
        reason = 'TOC was written before crash; user can approve/edit/regen'
      } else {
        newStatus = 'failed'
        reason = 'TOC stream was interrupted before toc.yml landed; nothing to recover'
      }
    } else if (originalStatus === 'generating') {
      newStatus = book.generatedUpTo > 0 ? 'reading' : 'toc_review'
      reason = book.generatedUpTo > 0
        ? `${book.generatedUpTo} chapter(s) saved; user can read and retry next`
        : 'No chapters saved yet; back to TOC review'
    }

    if (newStatus !== originalStatus || audioWiped) {
      const updated: BookMeta = { ...book }
      if (newStatus !== originalStatus) updated.status = newStatus
      if (audioWiped) updated.audioGeneratedChapters = []
      updated.updatedAt = new Date().toISOString()
      await repo.saveBook(updated)
      if (newStatus !== originalStatus) {
        report.booksReset.push({ id: book.id, title: book.title, from: originalStatus, to: newStatus, reason })
        console.warn(`[startup] Recovered "${book.title}" (${book.id}): ${originalStatus} -> ${newStatus} (${reason})`)
      }
    }
  }

  return report
}

/**
 * Backward-compatible alias kept for any external callers (e.g., tests
 * referencing the old name). New code should call recoverFromCrash().
 */
export async function recoverStuckBooks(): Promise<void> {
  await recoverFromCrash()
}
