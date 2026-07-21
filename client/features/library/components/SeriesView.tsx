import { ArrowLeft } from 'lucide-react'
import { BookCard } from '@client/features/library/components/BookCard'
import { NoiseOverlay } from '@client/components/NoiseOverlay'
import { coverUrl } from '@client/api'
import { isComplete } from '@shared/book-status'
import type { LibraryBook } from '@shared/responses'

interface SeriesViewProps {
  seriesName: string
  books: LibraryBook[]
  readingPositions: Record<string, { chapter: number }>
  onBookClick: (book: LibraryBook) => void
  onBack: () => void
  onContextMenu?: (book: LibraryBook, e: React.MouseEvent) => void
}

export function SeriesView({ seriesName, books, readingPositions, onBookClick, onBack, onContextMenu }: SeriesViewProps) {
  const sortedBooks = [...books].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))

  const totalChapters = sortedBooks.reduce((sum, b) => sum + b.totalChapters, 0)
  const totalRead = sortedBooks.reduce((sum, b) => {
    if (isComplete(b.status)) return sum + b.totalChapters
    const pos = readingPositions[b.id]
    return sum + (pos != null ? pos.chapter + 1 : b.chaptersRead)
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

        <div className="mx-auto max-w-7xl pt-8">
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
              const pos = readingPositions[book.id]
              const chaptersRead = isComplete(book.status)
                ? book.totalChapters
                : pos != null ? pos.chapter + 1 : book.chaptersRead
              return (
                <BookCard
                  key={book.id}
                  title={book.title}
                  subtitle={book.seriesOrder ? `Book ${book.seriesOrder}` : book.subtitle}
                  chaptersRead={chaptersRead}
                  totalChapters={book.totalChapters}
                  status={book.status}
                  rating={book.rating}
                  coverUrl={book.hasCover ? coverUrl({ id: book.id, coverUpdatedAt: book.coverUpdatedAt ?? undefined }) : undefined}
                  showTitleOnCover={book.showTitleOnCover}
                  hasAudiobook={book.hasAudiobook}
                  onClick={() => onBookClick(book)}
                  onContextMenu={onContextMenu ? (e) => {
                    e.preventDefault()
                    onContextMenu(book, e)
                  } : undefined}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
