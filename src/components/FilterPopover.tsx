import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@src/components/ui/popover'
import { Separator } from '@src/components/ui/separator'
import {
  useAppSelector,
  useAppDispatch,
  selectLibraryFilters,
  setLibraryFilters,
  type LibraryFilters,
} from '@src/store'
import { cn } from '@src/lib/utils'

interface FilterPopoverProps {
  allTags: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactElement // PopoverTrigger render element
}

const STATUS_OPTIONS: Array<{ value: LibraryFilters['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unfinished', label: 'Unfinished' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'not-started', label: 'Not Started' },
  { value: 'finished', label: 'Finished' },
]

const RATING_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Any' },
  { value: 3, label: '\u2605 3+' },
  { value: 4, label: '\u2605 4+' },
  { value: 5, label: '\u2605 5' },
]

const DATE_OPTIONS: Array<{ value: LibraryFilters['datePreset']; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: '3months', label: 'Last 3 months' },
]

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-[oklch(0.55_0.20_285)] text-white'
          : 'bg-surface-raised/50 text-content-muted hover:text-content-primary hover:bg-surface-raised',
      )}
    >
      {children}
    </button>
  )
}

function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-[oklch(0.55_0.20_285)]/15 border-[oklch(0.55_0.20_285)]/40 text-[oklch(0.55_0.20_285)]'
          : 'bg-surface-raised/30 border-border-default/50 text-content-muted hover:text-content-primary hover:border-border-default',
      )}
    >
      {tag}
    </button>
  )
}

export function FilterPopover({ allTags, open, onOpenChange, children }: FilterPopoverProps) {
  const dispatch = useAppDispatch()
  const filters = useAppSelector(selectLibraryFilters)

  const handleStatusChange = (status: LibraryFilters['status']) => {
    dispatch(setLibraryFilters({ status }))
  }

  const handleTagToggle = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag]
    dispatch(setLibraryFilters({ tags: newTags }))
  }

  const handleRatingChange = (ratingMin: number | null) => {
    dispatch(setLibraryFilters({ ratingMin }))
  }

  const handleDateChange = (datePreset: LibraryFilters['datePreset']) => {
    dispatch(setLibraryFilters({ datePreset }))
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children} />
      <PopoverContent align="end" sideOffset={4} className="w-80 p-0">
        <div className="p-3 space-y-3">
          {/* Status section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-2">
              Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(option => (
                <ToggleButton
                  key={option.value}
                  active={filters.status === option.value}
                  onClick={() => handleStatusChange(option.value)}
                >
                  {option.label}
                </ToggleButton>
              ))}
            </div>
          </div>

          <Separator />

          {/* Tags section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-2">
              Tags
            </div>
            {allTags.length === 0 ? (
              <p className="text-xs text-content-muted/60 italic">No tags yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(tag => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    active={filters.tags.includes(tag)}
                    onClick={() => handleTagToggle(tag)}
                  />
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Rating section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-2">
              Rating
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RATING_OPTIONS.map(option => (
                <ToggleButton
                  key={option.label}
                  active={filters.ratingMin === option.value}
                  onClick={() => handleRatingChange(option.value)}
                >
                  {option.label}
                </ToggleButton>
              ))}
            </div>
          </div>

          <Separator />

          {/* Created section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-2">
              Created
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DATE_OPTIONS.map(option => (
                <ToggleButton
                  key={option.value}
                  active={filters.datePreset === option.value}
                  onClick={() => handleDateChange(option.value)}
                >
                  {option.label}
                </ToggleButton>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
