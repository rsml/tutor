import { useCallback, useEffect, useState } from 'react'
import { toast } from '@client/lib/toast'
import { listBooks } from '@client/api'
import { GENERATING_POLL_MS } from '@client/lib/constants'
import { isGenerating } from '@shared/book-status'
import type { LibraryBook } from '@shared/responses'

/**
 * The library's book list, kept fresh by three independent triggers: an
 * initial load, a refetch whenever the window regains focus (so an
 * audiobook generated via the CLI/MCP, files moved on disk, or a server
 * restart shows up without a manual reload), and a one second poll for as
 * long as any book is actively generating.
 *
 * A book the wizard just created has no server row yet. addOptimisticBook
 * adds it locally so it's visible immediately, and every fetch's merge below
 * keeps that local entry alive — filtered back out only once the server's
 * own list reports the same id — so the card can't flicker away mid-poll
 * while the real row is still being written.
 */
export function useBooks() {
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)

  const fetchBooks = useCallback(async () => {
    try {
      const serverBooks = await listBooks()
      setBooks(prev => {
        // Preserve optimistic generating books not yet on server
        const generatingBooks = prev.filter(b => isGenerating(b.status) && !serverBooks.some(sb => sb.id === b.id))
        return [...serverBooks, ...generatingBooks]
      })
      setHasLoaded(true)
    } catch {
      setHasLoaded(true)
      toast.error('Failed to load books — is the server running?')
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  // Refetch when the window regains focus so external changes (e.g.,
  // audiobook generated via CLI/MCP, files moved on disk, recovery on
  // server restart) show up in the library without a manual reload.
  useEffect(() => {
    const onFocus = () => { void fetchBooks() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchBooks])

  // Poll for status updates when any book is generating
  useEffect(() => {
    const hasGenerating = books.some(b => isGenerating(b.status))
    if (!hasGenerating) return

    const interval = setInterval(fetchBooks, GENERATING_POLL_MS)
    return () => clearInterval(interval)
  }, [books, fetchBooks])

  // Optimistically add the book to the library so it's visible during
  // creation, before the server has a row for it. The merge in fetchBooks
  // above keeps this entry alive across polls until the real one lands.
  const addOptimisticBook = useCallback((bookId: string, title: string, totalChapters?: number) => {
    setBooks(prev => {
      if (prev.some(b => b.id === bookId)) return prev
      const now = new Date().toISOString()
      const optimisticBook: LibraryBook = {
        id: bookId,
        title,
        prompt: '',
        chaptersRead: 0,
        totalChapters: totalChapters ?? 0,
        generatedUpTo: 0,
        status: 'generating_toc',
        createdAt: now,
        updatedAt: now,
        tags: [],
        hasCover: false,
        showTitleOnCover: false,
        coverUpdatedAt: null,
        hasAudiobook: false,
        audioGeneratedChapters: [],
      }
      return [...prev, optimisticBook]
    })
  }, [])

  return { books, setBooks, hasLoaded, fetchBooks, addOptimisticBook }
}
