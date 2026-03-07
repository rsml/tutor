import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
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
import { ReaderPage } from '@src/pages/ReaderPage'
import { QuizReviewPage } from '@src/pages/QuizReviewPage'
import { useAppSelector, useAppDispatch, setProviderApiKey, selectApiKey, selectFontSize } from '@src/store'
import { PROVIDER_IDS } from '@src/lib/providers'
import { apiUrl } from '@src/lib/api-base'

interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
  status?: string
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
}


type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string }
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }

export default function App() {
  const [view, setView] = useState<View>({ type: 'library' })
  const [apiBooks, setApiBooks] = useState<Book[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ book: Book; x: number; y: number } | null>(null)
  const [renameDialog, setRenameDialog] = useState<{ book: Book; title: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ book: Book; input: string } | null>(null)
  const [rateDialog, setRateDialog] = useState<{ book: Book; rating: number } | null>(null)
  const [overviewBook, setOverviewBook] = useState<Book | null>(null)
  const [serverAvailable, setServerAvailable] = useState(true)
  const furthest = useAppSelector(s => s.readingProgress.furthest)
  const dispatch = useAppDispatch()
  const apiKey = useAppSelector(selectApiKey)
  const fontSize = useAppSelector(selectFontSize)

  useEffect(() => {
    // Load API keys for all providers from secure storage
    for (const provider of PROVIDER_IDS) {
      window.electronAPI?.loadApiKey(provider).then(key => {
        if (key) {
          dispatch(setProviderApiKey({ provider, apiKey: key }))
        }
      })
    }
    // Also try loading legacy key (no provider suffix) into anthropic
    window.electronAPI?.loadApiKey().then(key => {
      if (key) {
        dispatch(setProviderApiKey({ provider: 'anthropic', apiKey: key }))
      }
    })
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
    if (!apiKey) {
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
        setApiBooks(
          books.map((b: { id: string; title: string; totalChapters: number; generatedUpTo: number; status?: string; rating?: number; finalQuizScore?: number; finalQuizTotal?: number }) => ({
            id: b.id,
            title: b.title,
            chaptersRead: 0,
            totalChapters: b.totalChapters,
            status: b.status,
            rating: b.rating,
            finalQuizScore: b.finalQuizScore,
            finalQuizTotal: b.finalQuizTotal,
          })),
        )
      }
    } catch {
      // Server may not be running
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  const handleCreate = (topic: string, details: string) => {
    setView({ type: 'creating', topic, details })
  }

  const handleCreationComplete = (_bookId: string) => {
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleCreationCancel = () => {
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleRename = async () => {
    if (!renameDialog) return
    const trimmed = renameDialog.title.trim()
    if (!trimmed) return
    try {
      const res = await fetch(apiUrl(`/api/books/${renameDialog.book.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (res.ok) await fetchBooks()
    } catch { /* server unreachable */ }
    setRenameDialog(null)
  }

  const handleDelete = async () => {
    if (!deleteDialog || deleteDialog.input !== 'delete') return
    try {
      const res = await fetch(apiUrl(`/api/books/${deleteDialog.book.id}`), {
        method: 'DELETE',
      })
      if (res.ok) await fetchBooks()
    } catch { /* server unreachable */ }
    setDeleteDialog(null)
  }

  if (view.type === 'creating') {
    return (
      <CreationView
        topic={view.topic}
        details={view.details}
        onComplete={handleCreationComplete}
        onCancel={handleCreationCancel}
      />
    )
  }

  if (view.type === 'reading') {
    return (
      <ReaderPage
        book={view.book}
        onBack={() => setView({ type: 'library' })}
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

  const apiBookIds = new Set(apiBooks.map(b => b.id))
  const allBooks = apiBooks

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
          />
        </div>
      </header>

      {/* Library grid */}
      <main className="flex-1 overflow-y-auto px-8 py-8" style={{ fontSize: `${fontSize}px` }}>
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-4 gap-8 xl:grid-cols-5">
            {allBooks.map((book) => {
              const reduxProgress = furthest[book.id]
              const chaptersRead = reduxProgress != null
                ? reduxProgress + 1
                : book.chaptersRead
              return (
                <BookCard
                  key={book.id}
                  title={book.title}
                  chaptersRead={chaptersRead}
                  totalChapters={book.totalChapters}
                  rating={book.rating}
                  finalQuizScore={book.finalQuizScore}
                  finalQuizTotal={book.finalQuizTotal}
                  onClick={() => setView({ type: 'reading', book })}
                  onContextMenu={apiBookIds.has(book.id) ? (e) => {
                    e.preventDefault()
                    setContextMenu({ book, x: e.clientX, y: e.clientY })
                  } : undefined}
                />
              )
            })}
          </div>
        </div>
      </main>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setRenameDialog({ book: contextMenu.book, title: contextMenu.book.title })
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
          <input
            value={renameDialog?.title ?? ''}
            onChange={e => setRenameDialog(prev => prev ? { ...prev, title: e.target.value } : null)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameDialog?.title.trim()}>OK</Button>
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
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog?.input !== 'delete'}>OK</Button>
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
          <div className="flex justify-center py-4">
            <StarRating
              value={rateDialog?.rating ?? 0}
              onChange={val => setRateDialog(prev => prev ? { ...prev, rating: val } : null)}
              size="lg"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateDialog(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!rateDialog) return
                try {
                  await fetch(apiUrl(`/api/books/${rateDialog.book.id}/rating`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating: rateDialog.rating }),
                  })
                  await fetchBooks()
                } catch {}
                setRateDialog(null)
              }}
              disabled={!rateDialog?.rating}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
