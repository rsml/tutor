import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  store,
  persistor,
  useAppDispatch,
  useAppSelector,
  selectFunctionModel,
  selectLastViewedBookId,
  setLastViewedBookId,
} from '@client/store'
import { deleteBook, generateCover, getBook } from '@client/api'
import { isAwaitingTocApproval, isGenerating, isReadable } from '@shared/book-status'
import type { LibraryBook } from '@shared/responses'

export type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string; chapterCount: number }
  | { type: 'resuming'; bookId: string }
  | { type: 'reading'; book: LibraryBook }
  | { type: 'quiz-review'; book: LibraryBook }
  | { type: 'review-progress' }
  | { type: 'skill-detail'; skillName: string }
  | { type: 'profile-update'; bookId: string; bookTitle: string }

interface UseLibraryNavigationOptions {
  books: LibraryBook[]
  setBooks: Dispatch<SetStateAction<LibraryBook[]>>
  hasLoaded: boolean
  fetchBooks: () => Promise<void>
}

/**
 * Which top-level screen is showing, plus the handful of transitions that
 * are more than a bare `setView`: resuming the last-viewed book on launch,
 * opening a book from the grid, and the create-book handoff that bridges
 * the wizard's cover-generation opt-in to landing in the reader at chapter 1.
 *
 * This is the one piece of app-wide routing state, so it lives above
 * LibraryPage even though most of what it triggers is library data —
 * ReaderPage, CreationView and the rest are siblings of the library screen,
 * not children of it.
 */
export function useLibraryNavigation({ books, setBooks, hasLoaded, fetchBooks }: UseLibraryNavigationOptions) {
  const [view, setView] = useState<View>({ type: 'library' })
  const [pendingCoverPrompt, setPendingCoverPrompt] = useState<string | null>(null)
  const dispatch = useAppDispatch()
  const lastViewedBookId = useAppSelector(selectLastViewedBookId)
  const restoredOnceRef = useRef(false)

  // Resume last-viewed book on first load. Only restores into a view that
  // won't break for the book's state — toc_review resumes the approval flow,
  // reading/complete opens the reader. Generating/failed/undefined has no
  // chapter yet, so those stay on the library.
  useEffect(() => {
    if (!hasLoaded || restoredOnceRef.current) return
    restoredOnceRef.current = true
    if (!lastViewedBookId) return
    const book = books.find(b => b.id === lastViewedBookId)
    if (!book) return
    if (isAwaitingTocApproval(book.status)) setView({ type: 'resuming', bookId: book.id })
    else if (isReadable(book.status)) setView({ type: 'reading', book })
  }, [hasLoaded, books, lastViewedBookId])

  const goToLibrary = useCallback(() => setView({ type: 'library' }), [])
  const goToReading = useCallback((book: LibraryBook) => setView({ type: 'reading', book }), [])
  const goToQuizReview = useCallback((book: LibraryBook) => setView({ type: 'quiz-review', book }), [])
  const goToReviewProgress = useCallback(() => setView({ type: 'review-progress' }), [])
  const goToSkillDetail = useCallback((skillName: string) => setView({ type: 'skill-detail', skillName }), [])
  const goToProfileUpdate = useCallback((bookId: string, bookTitle: string) => setView({ type: 'profile-update', bookId, bookTitle }), [])

  const openBook = useCallback((book: LibraryBook) => {
    // Same gating as the auto-restore above — never route a book with no
    // chapters into the reader. Flushing persist immediately means a quick
    // Cmd+Q can't race the debounced write.
    if (isAwaitingTocApproval(book.status)) {
      dispatch(setLastViewedBookId(book.id))
      persistor.flush().catch(() => {})
      setView({ type: 'resuming', bookId: book.id })
    } else if (isReadable(book.status)) {
      dispatch(setLastViewedBookId(book.id))
      persistor.flush().catch(() => {})
      setView({ type: 'reading', book })
    }
    // Otherwise (generating_toc, generating, failed): stay on library.
  }, [dispatch])

  const handleCreate = useCallback((topic: string, details: string, chapterCount: number, coverPrompt?: string) => {
    setPendingCoverPrompt(coverPrompt ?? null)
    setView({ type: 'creating', topic, details, chapterCount })
  }, [])

  const handleCreationComplete = useCallback(async (bookId: string) => {
    // Fire cover generation if opted in during creation
    if (pendingCoverPrompt) {
      const { provider, model } = selectFunctionModel('image')(store.getState())
      generateCover(bookId, { prompt: pendingCoverPrompt, provider, model }).catch(() => {}) // fire-and-forget
      setPendingCoverPrompt(null)
    }
    // Navigate straight into the reader at chapter 1 — going back to the
    // library after the user just sat through TOC + ch.1 generation is a dead-end.
    try {
      const book = await getBook(bookId)
      dispatch(setLastViewedBookId(bookId))
      persistor.flush().catch(() => {})
      // getBook lacks the library-list-only fields LibraryBook adds (hasCover,
      // chaptersRead, ...) — the same gap the old `as Book` cast on this same
      // endpoint already had, since ReaderPage only reads the fields the two
      // response shapes share.
      setView({ type: 'reading', book: book as unknown as LibraryBook })
      fetchBooks()
      return
    } catch {
      // Fall through to library if the fetch fails
    }
    fetchBooks()
    setView({ type: 'library' })
  }, [pendingCoverPrompt, dispatch, fetchBooks])

  const handleCreationCancel = useCallback(async () => {
    // Find the candidate book from local state — but local state can lag
    // behind the server (the 1s polling stops once status flips to
    // toc_review, so a book that just finished TOC generation may still
    // appear as generating_toc locally). Re-check the server before
    // deleting so we don't blow away a book that has already advanced
    // out of the cancellable window.
    const candidate = books.find(b => isGenerating(b.status))
    if (candidate) {
      try {
        const fresh = await getBook(candidate.id)
        if (isGenerating(fresh.status)) {
          deleteBook(candidate.id).catch(() => {})
          // Remove optimistic book immediately so it doesn't persist as a phantom
          setBooks(prev => prev.filter(b => b.id !== candidate.id))
        }
      } catch {
        // If the status check fails, err on the side of NOT deleting —
        // the user can clean up manually rather than lose work to a flaky network.
      }
    }
    fetchBooks()
    setView({ type: 'library' })
  }, [books, setBooks, fetchBooks])

  return {
    view,
    openBook,
    goToLibrary,
    goToReading,
    goToQuizReview,
    goToReviewProgress,
    goToSkillDetail,
    goToProfileUpdate,
    handleCreate,
    handleCreationComplete,
    handleCreationCancel,
  }
}
