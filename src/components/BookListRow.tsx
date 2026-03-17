import { Badge } from '@src/components/ui/badge'
import { StarRating } from '@src/components/StarRating'

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

interface BookListRowProps {
  book: Book
  chaptersRead: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'

  // Use month + day format for anything older
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const sameYear = date.getFullYear() === now.getFullYear()
  if (sameYear) {
    return `${months[date.getMonth()]} ${date.getDate()}`
  }
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

export function BookListRow({ book, chaptersRead, onClick, onContextMenu }: BookListRowProps) {
  const progress = book.totalChapters > 0 ? chaptersRead / book.totalChapters : 0
  const isGenerating = book.status === 'generating_toc' || book.status === 'generating'
  const maxVisibleTags = 3

  return (
    <div
      className={`group flex items-center gap-4 px-4 py-2.5 transition-colors ${
        isGenerating
          ? 'cursor-default opacity-60'
          : 'cursor-pointer hover:bg-surface-raised/50'
      }`}
      onClick={isGenerating ? undefined : onClick}
      onContextMenu={isGenerating ? undefined : onContextMenu}
    >
      {/* Title column — flex: 2 */}
      <div className="flex-[2] min-w-0">
        <p className="truncate text-sm font-medium text-content-primary">
          {book.title}
        </p>
        {book.subtitle && (
          <p className="truncate text-xs text-content-muted mt-0.5">
            {book.subtitle}
          </p>
        )}
      </div>

      {/* Tags column — fixed width */}
      <div className="w-[160px] shrink-0 flex items-center gap-1 overflow-hidden">
        {book.tags.slice(0, maxVisibleTags).map(tag => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 shrink-0"
          >
            {tag}
          </Badge>
        ))}
        {book.tags.length > maxVisibleTags && (
          <span className="text-[10px] text-content-faint shrink-0">
            +{book.tags.length - maxVisibleTags}
          </span>
        )}
      </div>

      {/* Progress column — fixed width */}
      <div className="w-[120px] shrink-0 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-border-default/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-content-muted/50 transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xs text-content-muted tabular-nums whitespace-nowrap">
          {chaptersRead}/{book.totalChapters}
        </span>
      </div>

      {/* Created column — fixed width */}
      <div className="w-[100px] shrink-0 text-right">
        <span className="text-xs text-content-muted">
          {formatRelativeDate(book.createdAt)}
        </span>
      </div>

      {/* Rating column — fixed width */}
      <div className="w-[90px] shrink-0 flex justify-end">
        {book.rating != null && book.rating > 0 ? (
          <StarRating value={book.rating} readonly size="sm" />
        ) : (
          <span className="text-xs text-content-faint">--</span>
        )}
      </div>
    </div>
  )
}
