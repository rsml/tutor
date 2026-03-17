import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { SeriesStackCard } from '@src/components/SeriesStackCard'

interface Book {
  id: string
  title: string
  hasCover?: boolean
  coverUpdatedAt?: string | null
}

interface SortableSeriesCardProps {
  id: string
  seriesName: string
  books: Book[]
  chaptersRead: number
  totalChapters: number
  onClick: () => void
}

export function SortableSeriesCard({ id, ...cardProps }: SortableSeriesCardProps) {
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
        <SeriesStackCard {...cardProps} />
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
