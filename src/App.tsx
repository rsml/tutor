import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, BookOpen } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { BookCard } from '@src/components/BookCard'
import { StarRating } from '@src/components/StarRating'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { WizardModal } from '@src/components/WizardModal'
import { CreationView } from '@src/components/CreationView'
import { BookOverviewModal } from '@src/components/BookOverviewModal'
import { CoverGenerationModal } from '@src/components/CoverGenerationModal'
import { GenerateAllModal } from '@src/components/GenerateAllModal'
import { BackgroundTasksFooter } from '@src/components/BackgroundTasksFooter'
import { ReaderPage } from '@src/pages/ReaderPage'
import { QuizReviewPage } from '@src/pages/QuizReviewPage'
import { ReviewProgressPage } from '@src/pages/ReviewProgressPage'
import { SkillDetailPage } from '@src/pages/SkillDetailPage'
import { ProfileUpdatePage } from '@src/pages/ProfileUpdatePage'
import { useBackgroundTasks } from '@src/hooks/useBackgroundTasks'
import { store, useAppSelector, useAppDispatch, setProviderApiKey, selectHasApiKey, selectFontSize, selectLibraryTab, setLibraryTab, selectFunctionModel } from '@src/store'
import { cn } from '@src/lib/utils'
import { PROVIDER_IDS } from '@src/lib/providers'
import { apiUrl } from '@src/lib/api-base'

interface Book {
  id: string
  title: string
  subtitle?: string
  prompt?: string
  chaptersRead: number
  totalChapters: number
  generatedUpTo: number
  status?: string
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
  hasCover?: boolean
  showTitleOnCover?: boolean
  coverUpdatedAt?: string | null
}


type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string; chapterCount: number }
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }
  | { type: 'review-progress' }
  | { type: 'skill-detail'; skillName: string }
  | { type: 'profile-update'; bookId: string; bookTitle: string }

export default function App() {
  const [view, setView] = useState<View>({ type: 'library' })
  const [apiBooks, setApiBooks] = useState<Book[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ book: Book; x: number; y: number } | null>(null)
  const [renameDialog, setRenameDialog] = useState<{ book: Book; title: string; subtitle: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ book: Book; input: string } | null>(null)
  const [rateDialog, setRateDialog] = useState<{ book: Book; rating: number } | null>(null)
  const [overviewBook, setOverviewBook] = useState<Book | null>(null)
  const [coverModal, setCoverModal] = useState<{ book: Book } | null>(null)
  const [generateAllModal, setGenerateAllModal] = useState<{ taskId: string; book: Book } | null>(null)
  const [mutating, setMutating] = useState(false)
  const [serverAvailable, setServerAvailable] = useState(true)
  const furthest = useAppSelector(s => s.readingProgress.furthest)
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKey)
  const fontSize = useAppSelector(selectFontSize)
  const libraryTab = useAppSelector(selectLibraryTab)
  const { provider: genProvider, model: genModel } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))

  useEffect(() => {
    if (window.electronAPI) {
      // Load API keys from secure storage and POST to server
      for (const provider of PROVIDER_IDS) {
        window.electronAPI.loadApiKey(provider).then(async key => {
          if (key) {
            try {
              await fetch(apiUrl('/api/settings/api-key'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: key }),
              })
            } catch { /* server may not be ready */ }
            dispatch(setProviderApiKey({ provider, apiKey: key }))
          }
        })
      }
      // Also try loading legacy key (no provider suffix) into anthropic
      window.electronAPI.loadApiKey().then(async key => {
        if (key) {
          try {
            await fetch(apiUrl('/api/settings/api-key'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: 'anthropic', apiKey: key }),
            })
          } catch { /* server may not be ready */ }
          dispatch(setProviderApiKey({ provider: 'anthropic', apiKey: key }))
        }
      })
    } else {
      // Dev/web mode — check server for existing key status
      fetch(apiUrl('/api/settings/api-key-status'))
        .then(res => res.json())
        .then((status: Record<string, boolean>) => {
          for (const provider of PROVIDER_IDS) {
            if (status[provider]) {
              dispatch(setProviderApiKey({ provider, apiKey: 'configured' }))
            }
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Health check — disable New Book when server is unreachable
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(apiUrl('/api/health'))
        setServerAvailable(res.ok)
      } catch {
        setServerAvailable(false)
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  // Close context menu on any click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  const handleNewBook = () => {
    if (!hasApiKey) {
      setApiKeyDialogOpen(true)
    } else {
      setWizardOpen(true)
    }
  }

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/books'))
      if (res.ok) {
        const books = await res.json()
        setApiBooks(prev => {
          // Preserve optimistic generating books not yet on server
          const generatingBooks = prev.filter(b => (b.status === 'generating' || b.status === 'generating_toc') && !books.some((sb: { id: string }) => sb.id === b.id))
          const serverBooks = books.map((b: { id: string; title: string; subtitle?: string; prompt?: string; totalChapters: number; generatedUpTo: number; status?: string; rating?: number; finalQuizScore?: number; finalQuizTotal?: number; hasCover?: boolean; showTitleOnCover?: boolean; coverUpdatedAt?: string | null }) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            prompt: b.prompt,
            chaptersRead: 0,
            totalChapters: b.totalChapters,
            generatedUpTo: b.generatedUpTo ?? 0,
            status: b.status,
            rating: b.rating,
            finalQuizScore: b.finalQuizScore,
            finalQuizTotal: b.finalQuizTotal,
            hasCover: b.hasCover,
            showTitleOnCover: b.showTitleOnCover,
            coverUpdatedAt: b.coverUpdatedAt,
          }))
          return [...serverBooks, ...generatingBooks]
        })
        setHasLoaded(true)
      } else {
        console.error('[fetchBooks] Server returned', res.status)
        setHasLoaded(true)
      }
    } catch {
      setHasLoaded(true)
      toast.error('Failed to load books — is the server running?')
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  // Connect to background task SSE stream — refresh library on cover generation + auto-download EPUB
  const handleEpubExported = useCallback((bookId: string, bookTitle: string) => {
    downloadEpub({ id: bookId, title: bookTitle } as Book)
  }, [])
  useBackgroundTasks({ onCoverGenerated: fetchBooks, onEpubExported: handleEpubExported, onGenerateAllCompleted: fetchBooks })

  // Poll for status updates when any book is generating
  useEffect(() => {
    const hasGenerating = apiBooks.some(b => b.status === 'generating_toc' || b.status === 'generating')
    if (!hasGenerating) return

    const interval = setInterval(fetchBooks, 1000)
    return () => clearInterval(interval)
  }, [apiBooks, fetchBooks])

  const [pendingCoverPrompt, setPendingCoverPrompt] = useState<string | null>(null)

  const handleCreate = (topic: string, details: string, chapterCount: number, coverPrompt?: string) => {
    setPendingCoverPrompt(coverPrompt ?? null)
    setView({ type: 'creating', topic, details, chapterCount })
  }

  const handleCreationComplete = (bookId: string) => {
    // Fire cover generation if opted in during creation
    if (pendingCoverPrompt) {
      const { provider: imgProvider, model: imgModel } = selectFunctionModel('image')(store.getState())
      fetch(apiUrl(`/api/books/${bookId}/cover/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pendingCoverPrompt, provider: imgProvider, model: imgModel }),
      }).catch(() => {}) // fire-and-forget
      setPendingCoverPrompt(null)
    }
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleCreationCancel = () => {
    // Delete any partially-created book from the server
    const creatingBook = apiBooks.find(b => b.status === 'generating_toc' || b.status === 'generating')
    if (creatingBook) {
      fetch(apiUrl(`/api/books/${creatingBook.id}`), { method: 'DELETE' }).catch(() => {})
      // Remove optimistic book immediately so it doesn't persist as a phantom
      setApiBooks(prev => prev.filter(b => b.id !== creatingBook.id))
    }
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleBookCreated = useCallback((bookId: string, title: string, totalChapters?: number) => {
    // Optimistically add the book to the library so it's visible during creation
    setApiBooks(prev => {
      if (prev.some(b => b.id === bookId)) return prev
      return [...prev, {
        id: bookId,
        title,
        chaptersRead: 0,
        totalChapters: totalChapters ?? 0,
        generatedUpTo: 0,
        status: 'generating_toc',
      }]
    })
  }, [])

  const handleGenerateAll = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/generate-all`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: genModel, provider: genProvider, quizModel, quizProvider }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }
      const { taskId } = await res.json()
      setGenerateAllModal({ taskId, book })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start generation')
    }
  }

  const handleExportEpub = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/export-epub`), {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }
      const data = await res.json()
      if (data.cached) {
        // Direct download
        await downloadEpub(book)
      } else {
        // Background task created — will auto-download on completion
        toast.success('EPUB export started — check background tasks')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export EPUB')
    }
  }

  const downloadEpub = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/export-epub`))
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
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

  const handleRename = async () => {
    if (!renameDialog) return
    const trimmed = renameDialog.title.trim()
    if (!trimmed) return
    setMutating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${renameDialog.book.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, subtitle: renameDialog.subtitle.trim() || undefined }),
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to rename book')
    } catch {
      toast.error('Failed to rename book — server unreachable')
    } finally {
      setMutating(false)
    }
    setRenameDialog(null)
  }

  const handleDelete = async () => {
    if (!deleteDialog || deleteDialog.input !== 'delete') return
    setMutating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${deleteDialog.book.id}`), {
        method: 'DELETE',
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to delete book')
    } catch {
      toast.error('Failed to delete book — server unreachable')
    } finally {
      setMutating(false)
    }
    setDeleteDialog(null)
  }

  const apiBookIds = new Set(apiBooks.map(b => b.id))
  const allBooks = apiBooks

  const classifyBook = useCallback((book: Book): 'finished' | 'in-progress' | 'not-started' => {
    if (book.status === 'complete') return 'finished'
    if (furthest[book.id] != null) return 'in-progress'
    return 'not-started'
  }, [furthest])

  const { sortedBooks, filteredBooks, tabCounts } = useMemo(() => {
    const classOrder = { 'in-progress': 0, 'not-started': 1, 'finished': 2 } as const
    const bookClasses = new Map(allBooks.map(b => [b.id, classifyBook(b)]))

    // Sort: in-progress first, then not-started, then finished
    const sorted = [...allBooks].sort((a, b) => {
      return classOrder[bookClasses.get(a.id)!] - classOrder[bookClasses.get(b.id)!]
    })

    const filtered = libraryTab === 'all'
      ? sorted
      : sorted.filter(b => bookClasses.get(b.id) === libraryTab)

    const counts = { all: allBooks.length, 'in-progress': 0, 'not-started': 0, finished: 0 }
    for (const cls of bookClasses.values()) counts[cls]++

    return { sortedBooks: sorted, filteredBooks: filtered, tabCounts: counts }
  }, [allBooks, libraryTab, classifyBook])

  if (view.type === 'creating') {
    return (
      <CreationView
        topic={view.topic}
        details={view.details}
        chapterCount={view.chapterCount}
        onComplete={handleCreationComplete}
        onCancel={handleCreationCancel}
        onBookCreated={handleBookCreated}
      />
    )
  }

  if (view.type === 'reading') {
    return (
      <ReaderPage
        book={view.book}
        onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
        onQuizReview={() => setView({ type: 'quiz-review', book: view.book })}
        onUpdateProfile={() => setView({ type: 'profile-update', bookId: view.book.id, bookTitle: view.book.title })}
      />
    )
  }

  if (view.type === 'quiz-review') {
    return (
      <QuizReviewPage
        book={view.book}
        onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
        onBackToReader={() => setView({ type: 'reading', book: view.book })}
      />
    )
  }

  if (view.type === 'review-progress') {
    return (
      <ReviewProgressPage
        onBack={() => setView({ type: 'library' })}
        onSkillClick={(skillName) => setView({ type: 'skill-detail', skillName })}
      />
    )
  }

  if (view.type === 'skill-detail') {
    return (
      <SkillDetailPage
        skillName={view.skillName}
        onBack={() => setView({ type: 'review-progress' })}
      />
    )
  }

  if (view.type === 'profile-update') {
    return (
      <ProfileUpdatePage
        bookId={view.bookId}
        bookTitle={view.bookTitle}
        onComplete={() => { fetchBooks(); setView({ type: 'library' }) }}
      />
    )
  }

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      {/* Header */}
      <header
        className="relative flex h-12 shrink-0 items-center justify-between border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Tutor
        </span>

        <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button
            size="sm"
            onClick={handleNewBook}
            disabled={!serverAvailable}
            className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)] disabled:opacity-40"
          >
            <Plus data-icon="inline-start" className="size-4" />
            New Book
          </Button>
          <WizardModal
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onCreate={handleCreate}
          />
          <SettingsMenu
            apiKeyDialogOpen={apiKeyDialogOpen}
            onApiKeyDialogClose={() => setApiKeyDialogOpen(false)}
            onReviewProgress={() => setView({ type: 'review-progress' })}
          />
        </div>
      </header>

      {/* Filter tabs */}
      {allBooks.length > 0 && (
        <div className="border-b border-border-default/50 bg-surface-base/90 backdrop-blur-sm px-8">
          <div className="mx-auto max-w-7xl">
            <nav className="flex gap-6">
              {([
                ['all', 'All'],
                ['in-progress', 'In Progress'],
                ['not-started', 'Not Started'],
                ['finished', 'Finished'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => dispatch(setLibraryTab(key))}
                  className={cn(
                    'relative py-2.5 text-sm font-medium transition-colors',
                    libraryTab === key
                      ? 'text-content-primary'
                      : 'text-content-muted hover:text-content-primary',
                  )}
                >
                  {label}
                  {tabCounts[key] > 0 && (
                    <span className={cn(
                      'ml-1.5 text-xs',
                      libraryTab === key ? 'text-content-muted' : 'text-content-faint',
                    )}>
                      {tabCounts[key]}
                    </span>
                  )}
                  {libraryTab === key && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Library grid */}
      <main className="flex-1 overflow-y-auto px-8 py-8" style={{ fontSize: `${fontSize}px` }}>
        <div className="mx-auto max-w-7xl">
          {hasLoaded && allBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <BookOpen className="size-12 text-content-faint" />
              <h2 className="mt-4 text-lg font-semibold text-content-primary">No books yet</h2>
              <p className="mt-1 text-sm text-content-muted">Create your first book to start learning.</p>
              <Button
                className="mt-6 bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
                onClick={handleNewBook}
                disabled={!serverAvailable}
              >
                <Plus data-icon="inline-start" className="size-4" />
                New Book
              </Button>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <BookOpen className="size-12 text-content-faint" />
              <p className="mt-4 text-sm text-content-muted">No books match this filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8 xl:grid-cols-5">
              {filteredBooks.map((book) => {
                const reduxProgress = furthest[book.id]
                const chaptersRead = reduxProgress != null
                  ? reduxProgress + 1
                  : book.chaptersRead
                return (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    subtitle={book.subtitle}
                    chaptersRead={chaptersRead}
                    totalChapters={book.totalChapters}
                    status={book.status}
                    rating={book.rating}
                    finalQuizScore={book.finalQuizScore}
                    finalQuizTotal={book.finalQuizTotal}
                    coverUrl={book.hasCover ? apiUrl(`/api/books/${book.id}/cover?v=${book.coverUpdatedAt ?? ''}`) : undefined}
                    showTitleOnCover={book.showTitleOnCover}
                    onClick={() => setView({ type: 'reading', book })}
                    onContextMenu={apiBookIds.has(book.id) ? (e) => {
                      e.preventDefault()
                      setContextMenu({ book, x: e.clientX, y: e.clientY })
                    } : undefined}
                  />
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y, width: 'fit-content' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setRenameDialog({ book: contextMenu.book, title: contextMenu.book.title, subtitle: contextMenu.book.subtitle ?? '' })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setRateDialog({ book: contextMenu.book, rating: contextMenu.book.rating ?? 0 })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
          >
            Rate
          </button>
          <button
            onClick={() => {
              setView({ type: 'quiz-review', book: contextMenu.book })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
          >
            Quiz Review
          </button>
          <button
            onClick={() => {
              setOverviewBook(contextMenu.book)
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
          >
            Book Overview
          </button>
          <div className="my-1 h-px bg-border-default/50" />
          <button
            onClick={() => {
              setCoverModal({ book: contextMenu.book })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
          >
            Edit Cover
          </button>
          <button
            onClick={() => {
              handleGenerateAll(contextMenu.book)
              setContextMenu(null)
            }}
            disabled={contextMenu.book.generatedUpTo >= contextMenu.book.totalChapters}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate Entire Book
          </button>
          <button
            onClick={() => {
              handleExportEpub(contextMenu.book)
              setContextMenu(null)
            }}
            disabled={contextMenu.book.generatedUpTo < contextMenu.book.totalChapters}
            className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export EPUB
          </button>
          <div className="my-1 h-px bg-border-default/50" />
          <button
            onClick={() => {
              setDeleteDialog({ book: contextMenu.book, input: '' })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameDialog} onOpenChange={open => { if (!open) setRenameDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Book</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Title</label>
              <input
                value={renameDialog?.title ?? ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, title: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Subtitle</label>
              <input
                value={renameDialog?.subtitle ?? ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, subtitle: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                placeholder="Optional subtitle"
                className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameDialog?.title.trim() || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteDialog?.book.title}&rdquo;? Type <strong>delete</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={deleteDialog?.input ?? ''}
            onChange={e => setDeleteDialog(prev => prev ? { ...prev, input: e.target.value } : null)}
            onKeyDown={e => e.key === 'Enter' && deleteDialog?.input === 'delete' && handleDelete()}
            placeholder="delete"
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog?.input !== 'delete' || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate dialog */}
      <Dialog open={!!rateDialog} onOpenChange={open => { if (!open) setRateDialog(null) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rate Book</DialogTitle>
            <DialogDescription>{rateDialog?.book.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-4">
            <StarRating
              value={rateDialog?.rating ?? 0}
              onChange={val => setRateDialog(prev => prev ? { ...prev, rating: val } : null)}
              size="lg"
            />
            {rateDialog && rateDialog.book.rating != null && rateDialog.book.rating > 0 && (
              <button
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={async () => {
                  if (!rateDialog) return
                  setMutating(true)
                  try {
                    const res = await fetch(apiUrl(`/api/books/${rateDialog.book.id}/rating`), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rating: 0 }),
                    })
                    if (res.ok) await fetchBooks()
                    else toast.error('Failed to clear rating')
                  } catch {
                    toast.error('Failed to clear rating — server unreachable')
                  } finally {
                    setMutating(false)
                  }
                  setRateDialog(null)
                }}
                disabled={mutating}
              >
                Clear rating
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateDialog(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!rateDialog) return
                setMutating(true)
                try {
                  const res = await fetch(apiUrl(`/api/books/${rateDialog.book.id}/rating`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating: rateDialog.rating }),
                  })
                  if (res.ok) await fetchBooks()
                  else toast.error('Failed to save rating')
                } catch {
                  toast.error('Failed to save rating — server unreachable')
                } finally {
                  setMutating(false)
                }
                setRateDialog(null)
              }}
              disabled={!rateDialog?.rating || mutating}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book overview modal */}
      <BookOverviewModal
        open={!!overviewBook}
        onOpenChange={(open) => { if (!open) setOverviewBook(null) }}
        book={overviewBook ?? { id: '', title: '', totalChapters: 0 }}
      />

      {/* Cover generation modal */}
      {coverModal && (
        <CoverGenerationModal
          open={true}
          onOpenChange={(open) => { if (!open) setCoverModal(null) }}
          bookId={coverModal.book.id}
          bookTitle={coverModal.book.title}
          bookTopic={coverModal.book.prompt ?? coverModal.book.title}
          hasCover={coverModal.book.hasCover}
          showTitleOnCover={coverModal.book.showTitleOnCover}
          onCoverChanged={fetchBooks}
        />
      )}

      {/* Generate all modal */}
      {generateAllModal && (
        <GenerateAllModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setGenerateAllModal(null)
              fetchBooks()
            }
          }}
          taskId={generateAllModal.taskId}
          bookTitle={generateAllModal.book.title}
          totalChapters={generateAllModal.book.totalChapters}
        />
      )}

      {/* Background tasks footer */}
      <BackgroundTasksFooter />
    </div>
  )
}
