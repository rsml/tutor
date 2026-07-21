import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@client/lib/toast'
import { Plus, BookOpen, X, FileDown, Pencil, Star, Tags, Library, ClipboardCheck, Eye, Image, Zap, Download, Trash2, RotateCcw, Headphones, FolderOpen } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@client/components/ui/button'
import { Badge } from '@client/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/components/ui/dialog'
import { BookCard } from '@client/features/library/components/BookCard'
import { SortableBookCard } from '@client/features/library/components/SortableBookCard'
import { SortableSeriesCard } from '@client/features/library/components/SortableSeriesCard'
import { LibraryToolbar } from '@client/features/library/components/LibraryToolbar'
import { StarRating } from '@client/features/reader/components/StarRating'
import { NoiseOverlay } from '@client/components/NoiseOverlay'
import { SettingsMenu } from '@client/features/settings/components/SettingsMenu'
import { WizardModal } from '@client/features/creation/components/WizardModal'
import { BookOverviewModal } from '@client/features/library/dialogs/BookOverviewModal'
import { CoverGenerationModal } from '@client/features/library/dialogs/CoverGenerationModal'
import { GenerateAllModal } from '@client/features/library/dialogs/GenerateAllModal'
import { BackgroundTasksFooter } from '@client/features/library/components/BackgroundTasksFooter'
import { EditTagsDialog } from '@client/features/library/dialogs/EditTagsDialog'
import { ImportPreviewDialog } from '@client/features/library/dialogs/ImportPreviewDialog'
import { SetSeriesDialog } from '@client/features/library/dialogs/SetSeriesDialog'
import { AudiobookDownloadModal } from '@client/features/audiobook/components/AudiobookDownloadModal'
import { AudiobookVoiceModal } from '@client/features/audiobook/components/AudiobookVoiceModal'
import { AudiobookRegenerateConfirmModal } from '@client/features/audiobook/components/AudiobookRegenerateConfirmModal'
import { SeriesStackCard } from '@client/features/library/components/SeriesStackCard'
import { BookListView } from '@client/features/library/components/BookListView'
import { BookListRow } from '@client/features/library/components/BookListRow'
import { SeriesView } from '@client/features/library/components/SeriesView'
import { useLibrarySearch } from '@client/features/library/hooks/useLibrarySearch'
import {
  useAppSelector,
  useAppDispatch,
  selectHasApiKey,
  selectFontSize,
  selectLibraryFilters,
  selectLibrarySort,
  selectLibraryView,
  clearLibraryFilters,
  setLibraryFilters,
  selectFunctionModel,
  DEFAULT_LIBRARY_FILTERS,
} from '@client/store'
import {
  confirmEpubImport,
  coverUrl,
  deleteBook,
  exportEpub,
  generateAllChapters,
  previewEpubImport,
  rateBook,
  resetBook,
  updateBook,
} from '@client/api'
import { isComplete } from '@shared/book-status'
import type { LibraryBook, EpubPreview } from '@shared/responses'
import type { useBackgroundTaskEffects } from '@client/features/library/hooks/useBackgroundTaskEffects'

/**
 * Everything the library screen owns: the grid, the list, the series
 * drill-in, drag-and-drop manual reordering, search and filtering, and every
 * dialog and context menu a book or series can open. This is deliberately
 * the one file in this feature allowed past the usual 500-line ceiling —
 * splitting it further is a later task's job (a dialog-state reducer),
 * not this one's.
 */

/** The audiobook install/generate flow. Owned by App.tsx because a narrator
 * install can finish minutes after it starts, often while this page has been
 * unmounted in favor of the reader — see useBackgroundTaskEffects for why
 * that forces the subscription (and this state) to live above this page. */
type AudiobookEffects = ReturnType<typeof useBackgroundTaskEffects>

export interface LibraryPageProps {
  books: LibraryBook[]
  setBooks: Dispatch<SetStateAction<LibraryBook[]>>
  hasLoaded: boolean
  fetchBooks: () => Promise<void>
  serverAvailable: boolean
  onOpenBook: (book: LibraryBook) => void
  onCreateBook: (topic: string, details: string, chapterCount: number, coverPrompt?: string) => void
  onQuizReview: (book: LibraryBook) => void
  onReviewProgress: () => void
  audiobook: AudiobookEffects
}

export function LibraryPage({
  books,
  setBooks,
  hasLoaded,
  fetchBooks,
  serverAvailable,
  onOpenBook,
  onCreateBook,
  onQuizReview,
  onReviewProgress,
  audiobook,
}: LibraryPageProps) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ book: LibraryBook; x: number; y: number } | null>(null)
  const [renameDialog, setRenameDialog] = useState<{ book: LibraryBook; title: string; subtitle: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ book: LibraryBook; input: string } | null>(null)
  const [resetDialog, setResetDialog] = useState<{ book: LibraryBook; input: string } | null>(null)
  const [rateDialog, setRateDialog] = useState<{ book: LibraryBook; rating: number } | null>(null)
  const [overviewBook, setOverviewBook] = useState<LibraryBook | null>(null)
  const [coverModal, setCoverModal] = useState<{ book: LibraryBook } | null>(null)
  const [generateAllModal, setGenerateAllModal] = useState<{ taskId: string; book: LibraryBook } | null>(null)
  const [editTagsDialog, setEditTagsDialog] = useState<{ book: LibraryBook } | null>(null)
  const [setSeriesDialog, setSetSeriesDialog] = useState<{ book: LibraryBook } | null>(null)
  const [seriesContextMenu, setSeriesContextMenu] = useState<{ seriesName: string; books: LibraryBook[]; x: number; y: number } | null>(null)
  const [renameSeriesDialog, setRenameSeriesDialog] = useState<{ seriesName: string; books: LibraryBook[]; newName: string } | null>(null)
  const [mutating, setMutating] = useState(false)
  const [importPreview, setImportPreview] = useState<EpubPreview | null>(null)
  const [importFileBase64, setImportFileBase64] = useState('')
  const [importFilename, setImportFilename] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  // Which series the grid has drilled into, or null for the main grid/list.
  // Scoped to this page rather than the app-wide view — App.tsx never needs
  // to know the difference between browsing the grid and browsing a series.
  const [activeSeriesName, setActiveSeriesName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKey)
  const fontSize = useAppSelector(selectFontSize)
  const libraryFilters = useAppSelector(selectLibraryFilters)
  const librarySort = useAppSelector(selectLibrarySort)
  const libraryView = useAppSelector(selectLibraryView)
  const readingPositions = useAppSelector(s => s.readingProgress.positions)
  const { provider: genProvider, model: genModel } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))
  const { searchQuery, setSearchQuery, fullSearch, setFullSearch, deferredSearch, contentSearchResults } = useLibrarySearch()

  // Close context menu on any click or Escape
  useEffect(() => {
    if (!contextMenu && !seriesContextMenu) return
    const close = () => { setContextMenu(null); setSeriesContextMenu(null) }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, seriesContextMenu])

  const handleNewBook = () => {
    if (!hasApiKey) {
      setApiKeyDialogOpen(true)
    } else {
      setWizardOpen(true)
    }
  }

  const handleGenerateAll = async (book: LibraryBook) => {
    try {
      const { taskId } = await generateAllChapters(book.id, { model: genModel, provider: genProvider, quizModel, quizProvider })
      setGenerateAllModal({ taskId, book })
    } catch (err) {
      toast.error('Failed to start generation: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleExportEpub = async (book: LibraryBook) => {
    try {
      const data = await exportEpub(book.id)
      if (data.cached) {
        // Direct download
        await audiobook.downloadEpubFile(book)
      } else {
        // Background task created — will auto-download on completion
        toast.success('EPUB export started — check background tasks')
      }
    } catch (err) {
      toast.error('Failed to export EPUB: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleRename = async () => {
    if (!renameDialog) return
    const trimmed = renameDialog.title.trim()
    if (!trimmed) return
    setMutating(true)
    try {
      await updateBook(renameDialog.book.id, { title: trimmed, subtitle: renameDialog.subtitle.trim() || undefined })
      await fetchBooks()
    } catch {
      toast.error('Failed to rename book — server unreachable')
    } finally {
      setMutating(false)
    }
    setRenameDialog(null)
  }

  const handleRenameSeries = async () => {
    if (!renameSeriesDialog) return
    const trimmed = renameSeriesDialog.newName.trim()
    if (!trimmed) return
    setMutating(true)
    try {
      await Promise.all(
        renameSeriesDialog.books.map(book => updateBook(book.id, { series: trimmed }))
      )
      await fetchBooks()
    } catch {
      toast.error('Failed to rename series — server unreachable')
    } finally {
      setMutating(false)
    }
    setRenameSeriesDialog(null)
  }

  const handleDelete = async () => {
    if (!deleteDialog || deleteDialog.input.toLowerCase() !== 'delete') return
    setMutating(true)
    try {
      await deleteBook(deleteDialog.book.id)
      await fetchBooks()
    } catch {
      toast.error('Failed to delete book — server unreachable')
    } finally {
      setMutating(false)
    }
    setDeleteDialog(null)
  }

  const handleReset = async () => {
    if (!resetDialog || resetDialog.input.toLowerCase() !== 'reset') return
    setMutating(true)
    try {
      await resetBook(resetDialog.book.id)
      await fetchBooks()
    } catch {
      toast.error('Failed to reset book — server unreachable')
    } finally {
      setMutating(false)
    }
    setResetDialog(null)
  }

  const handleSaveTags = async (bookId: string, tags: string[]) => {
    try {
      await updateBook(bookId, { tags })
      await fetchBooks()
    } catch {
      toast.error('Failed to save tags -- server unreachable')
    }
    setEditTagsDialog(null)
  }

  const handleSaveSeries = async (bookId: string, series: string | null, seriesOrder: number | null) => {
    try {
      await updateBook(bookId, { series, seriesOrder })
      await fetchBooks()
    } catch {
      toast.error('Failed to save series -- server unreachable')
    }
    setSetSeriesDialog(null)
  }

  // --- EPUB Import ---

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data URL prefix: "data:application/epub+zip;base64,..."
        const base64 = result.includes(',') ? result.split(',')[1] : result
        resolve(base64)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const handleImportFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.epub')) {
      toast.error('Only .epub files are supported')
      return
    }
    try {
      const base64 = await readFileAsBase64(file)
      setImportFileBase64(base64)
      setImportFilename(file.name)

      const preview = await previewEpubImport({ base64, filename: file.name })
      setImportPreview(preview)
      setImportDialogOpen(true)
    } catch (err) {
      toast.error('Failed to preview EPUB: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleImportConfirm = async (tags: string[], series: string | null, seriesOrder: number | null) => {
    try {
      await confirmEpubImport({
        base64: importFileBase64,
        filename: importFilename,
        tags: tags.length > 0 ? tags : undefined,
        series: series ?? undefined,
        seriesOrder: seriesOrder ?? undefined,
      })
      setImportDialogOpen(false)
      setImportPreview(null)
      setImportFileBase64('')
      setImportFilename('')
      toast.success('Book imported successfully')
      await fetchBooks()
    } catch (err) {
      toast.error('Failed to import EPUB: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImportFile(file)
    // Reset file input so the same file can be selected again
    e.target.value = ''
  }

  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  // Track the previous sort field to detect transitions to manual mode
  const prevSortFieldRef = useRef(librarySort.field)

  // Initialize sortOrder on first switch to manual mode
  useEffect(() => {
    const wasManual = prevSortFieldRef.current === 'manual'
    prevSortFieldRef.current = librarySort.field

    if (librarySort.field !== 'manual' || wasManual) return
    // Switching to manual — assign integer sortOrders if books don't have them yet
    const needsInit = books.some(b => b.sortOrder == null)
    if (!needsInit) return

    // Use the current display order (filteredBooks would be ideal, but books is fine as a base)
    const booksToInit = [...books]
    // They're in whatever order they were before — assign integers
    const patches = booksToInit.map((book, index) => {
      if (book.sortOrder != null) return null
      return updateBook(book.id, { sortOrder: index })
    }).filter(Boolean)

    if (patches.length > 0) {
      Promise.all(patches).then(() => fetchBooks()).catch(() => {})
    }
  }, [librarySort.field, books, fetchBooks])

  const bookIds = useMemo(() => new Set(books.map(b => b.id)), [books])

  const classifyBook = useCallback((book: LibraryBook): 'finished' | 'in-progress' | 'not-started' => {
    if (isComplete(book.status)) return 'finished'
    if (readingPositions[book.id] != null) return 'in-progress'
    return 'not-started'
  }, [readingPositions])

  // Compute allTags from all books
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const book of books) {
      for (const tag of book.tags) tagSet.add(tag)
    }
    return [...tagSet].sort()
  }, [books])

  // Compute all series names from all books
  const allSeriesNames = useMemo(() => {
    const seriesSet = new Set<string>()
    for (const book of books) {
      if (book.series) seriesSet.add(book.series)
    }
    return [...seriesSet].sort()
  }, [books])

  const { filteredBooks, searchResultCount } = useMemo(() => {
    const bookClasses = new Map(books.map(b => [b.id, classifyBook(b)]))

    // --- Filter logic ---
    let filtered = [...books]

    // Status filter
    if (libraryFilters.status === 'unfinished') {
      filtered = filtered.filter(b => bookClasses.get(b.id) !== 'finished')
    } else if (libraryFilters.status !== 'all') {
      filtered = filtered.filter(b => bookClasses.get(b.id) === libraryFilters.status)
    }

    // Tags filter (OR logic)
    if (libraryFilters.tags.length > 0) {
      filtered = filtered.filter(b =>
        b.tags.some(tag => libraryFilters.tags.includes(tag))
      )
    }

    // Rating filter
    if (libraryFilters.ratingMin != null) {
      filtered = filtered.filter(b =>
        (b.rating ?? 0) >= libraryFilters.ratingMin!
      )
    }

    // Date preset filter
    if (libraryFilters.datePreset !== 'any') {
      const now = Date.now()
      const days = libraryFilters.datePreset === 'week' ? 7
        : libraryFilters.datePreset === 'month' ? 30
        : 90 // 3months
      const cutoff = now - days * 24 * 60 * 60 * 1000
      filtered = filtered.filter(b => new Date(b.createdAt).getTime() >= cutoff)
    }

    // Client-side search filtering (title + subtitle + optional content search results)
    const query = deferredSearch.trim().toLowerCase()
    if (query) {
      filtered = filtered.filter(b =>
        b.title.toLowerCase().includes(query) ||
        (b.subtitle?.toLowerCase().includes(query) ?? false) ||
        (fullSearch && contentSearchResults.has(b.id))
      )
    }

    // --- Sort logic ---
    const dir = librarySort.direction === 'asc' ? 1 : -1

    const compareFn = (a: LibraryBook, b: LibraryBook): number => {
      switch (librarySort.field) {
        case 'date':
          return dir * (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
        case 'title':
          return dir * a.title.localeCompare(b.title)
        case 'rating': {
          const ra = a.rating ?? -1
          const rb = b.rating ?? -1
          // Unrated goes last regardless of direction
          if (ra < 0 && rb >= 0) return 1
          if (rb < 0 && ra >= 0) return -1
          return dir * (ra - rb)
        }
        case 'progress': {
          const pa = a.totalChapters > 0
            ? ((readingPositions[a.id] != null ? readingPositions[a.id].chapter + 1 : a.chaptersRead) / a.totalChapters)
            : 0
          const pb = b.totalChapters > 0
            ? ((readingPositions[b.id] != null ? readingPositions[b.id].chapter + 1 : b.chaptersRead) / b.totalChapters)
            : 0
          return dir * (pa - pb)
        }
        case 'recent': {
          const la = readingPositions[a.id]?.lastReadAt ?? ''
          const lb = readingPositions[b.id]?.lastReadAt ?? ''
          // Never-read goes last regardless of direction
          if (!la && lb) return 1
          if (!lb && la) return -1
          return dir * (la < lb ? -1 : la > lb ? 1 : 0)
        }
        case 'manual': {
          const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
          const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
          // Undefined sortOrder goes last regardless of direction
          if (sa === Number.MAX_SAFE_INTEGER && sb !== Number.MAX_SAFE_INTEGER) return 1
          if (sb === Number.MAX_SAFE_INTEGER && sa !== Number.MAX_SAFE_INTEGER) return -1
          return dir * (sa - sb)
        }
        default:
          return 0
      }
    }

    // Group series books together: find lead book position, then insert series members adjacent
    const seriesGroups = new Map<string, LibraryBook[]>()
    const nonSeries: LibraryBook[] = []
    for (const book of filtered) {
      if (book.series) {
        const group = seriesGroups.get(book.series) ?? []
        group.push(book)
        seriesGroups.set(book.series, group)
      } else {
        nonSeries.push(book)
      }
    }

    // Sort non-series books
    nonSeries.sort(compareFn)

    // Sort within each series group by seriesOrder
    for (const group of seriesGroups.values()) {
      group.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))
    }

    if (seriesGroups.size === 0) {
      // No series — just return sorted
      return {
        filteredBooks: nonSeries,
        searchResultCount: query ? nonSeries.length : undefined,
      }
    }

    // Merge: for each series, find where its lead book would rank among nonSeries+leads
    // Create a combined list of non-series books + lead books (first in series by seriesOrder)
    const leads = new Map<string, LibraryBook>()
    for (const [series, group] of seriesGroups) {
      leads.set(series, group[0])
    }

    const allLeadsAndNonSeries = [...nonSeries, ...leads.values()]
    allLeadsAndNonSeries.sort(compareFn)

    // Now expand: replace each lead with the full series group
    const sorted: LibraryBook[] = []
    const insertedSeries = new Set<string>()
    for (const book of allLeadsAndNonSeries) {
      if (book.series && !insertedSeries.has(book.series)) {
        insertedSeries.add(book.series)
        sorted.push(...(seriesGroups.get(book.series) ?? [book]))
      } else if (!book.series) {
        sorted.push(book)
      }
    }

    return {
      filteredBooks: sorted,
      searchResultCount: query ? sorted.length : undefined,
    }
  }, [books, libraryFilters, librarySort, classifyBook, deferredSearch, readingPositions, fullSearch, contentSearchResults])

  // Pre-group books by series in a single pass so the grid/list loops don't
  // run `filteredBooks.filter(...)` for each series encountered (O(n·s) →
  // O(n)). Also gives a stable array reference per series across renders,
  // which lets memoized series cards skip work when only unrelated state moves.
  const seriesGroups = useMemo(() => {
    const groups = new Map<string, LibraryBook[]>()
    for (const book of filteredBooks) {
      if (!book.series) continue
      const list = groups.get(book.series)
      if (list) list.push(book)
      else groups.set(book.series, [book])
    }
    return groups
  }, [filteredBooks])

  // Drag-and-drop handler for manual sort mode
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Build the current grid items list (same structure as rendered)
    const renderedSeries = new Set<string>()
    const items: Array<{ id: string; sortOrder: number }> = []

    for (const book of filteredBooks) {
      if (book.series) {
        if (renderedSeries.has(book.series)) continue
        renderedSeries.add(book.series)
        items.push({ id: `series-${book.series}`, sortOrder: book.sortOrder ?? 0 })
      } else {
        items.push({ id: book.id, sortOrder: book.sortOrder ?? 0 })
      }
    }

    const oldIndex = items.findIndex(it => it.id === String(active.id))
    const newIndex = items.findIndex(it => it.id === String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    // Calculate the new sortOrder based on the target position's neighbors
    // In desc mode, higher sortOrder = earlier position, so edge fallbacks must be flipped
    const isDesc = librarySort.direction === 'desc'
    let newSortOrder: number
    if (oldIndex < newIndex) {
      // Moving forward: place after the item at newIndex
      const after = items[newIndex].sortOrder
      const next = newIndex + 1 < items.length ? items[newIndex + 1].sortOrder : after + (isDesc ? -2 : 2)
      newSortOrder = (after + next) / 2
    } else {
      // Moving backward: place before the item at newIndex
      const before = items[newIndex].sortOrder
      const prev = newIndex - 1 >= 0 ? items[newIndex - 1].sortOrder : before + (isDesc ? 2 : -2)
      newSortOrder = (prev + before) / 2
    }

    // Determine which book(s) to PATCH
    const draggedItemId = String(active.id)
    const bookIdsToPatch: string[] = []

    if (draggedItemId.startsWith('series-')) {
      const sName = draggedItemId.slice(7)
      const sBooks = books.filter(b => b.series === sName)
      bookIdsToPatch.push(...sBooks.map(b => b.id))
    } else {
      bookIdsToPatch.push(draggedItemId)
    }

    // Optimistically update state so the card doesn't jump on release
    setBooks(prev => prev.map(b =>
      bookIdsToPatch.includes(b.id) ? { ...b, sortOrder: newSortOrder } : b
    ))

    try {
      await Promise.all(bookIdsToPatch.map(bookId => updateBook(bookId, { sortOrder: newSortOrder })))

      // Check if rebalancing is needed — update the item in the items array
      const updatedItems = items.map(it => it.id === draggedItemId ? { ...it, sortOrder: newSortOrder } : it)
      updatedItems.sort((a, b) => a.sortOrder - b.sortOrder)
      let needsRebalance = false
      for (let i = 1; i < updatedItems.length; i++) {
        if (Math.abs(updatedItems[i].sortOrder - updatedItems[i - 1].sortOrder) < 1e-10) {
          needsRebalance = true
          break
        }
      }

      if (needsRebalance) {
        const rebalancePatches = updatedItems.map((item, index) => {
          if (item.id.startsWith('series-')) {
            const sName = item.id.slice(7)
            const sBooks = books.filter(b => b.series === sName)
            return sBooks.map(b => updateBook(b.id, { sortOrder: index }))
          } else {
            return [updateBook(item.id, { sortOrder: index })]
          }
        }).flat()

        await Promise.all(rebalancePatches)
      }

      // Background sync — no need to await since we already updated optimistically
      fetchBooks()
    } catch {
      toast.error('Failed to reorder — server unreachable')
      fetchBooks() // Revert optimistic update on failure
    }
  }, [filteredBooks, books, fetchBooks, librarySort.direction, setBooks])

  // Compute active filter chips for display
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    if (libraryFilters.status !== DEFAULT_LIBRARY_FILTERS.status) {
      const labels: Record<string, string> = {
        'in-progress': 'In Progress',
        'not-started': 'Not Started',
        'finished': 'Finished',
        'unfinished': 'Unfinished',
      }
      chips.push({
        key: 'status',
        label: `Status: ${labels[libraryFilters.status] ?? libraryFilters.status}`,
        onRemove: () => dispatch(setLibraryFilters({ status: DEFAULT_LIBRARY_FILTERS.status })),
      })
    }
    for (const tag of libraryFilters.tags) {
      chips.push({
        key: `tag-${tag}`,
        label: `Tag: ${tag}`,
        onRemove: () => dispatch(setLibraryFilters({ tags: libraryFilters.tags.filter(t => t !== tag) })),
      })
    }
    if (libraryFilters.ratingMin != null) {
      chips.push({
        key: 'rating',
        label: `Rating: ${'★'.repeat(libraryFilters.ratingMin)}${libraryFilters.ratingMin < 5 ? '+' : ''}`,
        onRemove: () => dispatch(setLibraryFilters({ ratingMin: DEFAULT_LIBRARY_FILTERS.ratingMin })),
      })
    }
    if (libraryFilters.datePreset !== DEFAULT_LIBRARY_FILTERS.datePreset) {
      const labels: Record<string, string> = {
        week: 'Last week',
        month: 'Last month',
        '3months': 'Last 3 months',
      }
      chips.push({
        key: 'date',
        label: `Created: ${labels[libraryFilters.datePreset] ?? libraryFilters.datePreset}`,
        onRemove: () => dispatch(setLibraryFilters({ datePreset: DEFAULT_LIBRARY_FILTERS.datePreset })),
      })
    }
    return chips
  }, [libraryFilters, dispatch])

  // --- Shared render helpers for context menu & dialogs ---
  const renderContextMenu = () => contextMenu && (
    <div
      ref={(el) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let x = contextMenu.x
        let y = contextMenu.y
        if (x + rect.width > vw - 8) x = contextMenu.x - rect.width
        if (y + rect.height > vh - 8) y = contextMenu.y - rect.height
        if (x < 8) x = 8
        if (y < 8) y = 8
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }}
      className="fixed z-50 w-fit rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
      style={{ left: -9999, top: -9999 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Edit group */}
      <button
        onClick={() => {
          setRenameDialog({ book: contextMenu.book, title: contextMenu.book.title, subtitle: contextMenu.book.subtitle ?? '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Pencil className="size-3.5 text-content-muted shrink-0" />
        Rename
      </button>
      <button
        onClick={() => {
          setRateDialog({ book: contextMenu.book, rating: contextMenu.book.rating ?? 0 })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Star className="size-3.5 text-content-muted shrink-0" />
        Rate
      </button>
      <button
        onClick={() => {
          setEditTagsDialog({ book: contextMenu.book })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Tags className="size-3.5 text-content-muted shrink-0" />
        Edit Tags
      </button>
      <button
        onClick={() => {
          setSetSeriesDialog({ book: contextMenu.book })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Library className="size-3.5 text-content-muted shrink-0" />
        Set Series
      </button>
      <div className="my-1 h-px bg-border-default/50" />
      {/* View group */}
      <button
        onClick={() => {
          setOverviewBook(contextMenu.book)
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Eye className="size-3.5 text-content-muted shrink-0" />
        Book Overview
      </button>
      <button
        onClick={() => {
          onQuizReview(contextMenu.book)
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <ClipboardCheck className="size-3.5 text-content-muted shrink-0" />
        Quiz Review
      </button>
      <div className="my-1 h-px bg-border-default/50" />
      {/* Actions group */}
      <button
        onClick={() => {
          setCoverModal({ book: contextMenu.book })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Image className="size-3.5 text-content-muted shrink-0" />
        Edit Cover
      </button>
      <button
        onClick={() => {
          handleGenerateAll(contextMenu.book)
          setContextMenu(null)
        }}
        disabled={contextMenu.book.generatedUpTo >= contextMenu.book.totalChapters}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        <Zap className="size-3.5 text-content-muted shrink-0" />
        Generate All Chapters
      </button>
      <button
        onClick={() => {
          handleExportEpub(contextMenu.book)
          setContextMenu(null)
        }}
        disabled={contextMenu.book.generatedUpTo < contextMenu.book.totalChapters}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        <Download className="size-3.5 text-content-muted shrink-0" />
        Export EPUB
      </button>
      {contextMenu.book.generatedUpTo < contextMenu.book.totalChapters ? (
        <button
          disabled
          className="flex flex-col items-start gap-0 w-full px-3 py-1.5 text-left text-sm text-content-primary disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <div className="flex items-center gap-2">
            <Headphones className="size-3.5 text-content-muted shrink-0" />
            Generate audiobook
          </div>
          <span className="ml-5 pl-0.5 text-xs text-content-muted">Finish generating chapters first</span>
        </button>
      ) : (audiobook.audiobookExists.get(contextMenu.book.id) === true || contextMenu.book.hasAudiobook === true) ? (
        <>
          <button
            onClick={() => { audiobook.handleShowAudiobook(contextMenu.book); setContextMenu(null) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            <FolderOpen className="size-3.5 text-content-muted shrink-0" />
            Show audiobook
          </button>
          <button
            onClick={() => { audiobook.setRegenerateAudiobookConfirm({ book: contextMenu.book }); setContextMenu(null) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            <Headphones className="size-3.5 text-content-muted shrink-0" />
            Generate new audiobook…
          </button>
        </>
      ) : (
        <button
          onClick={() => { audiobook.handleGenerateAudiobook(contextMenu.book); setContextMenu(null) }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
        >
          <Headphones className="size-3.5 text-content-muted shrink-0" />
          Generate audiobook
        </button>
      )}
      <div className="my-1 h-px bg-border-default/50" />
      {/* Danger group */}
      <button
        onClick={() => {
          setResetDialog({ book: contextMenu.book, input: '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <RotateCcw className="size-3.5 shrink-0" />
        Reset
      </button>
      <button
        onClick={() => {
          setDeleteDialog({ book: contextMenu.book, input: '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Trash2 className="size-3.5 shrink-0" />
        Delete
      </button>
    </div>
  )

  const renderSeriesContextMenu = () => seriesContextMenu && (
    <div
      ref={(el) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let x = seriesContextMenu.x
        let y = seriesContextMenu.y
        if (x + rect.width > vw - 8) x = seriesContextMenu.x - rect.width
        if (y + rect.height > vh - 8) y = seriesContextMenu.y - rect.height
        if (x < 8) x = 8
        if (y < 8) y = 8
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }}
      className="fixed z-50 w-fit rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
      style={{ left: -9999, top: -9999 }}
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => {
          setRenameSeriesDialog({ seriesName: seriesContextMenu.seriesName, books: seriesContextMenu.books, newName: seriesContextMenu.seriesName })
          setSeriesContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Pencil className="size-3.5 text-content-muted shrink-0" />
        Rename Series
      </button>
    </div>
  )

  const renderDialogs = () => (
    <>
      {/* Rename dialog */}
      <Dialog open={!!renameDialog} onOpenChange={open => { if (!open) setRenameDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Book</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Title</label>
              <input
                value={renameDialog?.title ?? ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, title: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Subtitle</label>
              <input
                value={renameDialog?.subtitle ?? ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, subtitle: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                placeholder="Optional subtitle"
                className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameDialog?.title.trim() || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Series dialog */}
      <Dialog open={!!renameSeriesDialog} onOpenChange={open => { if (!open) setRenameSeriesDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Series</DialogTitle>
            <DialogDescription>
              This will update the series name on {renameSeriesDialog?.books.length ?? 0} {(renameSeriesDialog?.books.length ?? 0) === 1 ? 'book' : 'books'}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Series Name</label>
            <input
              value={renameSeriesDialog?.newName ?? ''}
              onChange={e => setRenameSeriesDialog(prev => prev ? { ...prev, newName: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && handleRenameSeries()}
              className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSeriesDialog(null)}>Cancel</Button>
            <Button onClick={handleRenameSeries} disabled={!renameSeriesDialog?.newName.trim() || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteDialog?.book.title}&rdquo;? Type <strong>delete</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={deleteDialog?.input ?? ''}
            onChange={e => setDeleteDialog(prev => prev ? { ...prev, input: e.target.value } : null)}
            onKeyDown={e => e.key === 'Enter' && deleteDialog?.input.toLowerCase() === 'delete' && handleDelete()}
            placeholder="delete"
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
            autoCapitalize="off"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog?.input.toLowerCase() !== 'delete' || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset &ldquo;{resetDialog?.book.title}&rdquo;? This permanently clears your reading progress, rating, feedback, and quiz answers. The chapters and table of contents will remain. Type <strong>reset</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={resetDialog?.input ?? ''}
            onChange={e => setResetDialog(prev => prev ? { ...prev, input: e.target.value } : null)}
            onKeyDown={e => e.key === 'Enter' && resetDialog?.input.toLowerCase() === 'reset' && handleReset()}
            placeholder="reset"
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
            autoCapitalize="off"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetDialog?.input.toLowerCase() !== 'reset' || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate dialog */}
      <Dialog open={!!rateDialog} onOpenChange={open => { if (!open) setRateDialog(null) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rate Book</DialogTitle>
            <DialogDescription>{rateDialog?.book.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-4">
            <StarRating
              value={rateDialog?.rating ?? 0}
              onChange={val => setRateDialog(prev => prev ? { ...prev, rating: val } : null)}
              size="lg"
            />
            {rateDialog && rateDialog.book.rating != null && rateDialog.book.rating > 0 && (
              <button
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={async () => {
                  if (!rateDialog) return
                  setMutating(true)
                  try {
                    await rateBook(rateDialog.book.id, { rating: 0 })
                    await fetchBooks()
                  } catch {
                    toast.error('Failed to clear rating — server unreachable')
                  } finally {
                    setMutating(false)
                  }
                  setRateDialog(null)
                }}
                disabled={mutating}
              >
                Clear rating
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateDialog(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!rateDialog) return
                setMutating(true)
                try {
                  await rateBook(rateDialog.book.id, { rating: rateDialog.rating })
                  await fetchBooks()
                } catch {
                  toast.error('Failed to save rating — server unreachable')
                } finally {
                  setMutating(false)
                }
                setRateDialog(null)
              }}
              disabled={!rateDialog?.rating || mutating}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tags dialog */}
      {editTagsDialog && (
        <EditTagsDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditTagsDialog(null) }}
          bookId={editTagsDialog.book.id}
          currentTags={editTagsDialog.book.tags}
          allTags={allTags}
          onSave={handleSaveTags}
        />
      )}

      {/* Set Series dialog */}
      {setSeriesDialog && (
        <SetSeriesDialog
          open={true}
          onOpenChange={(open) => { if (!open) setSetSeriesDialog(null) }}
          bookId={setSeriesDialog.book.id}
          currentSeries={setSeriesDialog.book.series}
          currentSeriesOrder={setSeriesDialog.book.seriesOrder}
          allSeriesNames={allSeriesNames}
          onSave={handleSaveSeries}
        />
      )}

      {/* Book overview modal */}
      <BookOverviewModal
        open={!!overviewBook}
        onOpenChange={(open) => { if (!open) setOverviewBook(null) }}
        book={overviewBook ?? { id: '', title: '', totalChapters: 0 }}
      />

      {/* Cover generation modal */}
      {coverModal && (
        <CoverGenerationModal
          open={true}
          onOpenChange={(open) => { if (!open) setCoverModal(null) }}
          bookId={coverModal.book.id}
          bookTitle={coverModal.book.title}
          bookTopic={coverModal.book.prompt ?? coverModal.book.title}
          hasCover={coverModal.book.hasCover}
          showTitleOnCover={coverModal.book.showTitleOnCover}
          onCoverChanged={fetchBooks}
        />
      )}

      {/* Generate all modal */}
      {generateAllModal && (
        <GenerateAllModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setGenerateAllModal(null)
              fetchBooks()
            }
          }}
          taskId={generateAllModal.taskId}
          bookTitle={generateAllModal.book.title}
          totalChapters={generateAllModal.book.totalChapters}
        />
      )}

      {/* Audiobook download modal */}
      {audiobook.audiobookDownloadModal && (
        <AudiobookDownloadModal
          open
          onOpenChange={(open) => { if (!open) { audiobook.setAudiobookDownloadModal(null); audiobook.setPendingAudiobookForBookId(null) } }}
          missing={audiobook.audiobookDownloadModal.missing}
          missingBytes={audiobook.audiobookDownloadModal.missingBytes}
          onConfirm={audiobook.handleConfirmDownload}
        />
      )}

      {/* Audiobook voice modal */}
      {audiobook.audiobookVoiceModal && (
        <AudiobookVoiceModal
          open
          onOpenChange={(open) => { if (!open) audiobook.setAudiobookVoiceModal(null) }}
          bookId={audiobook.audiobookVoiceModal.book.id}
          bookTitle={audiobook.audiobookVoiceModal.book.title}
          mode={audiobook.audiobookVoiceModal.mode}
        />
      )}

      {/* Audiobook regenerate confirm modal */}
      {audiobook.regenerateAudiobookConfirm && (
        <AudiobookRegenerateConfirmModal
          open
          onOpenChange={(open) => { if (!open) audiobook.setRegenerateAudiobookConfirm(null) }}
          bookTitle={audiobook.regenerateAudiobookConfirm.book.title}
          onConfirm={audiobook.handleConfirmRegenerateAudiobook}
        />
      )}
    </>
  )

  if (activeSeriesName) {
    const seriesBooks = books.filter(b => b.series === activeSeriesName)
    return (
      <>
        <SeriesView
          seriesName={activeSeriesName}
          books={seriesBooks}
          readingPositions={readingPositions}
          onBookClick={(book) => onOpenBook(book)}
          onBack={() => { fetchBooks(); setActiveSeriesName(null) }}
          onContextMenu={(book, e) => {
            if (bookIds.has(book.id)) {
              e.preventDefault()
              audiobook.checkAudiobookExists(book.id)
              setContextMenu({ book, x: e.clientX, y: e.clientY })
            }
          }}
        />
        {renderContextMenu()}
        {renderDialogs()}
      </>
    )
  }

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      {/* Header */}
      <header
        className="relative flex h-12 shrink-0 items-center justify-between border-b border-border-default/50 bg-surface-base/90 px-8 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Tutor
        </span>

        <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!serverAvailable}
          >
            <FileDown data-icon="inline-start" className="size-4" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Button
            size="sm"
            onClick={handleNewBook}
            disabled={!serverAvailable}
            className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)] disabled:opacity-40"
          >
            <Plus data-icon="inline-start" className="size-4" />
            New Book
          </Button>
          <WizardModal
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onCreate={onCreateBook}
          />
          <SettingsMenu
            apiKeyDialogOpen={apiKeyDialogOpen}
            onApiKeyDialogClose={() => setApiKeyDialogOpen(false)}
            onReviewProgress={onReviewProgress}
          />
        </div>
      </header>

      {/* Library toolbar */}
      {books.length > 0 && (
        <LibraryToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fullSearch={fullSearch}
          onFullSearchChange={setFullSearch}
          resultCount={searchResultCount}
          allTags={allTags}
        />
      )}

      {/* Filter chips row */}
      {activeFilterChips.length > 0 && (
        <div className="border-b border-border-default/50 bg-surface-base/90 px-8">
          <div className="mx-auto max-w-7xl flex items-center gap-2 py-2 flex-wrap">
            {activeFilterChips.map(chip => (
              <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
                <span className="text-xs">{chip.label}</span>
                <button
                  onClick={chip.onRemove}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <button
              onClick={() => dispatch(clearLibraryFilters())}
              className="text-xs text-content-muted hover:text-content-primary transition-colors ml-1"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Library grid */}
      <main
        className="relative flex-1 overflow-y-auto overflow-x-hidden px-8"
        style={{ fontSize: `${fontSize}px` }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dragCounterRef.current++
          if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true)
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dragCounterRef.current--
          if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0
            setIsDragOver(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dragCounterRef.current = 0
          setIsDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleImportFile(file)
        }}
      >
        {/* Drop zone overlay */}
        {isDragOver && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm border-2 border-dashed border-border-focus rounded-lg m-2">
            <div className="flex flex-col items-center gap-2 text-content-primary">
              <FileDown className="size-10 text-content-muted" />
              <p className="text-lg font-semibold">Drop EPUB to import</p>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-7xl py-8">
          {hasLoaded && books.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <BookOpen className="size-12 text-content-faint" />
              <h2 className="mt-4 text-lg font-semibold text-content-primary">No books yet</h2>
              <p className="mt-1 text-sm text-content-muted">Create your first book to start learning.</p>
              <Button
                className="mt-6 bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
                onClick={handleNewBook}
                disabled={!serverAvailable}
              >
                <Plus data-icon="inline-start" className="size-4" />
                New Book
              </Button>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <BookOpen className="size-12 text-content-faint" />
              <p className="mt-4 text-sm text-content-muted">
                {deferredSearch ? 'No books match your search.' : 'No books match this filter.'}
              </p>
            </div>
          ) : libraryView === 'list' ? (
            (() => {
              // Build list items: group series, keep non-series as individual rows
              const renderedSeries = new Set<string>()
              const listItems: Array<
                | { type: 'book'; book: LibraryBook; chaptersRead: number }
                | { type: 'series'; seriesName: string; bookCount: number; books: Array<{ book: LibraryBook; chaptersRead: number }> }
              > = []

              for (const book of filteredBooks) {
                if (book.series) {
                  if (renderedSeries.has(book.series)) continue
                  renderedSeries.add(book.series)

                  const seriesBooks = seriesGroups.get(book.series) ?? []
                  listItems.push({
                    type: 'series',
                    seriesName: book.series,
                    bookCount: seriesBooks.length,
                    books: seriesBooks.map(b => {
                      if (isComplete(b.status)) return { book: b, chaptersRead: b.totalChapters }
                      const pos = readingPositions[b.id]
                      return { book: b, chaptersRead: Math.max(b.chaptersRead, pos != null ? pos.chapter + 1 : 0) }
                    }),
                  })
                } else {
                  const pos = readingPositions[book.id]
                  listItems.push({
                    type: 'book',
                    book,
                    chaptersRead: isComplete(book.status) ? book.totalChapters : Math.max(book.chaptersRead, pos != null ? pos.chapter + 1 : 0),
                  })
                }
              }

              const isManual = librarySort.field === 'manual'
              const listView = (
                <BookListView
                  items={listItems}
                  isManual={isManual}
                  onBookClick={(book) => onOpenBook(book)}
                  onSeriesClick={(seriesName) => setActiveSeriesName(seriesName)}
                  onContextMenu={(book, e) => {
                    if (bookIds.has(book.id)) {
                      e.preventDefault()
                      audiobook.checkAudiobookExists(book.id)
                      setContextMenu({ book, x: e.clientX, y: e.clientY })
                    }
                  }}
                  onSeriesContextMenu={(seriesName, books, e) => {
                    e.preventDefault()
                    setSeriesContextMenu({ seriesName, books, x: e.clientX, y: e.clientY })
                  }}
                />
              )

              if (isManual) {
                const listItemIds = listItems.map(item =>
                  item.type === 'series' ? `series-${item.seriesName}` : item.book.id
                )
                return (
                  <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
                    <SortableContext items={listItemIds} strategy={verticalListSortingStrategy}>
                      {listView}
                    </SortableContext>
                    <DragOverlay>
                      {activeDragId && (() => {
                        if (activeDragId.startsWith('series-')) {
                          const seriesName = activeDragId.slice(7)
                          const seriesBooks = seriesGroups.get(seriesName) ?? []
                          return (
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-raised rounded-lg shadow-lg ring-1 ring-border-focus/30">
                              <div className="flex -space-x-0.5">
                                {[...Array(Math.min(seriesBooks.length, 3))].map((_, i) => (
                                  <div key={i} className="h-3 w-2 rounded-[1px] border border-content-faint/30 bg-content-faint/10" />
                                ))}
                              </div>
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">{seriesName}</span>
                              <span className="text-[10px] text-content-faint">{seriesBooks.length} books</span>
                            </div>
                          )
                        }
                        const book = filteredBooks.find(b => b.id === activeDragId)
                        if (!book) return null
                        const pos = readingPositions[book.id]
                        const chaptersRead = Math.max(book.chaptersRead, pos != null ? pos.chapter + 1 : 0)
                        return (
                          <div className="bg-surface-raised rounded-lg shadow-lg ring-1 ring-border-focus/30">
                            <BookListRow book={book} chaptersRead={chaptersRead} onClick={() => {}} />
                          </div>
                        )
                      })()}
                    </DragOverlay>
                  </DndContext>
                )
              }

              return listView
            })()
          ) : (
            (() => {
              // Build grid items: collapse series into stack cards, keep non-series as individual cards
              const renderedSeries = new Set<string>()
              const gridItemIds: string[] = []
              const gridElements: React.ReactNode[] = []
              const isManual = librarySort.field === 'manual'

              for (const book of filteredBooks) {
                if (book.series) {
                  if (renderedSeries.has(book.series)) continue
                  renderedSeries.add(book.series)

                  const seriesBooks = seriesGroups.get(book.series) ?? []
                  const totalChapters = seriesBooks.reduce((s, b) => s + b.totalChapters, 0)
                  const chaptersRead = seriesBooks.reduce((s, b) => {
                    if (isComplete(b.status)) return s + b.totalChapters
                    const pos = readingPositions[b.id]
                    return s + Math.max(b.chaptersRead, pos != null ? pos.chapter + 1 : 0)
                  }, 0)

                  const itemId = `series-${book.series}`
                  gridItemIds.push(itemId)

                  const seriesCtxMenu = (e: React.MouseEvent) => {
                    e.preventDefault()
                    setSeriesContextMenu({ seriesName: book.series!, books: seriesBooks, x: e.clientX, y: e.clientY })
                  }

                  if (isManual) {
                    gridElements.push(
                      <SortableSeriesCard
                        key={itemId}
                        id={itemId}
                        seriesName={book.series}
                        books={seriesBooks}
                        chaptersRead={chaptersRead}
                        totalChapters={totalChapters}
                        onClick={() => setActiveSeriesName(book.series!)}
                        onContextMenu={seriesCtxMenu}
                      />
                    )
                  } else {
                    gridElements.push(
                      <SeriesStackCard
                        key={itemId}
                        seriesName={book.series}
                        books={seriesBooks}
                        chaptersRead={chaptersRead}
                        totalChapters={totalChapters}
                        onClick={() => setActiveSeriesName(book.series!)}
                        onContextMenu={seriesCtxMenu}
                      />
                    )
                  }
                } else {
                  const pos = readingPositions[book.id]
                  const chaptersRead = isComplete(book.status)
                    ? book.totalChapters
                    : Math.max(book.chaptersRead, pos != null ? pos.chapter + 1 : 0)
                  gridItemIds.push(book.id)

                  if (isManual) {
                    gridElements.push(
                      <SortableBookCard
                        key={book.id}
                        id={book.id}
                        title={book.title}
                        subtitle={book.subtitle}
                        chaptersRead={chaptersRead}
                        totalChapters={book.totalChapters}
                        status={book.status}
                        rating={book.rating}
                        coverUrl={book.hasCover ? coverUrl({ id: book.id, coverUpdatedAt: book.coverUpdatedAt ?? undefined }) : undefined}
                        showTitleOnCover={book.showTitleOnCover}
                        imported={book.imported}
                        hasAudiobook={book.hasAudiobook}
                        onClick={() => onOpenBook(book)}
                        onContextMenu={bookIds.has(book.id) ? (e) => {
                          e.preventDefault()
                          audiobook.checkAudiobookExists(book.id)
                          setContextMenu({ book, x: e.clientX, y: e.clientY })
                        } : undefined}
                      />
                    )
                  } else {
                    gridElements.push(
                      <BookCard
                        key={book.id}
                        title={book.title}
                        subtitle={book.subtitle}
                        chaptersRead={chaptersRead}
                        totalChapters={book.totalChapters}
                        status={book.status}
                        rating={book.rating}
                        coverUrl={book.hasCover ? coverUrl({ id: book.id, coverUpdatedAt: book.coverUpdatedAt ?? undefined }) : undefined}
                        showTitleOnCover={book.showTitleOnCover}
                        imported={book.imported}
                        hasAudiobook={book.hasAudiobook}
                        onClick={() => onOpenBook(book)}
                        onContextMenu={bookIds.has(book.id) ? (e) => {
                          e.preventDefault()
                          audiobook.checkAudiobookExists(book.id)
                          setContextMenu({ book, x: e.clientX, y: e.clientY })
                        } : undefined}
                      />
                    )
                  }
                }
              }

              const gridDiv = (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8 xl:grid-cols-5">
                  {gridElements}
                </div>
              )

              if (isManual) {
                return (
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={gridItemIds} strategy={rectSortingStrategy}>
                      {gridDiv}
                    </SortableContext>
                  </DndContext>
                )
              }

              return gridDiv
            })()
          )}
        </div>
      </main>

      {renderContextMenu()}
      {renderSeriesContextMenu()}
      {renderDialogs()}

      {/* Import EPUB dialog */}
      <ImportPreviewDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open)
          if (!open) {
            setImportPreview(null)
            setImportFileBase64('')
            setImportFilename('')
          }
        }}
        preview={importPreview}
        fileBase64={importFileBase64}
        filename={importFilename}
        allTags={allTags}
        allSeriesNames={allSeriesNames}
        onConfirm={handleImportConfirm}
      />

      {/* Background tasks footer */}
      <BackgroundTasksFooter />
    </div>
  )
}
