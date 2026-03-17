import { BookListRow } from '@src/components/BookListRow'

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
  createdAt: string
  tags: string[]
  series?: string
  seriesOrder?: number
  sortOrder?: number
  imported?: boolean
}

type ListItem =
  | { type: 'book'; book: Book; chaptersRead: number }
  | { type: 'series'; seriesName: string; bookCount: number; books: Array<{ book: Book; chaptersRead: number }> }

interface BookListViewProps {
  items: ListItem[]
  onBookClick: (book: Book) => void
  onSeriesClick: (seriesName: string) => void
  onContextMenu: (book: Book, e: React.MouseEvent) => void
}

export function BookListView({ items, onBookClick, onSeriesClick, onContextMenu }: BookListViewProps) {
  return (
    <div className="w-full">
      {/* Column headers — sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-1 border-b border-border-default/30 text-[11px] font-medium uppercase tracking-wider text-content-faint select-none bg-surface-base">
        <div className="flex-[2] min-w-0">Title</div>
        <div className="w-[160px] shrink-0">Tags</div>
        <div className="w-[120px] shrink-0">Progress</div>
        <div className="w-[100px] shrink-0 text-right">Created</div>
        <div className="w-[90px] shrink-0 text-right">Rating</div>
      </div>

      {/* Rows */}
      {items.map(item => {
        if (item.type === 'series') {
          return (
            <div key={`series-${item.seriesName}`}>
              {/* Series header row */}
              <div
                className="flex items-center gap-4 px-4 py-2 cursor-pointer bg-surface-raised/30 hover:bg-surface-raised/50 transition-colors border-b border-border-default/20"
                onClick={() => onSeriesClick(item.seriesName)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-0.5">
                    {[...Array(Math.min(item.bookCount, 3))].map((_, i) => (
                      <div
                        key={i}
                        className="h-3 w-2 rounded-[1px] border border-content-faint/30 bg-content-faint/10"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                    {item.seriesName}
                  </span>
                  <span className="text-[10px] text-content-faint">
                    {item.bookCount} {item.bookCount === 1 ? 'book' : 'books'}
                  </span>
                </div>
              </div>

              {/* Series books — nested with connector lines */}
              <div className="relative ml-2">
                {item.books.map(({ book, chaptersRead }, idx) => (
                  <div key={book.id} className="relative">
                    {/* Vertical line: full height for non-last, half for last */}
                    <div
                      className="absolute left-4 top-0 w-px bg-border-default/50"
                      style={{ height: idx === item.books.length - 1 ? '50%' : '100%' }}
                    />
                    {/* Vertical line above for non-first items (connects to previous) */}
                    {idx === 0 && (
                      <div className="absolute left-4 top-0 w-px h-1/2 bg-border-default/50" />
                    )}
                    {/* Horizontal connector to row */}
                    <div className="absolute left-4 top-1/2 -translate-y-px h-px w-3.5 bg-border-default/50" />
                    <div className="pl-8">
                      <BookListRow
                        book={book}
                        chaptersRead={chaptersRead}
                        onClick={() => onBookClick(book)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          onContextMenu(book, e)
                        }}
                        nested
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        return (
          <BookListRow
            key={item.book.id}
            book={item.book}
            chaptersRead={item.chaptersRead}
            onClick={() => onBookClick(item.book)}
            onContextMenu={(e) => {
              e.preventDefault()
              onContextMenu(item.book, e)
            }}
          />
        )
      })}
    </div>
  )
}
