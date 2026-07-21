import type { BookMeta } from '@shared/domain.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore, CrashRecoveryReport } from '../ports/artifact-store.js'
import { cleanTmpArtifacts } from '../adapters/fs-book-repository.js'

/**
 * Runs once at startup (see startServer in server/index.ts). Composes
 * ArtifactStore's own artifact-only crash recovery with the book status
 * reconciliation that needs BookRepository, exactly as
 * server/services/book-store.ts's recoverFromCrash did before the ports
 * migration split those two concerns behind separate interfaces.
 *
 * ArtifactStore.recoverFromCrash() only ever reports artifactsRemoved,
 * because it cannot see or change a book's status, which is BookRepository
 * data (see that port's own doc for why). This function is the composition
 * that reconciles status on top of that report: it runs the artifact-only
 * recovery, sweeps each book's own leftover BookRepository .tmp files, then
 * walks every book through BookRepository to reconcile status and
 * audioGeneratedChapters.
 */

export interface RecoverFromCrashDeps {
  bookRepository: BookRepository
  artifactStore: ArtifactStore
  /**
   * Root data directory. Needed only to sweep BookRepository's own stray
   * .tmp files (chapters, meta.yml, toc.yml, progress.yml, final-quiz.yml)
   * left by an interrupted write, via fs-book-repository.ts's
   * cleanTmpArtifacts. That sweep is fs-adapter-specific — it has no
   * equivalent on the BookRepository port, because a non-filesystem adapter
   * would have no tmp files to clean — so this is the one piece of this
   * composition that cannot be reached through either port alone.
   */
  dataDir: string
}

export function createRecoverFromCrash(deps: RecoverFromCrashDeps) {
  const { bookRepository, artifactStore, dataDir } = deps

  return async function recoverFromCrash(): Promise<CrashRecoveryReport> {
    const report = await artifactStore.recoverFromCrash()
    const books = await bookRepository.listBooks()

    for (const book of books) {
      const tmpRemoved = await cleanTmpArtifacts(dataDir, book.id)
      report.artifactsRemoved.push(...tmpRemoved)
    }

    for (const book of books) {
      const audioWiped = report.artifactsRemoved.includes(artifactStore.audioDir(book.id))

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
          await bookRepository.getToc(book.id)
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
        await bookRepository.saveBook(updated)
        if (newStatus !== originalStatus) {
          report.booksReset.push({ id: book.id, title: book.title, from: originalStatus, to: newStatus, reason })
          console.warn(`[startup] Recovered "${book.title}" (${book.id}): ${originalStatus} -> ${newStatus} (${reason})`)
        }
      }
    }

    return report
  }
}
