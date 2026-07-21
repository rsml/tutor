import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { getBook } from '@client/api'
import { EXTERNAL_CHAPTER_POLL_MS } from '@client/lib/constants'
import type { Phase } from '@client/features/reader/ReaderPage'

export interface UseExternalGenerationPollOptions {
  bookId: string
  totalChapters: number
  generatedUpTo: number
  phase: Phase
  setGeneratedUpTo: Dispatch<SetStateAction<number>>
}

/**
 * Polls for a chapter written by something other than this page's own
 * generation flow, meaning another open window or the MCP server acting on
 * the book directly.
 *
 * Non-obvious constraint: the poll only runs while the book still has
 * ungenerated chapters and this page isn't already streaming one itself, so
 * this path and useChapterGeneration/useGenerationResume never race to set
 * `generatedUpTo` at the same time. A failed or errored poll is silently
 * ignored — it just tries again on the next tick.
 */
export function useExternalGenerationPoll({
  bookId,
  totalChapters,
  generatedUpTo,
  phase,
  setGeneratedUpTo,
}: UseExternalGenerationPollOptions): void {
  useEffect(() => {
    if (generatedUpTo >= totalChapters) return
    if (phase === 'generating') return

    const interval = setInterval(async () => {
      try {
        const data = await getBook(bookId)
        if (data.generatedUpTo > generatedUpTo) {
          setGeneratedUpTo(data.generatedUpTo)
        }
      } catch {
        // Ignore polling errors
      }
    }, EXTERNAL_CHAPTER_POLL_MS)

    return () => clearInterval(interval)
  }, [bookId, totalChapters, generatedUpTo, phase, setGeneratedUpTo])
}
