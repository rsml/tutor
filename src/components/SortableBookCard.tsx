import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { BookCard } from '@src/components/BookCard'

interface SortableBookCardProps {
  id: string
  title: string
  subtitle?: string
  chaptersRead: number
  totalChapters: number
  status?: string
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
  coverUrl?: string
  showTitleOnCover?: boolean
  imported?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SortableBookCard({ id, ...bookCardProps }: SortableBookCardProps) {
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
      className={`relative ${isDragging ? 'z-50 opacity-90' : ''}`}
    >
      <div className={isDragging ? 'scale-[1.03] shadow-2xl ring-1 ring-border-focus/30 rounded-xl transition-transform' : ''}>
        <BookCard {...bookCardProps} />
      </div>
      {/* Drag handle overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 cursor-grab rounded p-1 opacity-25 transition-opacity hover:opacity-70 active:cursor-grabbing"
      >
        <GripVertical className="size-4 text-white drop-shadow-md" />
      </div>
    </div>
  )
}
