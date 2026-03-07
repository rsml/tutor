import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { BookCard } from '@src/components/BookCard'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { WizardModal } from '@src/components/WizardModal'
import { ReaderPage } from '@src/pages/ReaderPage'
import { useAppSelector, useAppDispatch, setApiKey } from '@src/store'

const MOCK_BOOKS = [
  { id: '1', title: 'Introduction to Machine Learning', chaptersRead: 3, totalChapters: 12 },
  { id: '2', title: 'The Art of Prompt Engineering', chaptersRead: 7, totalChapters: 8 },
  { id: '3', title: 'Rust for Systems Programming', chaptersRead: 0, totalChapters: 15 },
  { id: '4', title: 'Advanced TypeScript Patterns', chaptersRead: 5, totalChapters: 6 },
  { id: '5', title: 'Distributed Systems Design', chaptersRead: 1, totalChapters: 10 },
  { id: '6', title: 'Modern CSS Architecture', chaptersRead: 4, totalChapters: 9 },
  { id: '7', title: 'PostgreSQL Performance Tuning', chaptersRead: 2, totalChapters: 8 },
  { id: '8', title: 'React Server Components', chaptersRead: 0, totalChapters: 7 },
]

export default function App() {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const furthest = useAppSelector(s => s.readingProgress.furthest)
  const dispatch = useAppDispatch()

  useEffect(() => {
    window.electronAPI?.loadApiKey().then(key => {
      if (key) dispatch(setApiKey(key))
    })
  }, [dispatch])

  const selectedBook = MOCK_BOOKS.find(b => b.id === selectedBookId)

  if (selectedBook) {
    return <ReaderPage book={selectedBook} onBack={() => setSelectedBookId(null)} />
  }

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      {/* Header — glassmorphism */}
      <header
        className="relative flex h-12 shrink-0 items-center justify-between border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Tutor
        </span>

        {/* Right side: New Book + Settings */}
        <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <WizardModal
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
            {MOCK_BOOKS.map((book) => {
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
                  onClick={() => setSelectedBookId(book.id)}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
