import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
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
  isManual?: boolean
  onBookClick: (book: Book) => void
  onSeriesClick: (seriesName: string) => void
  onContextMenu: (book: Book, e: React.MouseEvent) => void
  onSeriesContextMenu?: (seriesName: string, books: Book[], e: React.MouseEvent) => void
}

function SortableListRow({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-10 rounded-lg border border-dashed border-border-default/50 bg-surface-raised/20"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex items-center"
    >
      <div
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab pl-1 pr-0 py-2.5 text-content-faint opacity-40 hover:opacity-90 active:cursor-grabbing transition-opacity"
      >
        <GripVertical className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}

export function BookListView({ items, isManual, onBookClick, onSeriesClick, onContextMenu, onSeriesContextMenu }: BookListViewProps) {
  return (
    <div className="w-full">
      {/* Column headers — sticky, breaks out of parent padding to cover full scroll area */}
      <div className="sticky top-0 z-10 -mx-8 bg-surface-base">
        <div className="flex items-center gap-4 px-12 py-1 border-b border-border-default/30 text-[11px] font-medium uppercase tracking-wider text-content-faint select-none">
          <div className="flex-[2] min-w-0">Title</div>
          <div className="w-[160px] shrink-0">Tags</div>
          <div className="w-[120px] shrink-0">Progress</div>
          <div className="w-[100px] shrink-0 text-right">Created</div>
          <div className="w-[90px] shrink-0 text-right">Rating</div>
        </div>
      </div>

      {/* Rows */}
      {items.map(item => {
        if (item.type === 'series') {
          const seriesContent = (
            <div key={`series-${item.seriesName}`}>
              {/* Series header row */}
              <div
                className="flex items-center gap-4 px-4 py-2 cursor-pointer bg-surface-raised/30 hover:bg-surface-raised/50 transition-colors border-b border-border-default/20"
                onClick={() => onSeriesClick(item.seriesName)}
                onContextMenu={(e) => {
                  if (onSeriesContextMenu) {
                    e.preventDefault()
                    onSeriesContextMenu(item.seriesName, item.books.map(b => b.book), e)
                  }
                }}
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
                    <div
                      className="absolute left-4 top-0 w-px bg-border-default/50"
                      style={{ height: idx === item.books.length - 1 ? '50%' : '100%' }}
                    />
                    {idx === 0 && (
                      <div className="absolute left-4 top-0 w-px h-1/2 bg-border-default/50" />
                    )}
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

          if (isManual) {
            return (
              <SortableListRow key={`series-${item.seriesName}`} id={`series-${item.seriesName}`}>
                {seriesContent}
              </SortableListRow>
            )
          }

          return seriesContent
        }

        const bookRow = (
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

        if (isManual) {
          return (
            <SortableListRow key={item.book.id} id={item.book.id}>
              {bookRow}
            </SortableListRow>
          )
        }

        return bookRow
      })}
    </div>
  )
}
