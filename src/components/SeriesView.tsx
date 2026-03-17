import { ArrowLeft } from 'lucide-react'
import { BookCard } from '@src/components/BookCard'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { apiUrl } from '@src/lib/api-base'

interface Book {
  id: string
  title: string
  subtitle?: string
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
  createdAt: string
  tags: string[]
  series?: string
  seriesOrder?: number
}

interface SeriesViewProps {
  seriesName: string
  books: Book[]
  furthest: Record<string, number>
  onBookClick: (book: Book) => void
  onBack: () => void
}

export function SeriesView({ seriesName, books, furthest, onBookClick, onBack }: SeriesViewProps) {
  const sortedBooks = [...books].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))

  const totalChapters = sortedBooks.reduce((sum, b) => sum + b.totalChapters, 0)
  const totalRead = sortedBooks.reduce((sum, b) => {
    const reduxProgress = furthest[b.id]
    return sum + (reduxProgress != null ? reduxProgress + 1 : b.chaptersRead)
  }, 0)

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      {/* Header */}
      <header
        className="relative flex h-12 shrink-0 items-center justify-center border-b border-border-default/50 bg-surface-base/90 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold tracking-tight">
          {seriesName}
        </span>
      </header>

      {/* Content */}
      <main className="relative flex-1 overflow-y-auto px-8 py-8">
        {/* Back button — overlays top-left of content area */}
        <button
          onClick={onBack}
          className="absolute left-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 text-content-muted opacity-50 transition-all hover:opacity-100"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="mx-auto max-w-7xl">
          {/* Summary stats */}
          <div className="mb-6 flex items-center gap-4 text-sm text-content-muted">
            <span>{sortedBooks.length} {sortedBooks.length === 1 ? 'book' : 'books'}</span>
            <span className="text-content-faint">|</span>
            <span>
              {totalRead === 0
                ? `${totalChapters} chapters total`
                : `${totalRead} of ${totalChapters} chapters read`}
            </span>
          </div>

          {/* Books grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8 xl:grid-cols-5">
            {sortedBooks.map((book) => {
              const reduxProgress = furthest[book.id]
              const chaptersRead = reduxProgress != null
                ? reduxProgress + 1
                : book.chaptersRead
              return (
                <BookCard
                  key={book.id}
                  title={book.title}
                  subtitle={book.seriesOrder ? `Book ${book.seriesOrder}` : book.subtitle}
                  chaptersRead={chaptersRead}
                  totalChapters={book.totalChapters}
                  status={book.status}
                  rating={book.rating}
                  finalQuizScore={book.finalQuizScore}
                  finalQuizTotal={book.finalQuizTotal}
                  coverUrl={book.hasCover ? apiUrl(`/api/books/${book.id}/cover?v=${book.coverUpdatedAt ?? ''}`) : undefined}
                  showTitleOnCover={book.showTitleOnCover}
                  onClick={() => onBookClick(book)}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
