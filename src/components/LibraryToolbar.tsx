import { useEffect, useRef, useState } from 'react'
import { Search, X, SlidersHorizontal, LayoutGrid, List, Calendar, Type, Star, BarChart3, Clock, GripVertical } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { Input } from '@src/components/ui/input'
import { Badge } from '@src/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@src/components/ui/dropdown-menu'
import { FilterPopover } from '@src/components/FilterPopover'
import {
  useAppSelector,
  useAppDispatch,
  selectLibrarySort,
  selectLibraryView,
  selectLibraryFilters,
  setLibrarySort,
  setLibraryView,
  DEFAULT_LIBRARY_FILTERS,
  type LibrarySort,
} from '@src/store'
import { cn } from '@src/lib/utils'

interface LibraryToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  fullSearch: boolean
  onFullSearchChange: (isFull: boolean) => void
  resultCount?: number
  allTags: string[]
}

const SORT_OPTIONS: Array<{ field: LibrarySort['field']; label: string; icon: typeof Calendar }> = [
  { field: 'date', label: 'Date created', icon: Calendar },
  { field: 'title', label: 'Title (A\u2192Z)', icon: Type },
  { field: 'rating', label: 'Rating', icon: Star },
  { field: 'progress', label: 'Progress', icon: BarChart3 },
  { field: 'recent', label: 'Recently read', icon: Clock },
  { field: 'manual', label: 'Manual', icon: GripVertical },
]

export function LibraryToolbar({
  searchQuery,
  onSearchChange,
  fullSearch,
  onFullSearchChange,
  resultCount,
  allTags,
}: LibraryToolbarProps) {
  const dispatch = useAppDispatch()
  const sort = useAppSelector(selectLibrarySort)
  const view = useAppSelector(selectLibraryView)
  const filters = useAppSelector(selectLibraryFilters)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Cmd+F focuses the search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchExpanded(true)
        setTimeout(() => searchRef.current?.focus(), 100)
      }
      if (e.key === 'Escape' && searchExpanded && !searchQuery) {
        setSearchExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchExpanded, searchQuery])

  // Count active filters (non-default values)
  const activeFilterCount = [
    filters.status !== DEFAULT_LIBRARY_FILTERS.status,
    filters.tags.length > 0,
    filters.ratingMin != null,
    filters.datePreset !== DEFAULT_LIBRARY_FILTERS.datePreset,
  ].filter(Boolean).length

  const currentSortOption = SORT_OPTIONS.find(o => o.field === sort.field) ?? SORT_OPTIONS[0]
  const directionArrow = sort.direction === 'asc' ? '\u2191' : '\u2193'

  const handleSortSelect = (field: LibrarySort['field']) => {
    if (field === sort.field) {
      // Toggle direction
      dispatch(setLibrarySort({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' }))
    } else {
      // New field, default direction
      const defaultDir = field === 'title' ? 'asc' : 'desc'
      dispatch(setLibrarySort({ field, direction: defaultDir }))
    }
  }

  return (
    <div className="border-b border-border-default/50 bg-surface-base/90 backdrop-blur-sm px-8">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4 py-2">
        {/* Left zone: Search */}
        <div className="flex items-center gap-2">
          {!searchExpanded ? (
            <button
              onClick={() => {
                setSearchExpanded(true)
                setTimeout(() => searchRef.current?.focus(), 100)
              }}
              className="flex items-center justify-center size-7 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-raised/50 transition-colors"
              title="Search (⌘F)"
            >
              <Search className="size-4" />
            </button>
          ) : (
            <div ref={searchContainerRef} className="flex items-center gap-2">
              <div className="relative group animate-in fade-in slide-in-from-left-2 duration-200">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-content-muted pointer-events-none" />
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
                  onBlur={(e) => {
                    if (!searchQuery && !searchContainerRef.current?.contains(e.relatedTarget as Node)) {
                      setSearchExpanded(false)
                    }
                  }}
                  placeholder="Search books..."
                  className="w-[280px] pl-8 pr-8 h-7 text-xs bg-surface-raised/50 border-border-default/50 transition-all duration-200"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      onSearchChange('')
                      setSearchExpanded(false)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Full-text search toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none animate-in fade-in duration-200">
                <input
                  type="checkbox"
                  checked={fullSearch}
                  onChange={(e) => onFullSearchChange(e.target.checked)}
                  className="size-3.5 rounded border-border-default accent-[oklch(0.55_0.20_285)]"
                />
                <span className="text-xs text-content-muted whitespace-nowrap">Also search contents</span>
              </label>

              {/* Result count */}
              {searchQuery && resultCount != null && (
                <span className="text-xs text-content-muted whitespace-nowrap">
                  {resultCount} {resultCount === 1 ? 'result' : 'results'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right zone: Filter, Sort, View toggle */}
        <div className="flex items-center gap-1.5">
          {/* Filter popover */}
          <FilterPopover allTags={allTags} open={filterOpen} onOpenChange={setFilterOpen}>
            <Button
              variant="outline"
              size="sm"
              className="relative gap-1.5"
            >
              <SlidersHorizontal className="size-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="default" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </FilterPopover>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="gap-1.5" />}
            >
              {(() => { const Icon = currentSortOption.icon; return <Icon className="size-3.5" /> })()}
              <span className="text-xs">{currentSortOption.label} {directionArrow}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              {SORT_OPTIONS.map((option) => {
                const Icon = option.icon
                const isActive = sort.field === option.field
                return (
                  <DropdownMenuItem
                    key={option.field}
                    onClick={() => handleSortSelect(option.field)}
                    className={cn(isActive && 'bg-accent/50')}
                  >
                    <Icon className="size-3.5" />
                    <span>{option.label}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-content-muted">{directionArrow}</span>
                    )}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleSortSelect(sort.field)}
                className="text-xs text-content-muted"
              >
                Toggle direction ({sort.direction === 'asc' ? 'asc \u2192 desc' : 'desc \u2192 asc'})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View toggle */}
          <div className="flex rounded-lg border border-border-default/50 overflow-hidden">
            <button
              onClick={() => dispatch(setLibraryView('grid'))}
              className={cn(
                'flex items-center justify-center size-7 transition-colors',
                view === 'grid'
                  ? 'bg-surface-raised text-content-primary'
                  : 'text-content-muted hover:text-content-primary hover:bg-surface-raised/50',
              )}
              title="Grid view"
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              onClick={() => dispatch(setLibraryView('list'))}
              className={cn(
                'flex items-center justify-center size-7 transition-colors border-l border-border-default/50',
                view === 'list'
                  ? 'bg-surface-raised text-content-primary'
                  : 'text-content-muted hover:text-content-primary hover:bg-surface-raised/50',
              )}
              title="List view"
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
