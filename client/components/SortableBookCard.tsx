import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { BookCard } from '@client/components/BookCard'

interface SortableBookCardProps {
  id: string
  title: string
  subtitle?: string
  chaptersRead: number
  totalChapters: number
  status?: string
  rating?: number
  coverUrl?: string
  showTitleOnCover?: boolean
  imported?: boolean
  hasAudiobook?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function SortableBookCardInner({ id, ...bookCardProps }: SortableBookCardProps) {
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
      className={`relative ${isDragging ? 'z-50 opacity-90' : 'card-lift'}`}
    >
      <div className={isDragging ? 'scale-[1.03] shadow-2xl ring-1 ring-border-focus/30 rounded-xl transition-transform' : ''}>
        <BookCard {...bookCardProps} />
      </div>
      {/* Drag handle overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-30 cursor-grab rounded-md bg-black/20 p-1 opacity-40 backdrop-blur-sm transition-opacity hover:opacity-90 active:cursor-grabbing"
      >
        <GripVertical className="size-5 text-white drop-shadow-md" />
      </div>
    </div>
  )
}

// Match BookCard's memo strategy: value-equality on the data props, skipping
// the freshly-allocated onClick/onContextMenu closures from the parent.
// useSortable subscribes to DnD context internally and bypasses React.memo,
// so drag state still updates correctly when memoization skips a prop render.
export const SortableBookCard = memo(SortableBookCardInner, (a, b) =>
  a.id === b.id &&
  a.title === b.title &&
  a.subtitle === b.subtitle &&
  a.chaptersRead === b.chaptersRead &&
  a.totalChapters === b.totalChapters &&
  a.status === b.status &&
  a.rating === b.rating &&
  a.coverUrl === b.coverUrl &&
  a.showTitleOnCover === b.showTitleOnCover &&
  a.imported === b.imported &&
  a.hasAudiobook === b.hasAudiobook,
)
