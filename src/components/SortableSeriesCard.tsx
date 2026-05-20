import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { SeriesStackCard } from '@src/components/SeriesStackCard'

interface Book {
  id: string
  title: string
  hasCover?: boolean
  coverUpdatedAt?: string | null
  showTitleOnCover?: boolean
}

interface SortableSeriesCardProps {
  id: string
  seriesName: string
  books: Book[]
  chaptersRead: number
  totalChapters: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function SortableSeriesCardInner({ id, ...cardProps }: SortableSeriesCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? 'z-50 opacity-90' : 'hover:z-10'}`}
    >
      <div className={isDragging ? 'scale-[1.03] shadow-2xl ring-1 ring-border-focus/30 rounded-xl transition-transform' : ''}>
        <SeriesStackCard {...cardProps} />
      </div>
      {/* Drag handle overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 cursor-grab rounded-md bg-black/20 p-1 opacity-40 backdrop-blur-sm transition-opacity hover:opacity-90 active:cursor-grabbing"
      >
        <GripVertical className="size-5 text-white drop-shadow-md" />
      </div>
    </div>
  )
}

// Match SortableBookCard's memo strategy: value-equality on the data props,
// skipping the freshly-allocated onClick/onContextMenu closures from the parent
// and the fresh `books` array (which is rebuilt every render via
// `filteredBooks.filter(...)`). useSortable subscribes to DnD context
// internally so drag state still updates correctly.
export const SortableSeriesCard = memo(SortableSeriesCardInner, (a, b) => {
  if (a.id !== b.id) return false
  if (a.seriesName !== b.seriesName) return false
  if (a.chaptersRead !== b.chaptersRead) return false
  if (a.totalChapters !== b.totalChapters) return false
  if (a.books.length !== b.books.length) return false
  for (let i = 0; i < a.books.length; i++) {
    const x = a.books[i]
    const y = b.books[i]
    if (x.id !== y.id) return false
    if (x.title !== y.title) return false
    if (x.hasCover !== y.hasCover) return false
    if (x.coverUpdatedAt !== y.coverUpdatedAt) return false
    if (x.showTitleOnCover !== y.showTitleOnCover) return false
  }
  return true
})
