import { useEffect, useState } from 'react'
import { toast } from '@client/lib/toast'
import { useAppSelector, selectRunningTasks } from '@client/store'
import { useBackgroundTasks } from '@client/features/library/hooks/useBackgroundTasks'
import {
  downloadEpub,
  getBookAudiobook,
  getEngineStatus,
  installEngine,
  revealAudiobook,
} from '@client/api'
import { AUDIOBOOK_READY_TOAST_MS, CLIPBOARD_FALLBACK_TOAST_MS } from '@client/lib/constants'
import { isGenerating, isGeneratingToc } from '@shared/book-status'
import type { LibraryBook } from '@shared/responses'

// Friendly verbs for the quit-confirmation dialog. Keep aligned with the
// labels used in BackgroundTasksFooter so users see the same wording.
function taskBusyLabel(type: string): string {
  switch (type) {
    case 'generate-all': return 'Generating chapters'
    case 'generate-epub': return 'Exporting EPUB'
    case 'generate-cover': return 'Generating cover'
    case 'install-audiobook': return 'Setting up narration'
    case 'generate-audiobook': return 'Generating audiobook'
    default: return type
  }
}

interface UseBackgroundTaskEffectsOptions {
  books: LibraryBook[]
  fetchBooks: () => Promise<void>
}

/**
 * Wires the background task stream to the library's audiobook and EPUB
 * side effects, and to the Electron quit-confirmation prompt.
 *
 * This must be called from a component that never unmounts. A narrator
 * install or an EPUB export can finish minutes after it starts, often while
 * the user has moved on to reading or creating a different book — if this
 * hook's subscription lived inside LibraryPage instead, unmounting the
 * library mid-install would silently drop that completion event, and the
 * voice modal or the auto-download it's supposed to trigger, forever. The
 * task stream is a live push and never replays what it already sent.
 */
export function useBackgroundTaskEffects({ books, fetchBooks }: UseBackgroundTaskEffectsOptions) {
  const [audiobookExists, setAudiobookExists] = useState<Map<string, boolean>>(new Map())
  const [audiobookDownloadModal, setAudiobookDownloadModal] = useState<{ missingBytes: number; missing: { model: boolean; ffmpeg: boolean } } | null>(null)
  const [audiobookVoiceModal, setAudiobookVoiceModal] = useState<{ book: LibraryBook; mode: 'firstTime' | 'normal' | 'regenerate' } | null>(null)
  const [regenerateAudiobookConfirm, setRegenerateAudiobookConfirm] = useState<{ book: LibraryBook } | null>(null)
  // An intent that deliberately outlives its closed dialog: an install can
  // finish minutes later and should still open the voice modal for the book
  // that requested it, so this never gets folded into the dialog state itself.
  const [pendingAudiobookForBookId, setPendingAudiobookForBookId] = useState<string | null>(null)

  const downloadEpubFile = async (book: LibraryBook) => {
    try {
      const blob = await downloadEpub(book.id)
      const filename = `${book.title.replace(/[^a-zA-Z0-9 ]/g, '')}.epub`

      if (window.electronAPI?.saveFile) {
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
        await window.electronAPI.saveFile(filename, base64)
      } else {
        // Web fallback
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error('Failed to download EPUB')
    }
  }

  const handleEpubExported = (bookId: string, bookTitle: string) => {
    downloadEpubFile({ id: bookId, title: bookTitle } as LibraryBook)
  }

  const checkAudiobookExists = async (bookId: string) => {
    if (audiobookExists.has(bookId)) return
    try {
      const data = await getBookAudiobook(bookId)
      setAudiobookExists(prev => new Map(prev).set(bookId, data.exists))
      // Keep the card's hasAudiobook indicator in sync. If the server says
      // "exists" but our cached book row says otherwise (e.g., the audiobook
      // was generated outside this React session), refetch the books list.
      const book = books.find(b => b.id === bookId)
      if (book && !!book.hasAudiobook !== data.exists) {
        void fetchBooks()
      }
    } catch { /* swallow */ }
  }

  const handleGenerateAudiobook = async (book: LibraryBook) => {
    try {
      const status = await getEngineStatus()
      if (status.installed) {
        setAudiobookVoiceModal({ book, mode: 'normal' })
      } else {
        setPendingAudiobookForBookId(book.id)
        setAudiobookDownloadModal({ missingBytes: status.downloadSize, missing: status.missing })
      }
    } catch (err) {
      toast.error('Failed to check audiobook engine: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleConfirmDownload = async () => {
    try {
      await installEngine()
      toast.success("Setting up narration… we'll let you know when it's ready.")
      setAudiobookDownloadModal(null)
    } catch (err) {
      toast.error('Failed to start install: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleShowAudiobook = async (book: LibraryBook) => {
    try {
      const { path, revealed } = await revealAudiobook(book.id)
      // Server-side reveal (open -R / explorer /select) is the primary path
      // — works regardless of whether the renderer has Electron IPC wired.
      if (revealed) return
      // Backup: Electron IPC if we happen to be in the desktop app.
      if (window.electronAPI?.showInFinder) {
        const ok = await window.electronAPI.showInFinder(path)
        if (ok) return
      }
      // Last resort: copy path so the user can paste into Finder's Go-to.
      try {
        await navigator.clipboard.writeText(path)
        toast.success('Audiobook path copied to clipboard', {
          description: 'Open Finder → Go → Go to Folder (⌘⇧G), then paste.',
          duration: CLIPBOARD_FALLBACK_TOAST_MS,
        })
      } catch {
        toast.success(`Audiobook saved to: ${path}`, { duration: AUDIOBOOK_READY_TOAST_MS })
      }
    } catch (err) {
      toast.error('Failed to reveal audiobook: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleConfirmRegenerateAudiobook = () => {
    if (!regenerateAudiobookConfirm) return
    const book = regenerateAudiobookConfirm.book
    setRegenerateAudiobookConfirm(null)
    setAudiobookVoiceModal({ book, mode: 'regenerate' })
  }

  useBackgroundTasks({
    onCoverGenerated: fetchBooks,
    onEpubExported: handleEpubExported,
    onGenerateAllCompleted: fetchBooks,
    onAudiobookGenerated: (bookId, bookTitle) => {
      // Set immediately so the next menu open shows Play+Regen without
      // waiting on the /api/books refetch (which updates the card indicator).
      setAudiobookExists(prev => new Map(prev).set(bookId, true))
      void fetchBooks()
      toast.success(`Audiobook for "${bookTitle}" is ready!`, {
        duration: AUDIOBOOK_READY_TOAST_MS,
        action: {
          label: 'Show audiobook',
          onClick: () => {
            const found = books.find(b => b.id === bookId)
            if (found) void handleShowAudiobook(found)
          },
        },
      })
    },
    onAudiobookInstalled: () => {
      if (pendingAudiobookForBookId) {
        const book = books.find(b => b.id === pendingAudiobookForBookId)
        setPendingAudiobookForBookId(null)
        if (book) setAudiobookVoiceModal({ book, mode: 'firstTime' })
      }
    },
    onAudiobookTaskFailed: (taskType, bookId) => {
      // Install failure: drop the pending-book pointer so a retry doesn't
      // chain into the voice modal for a long-stale book id.
      if (taskType === 'install-audiobook' && pendingAudiobookForBookId) {
        setPendingAudiobookForBookId(null)
      }
      // Generate failure: cache "no audiobook" since the route handler wipes
      // partial artifacts. Refetch books so the card headphones-indicator
      // (driven by hasAudiobook) drops if it was set.
      if (taskType === 'generate-audiobook') {
        setAudiobookExists(prev => new Map(prev).set(bookId, false))
        void fetchBooks()
      }
    },
  })

  // Push running-task state to the Electron main process so the window close
  // handler can prompt before quitting and accidentally killing a long
  // generation. Also wires a web-side beforeunload as a backstop.
  const runningTasks = useAppSelector(selectRunningTasks)
  const streamingBookIds = books.filter(b => isGenerating(b.status)).map(b => b.id)
  useEffect(() => {
    const labels = runningTasks.map(t => `${taskBusyLabel(t.type)} — ${t.bookTitle}`)
    // Streaming TOC/chapter writes aren't task-manager tasks; surface them
    // alongside so the user sees a complete picture.
    for (const bid of streamingBookIds) {
      const book = books.find(b => b.id === bid)
      const title = book?.title ?? bid
      labels.push(isGeneratingToc(book?.status)
        ? `Generating table of contents — ${title}`
        : `Generating chapter — ${title}`,
      )
    }
    const count = labels.length
    void window.electronAPI?.setBusyState?.(count, labels)

    if (count === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [runningTasks, streamingBookIds, books])

  return {
    audiobookExists,
    downloadEpubFile,
    audiobookDownloadModal,
    setAudiobookDownloadModal,
    audiobookVoiceModal,
    setAudiobookVoiceModal,
    regenerateAudiobookConfirm,
    setRegenerateAudiobookConfirm,
    pendingAudiobookForBookId,
    setPendingAudiobookForBookId,
    checkAudiobookExists,
    handleGenerateAudiobook,
    handleConfirmDownload,
    handleShowAudiobook,
    handleConfirmRegenerateAudiobook,
  }
}
