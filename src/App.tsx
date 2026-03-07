import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { BookCard } from '@src/components/BookCard'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { WizardModal } from '@src/components/WizardModal'
import { CreationView } from '@src/components/CreationView'
import { ReaderPage } from '@src/pages/ReaderPage'
import { useAppSelector, useAppDispatch, setApiKey, selectApiKey } from '@src/store'

interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
}

const MOCK_BOOKS: Book[] = [
  { id: '1', title: 'Introduction to Machine Learning', chaptersRead: 3, totalChapters: 12 },
  { id: '2', title: 'The Art of Prompt Engineering', chaptersRead: 7, totalChapters: 8 },
  { id: '3', title: 'Rust for Systems Programming', chaptersRead: 0, totalChapters: 15 },
  { id: '4', title: 'Advanced TypeScript Patterns', chaptersRead: 5, totalChapters: 6 },
  { id: '5', title: 'Distributed Systems Design', chaptersRead: 1, totalChapters: 10 },
  { id: '6', title: 'Modern CSS Architecture', chaptersRead: 4, totalChapters: 9 },
  { id: '7', title: 'PostgreSQL Performance Tuning', chaptersRead: 2, totalChapters: 8 },
  { id: '8', title: 'React Server Components', chaptersRead: 0, totalChapters: 7 },
]

type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string }
  | { type: 'reading'; book: Book }

export default function App() {
  const [view, setView] = useState<View>({ type: 'library' })
  const [apiBooks, setApiBooks] = useState<Book[]>([])
  const furthest = useAppSelector(s => s.readingProgress.furthest)
  const dispatch = useAppDispatch()
  const existingKey = useAppSelector(selectApiKey)

  useEffect(() => {
    window.electronAPI?.loadApiKey().then(key => {
      if (key) {
        dispatch(setApiKey(key))
      } else if (existingKey) {
        window.electronAPI?.saveApiKey(existingKey)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3147/api/books')
      if (res.ok) {
        const books = await res.json()
        setApiBooks(
          books.map((b: { id: string; title: string; totalChapters: number; generatedUpTo: number }) => ({
            id: b.id,
            title: b.title,
            chaptersRead: 0,
            totalChapters: b.totalChapters,
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

  const allBooks = [...apiBooks, ...MOCK_BOOKS]

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
          <WizardModal
            onCreate={handleCreate}
            trigger={
              <Button
                size="sm"
                className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
              >
                <Plus data-icon="inline-start" className="size-4" />
                New Book
              </Button>
            }
          />
          <SettingsMenu />
        </div>
      </header>

      {/* Library grid */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
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
                  onClick={() => setView({ type: 'reading', book })}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
