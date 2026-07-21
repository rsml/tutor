import { useEffect, useState, useCallback } from 'react'
import { getBookAudiobook, type BookAudiobookStatus } from '@client/api'
import { AUDIOBOOK_POLL_MS } from '@client/lib/constants'
import { useAppSelector, selectRunningTasks } from '@client/store'

// Shared lookup so every chapter button doesn't fire its own HTTP call.
// Re-polls every few seconds while an audiobook task is running for this
// book so per-chapter Listen buttons light up progressively as the WAV->MP3
// conversion completes for each chapter.
export function useChapterAudio(bookId: string) {
  const [status, setStatus] = useState<BookAudiobookStatus | null>(null)
  const runningTasks = useAppSelector(selectRunningTasks)
  const audiobookRunning = runningTasks.some(
    t => t.bookId === bookId && t.type === 'generate-audiobook',
  )

  const refresh = useCallback(async () => {
    try {
      const data = await getBookAudiobook(bookId)
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [bookId])

  useEffect(() => { void refresh() }, [refresh])

  // While an audiobook task is running for this book, repoll so the
  // per-chapter Listen buttons appear as soon as each MP3 lands. We also
  // refresh once when the task transitions from running -> not-running.
  useEffect(() => {
    if (!audiobookRunning) {
      void refresh()
      return
    }
    const interval = setInterval(() => { void refresh() }, AUDIOBOOK_POLL_MS)
    return () => clearInterval(interval)
  }, [audiobookRunning, refresh])

  const hasAudio = useCallback((chapterNum: number) => {
    return status?.generatedChapters.includes(chapterNum) ?? false
  }, [status])

  return { status, hasAudio, refresh }
}
