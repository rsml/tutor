import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, BookOpen, X, FileDown, Pencil, Star, Tags, Library, ClipboardCheck, Eye, Image, Zap, Download, Trash2 } from 'lucide-react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@src/components/ui/button'
import { Badge } from '@src/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { BookCard } from '@src/components/BookCard'
import { SortableBookCard } from '@src/components/SortableBookCard'
import { SortableSeriesCard } from '@src/components/SortableSeriesCard'
import { LibraryToolbar } from '@src/components/LibraryToolbar'
import { StarRating } from '@src/components/StarRating'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { WizardModal } from '@src/components/WizardModal'
import { CreationView } from '@src/components/CreationView'
import { BookOverviewModal } from '@src/components/BookOverviewModal'
import { CoverGenerationModal } from '@src/components/CoverGenerationModal'
import { GenerateAllModal } from '@src/components/GenerateAllModal'
import { BackgroundTasksFooter } from '@src/components/BackgroundTasksFooter'
import { EditTagsDialog } from '@src/components/EditTagsDialog'
import { ImportPreviewDialog } from '@src/components/ImportPreviewDialog'
import { SetSeriesDialog } from '@src/components/SetSeriesDialog'
import { SeriesStackCard } from '@src/components/SeriesStackCard'
import { BookListView } from '@src/components/BookListView'
import { SeriesView } from '@src/components/SeriesView'
import { ReaderPage } from '@src/pages/ReaderPage'
import { QuizReviewPage } from '@src/pages/QuizReviewPage'
import { ReviewProgressPage } from '@src/pages/ReviewProgressPage'
import { SkillDetailPage } from '@src/pages/SkillDetailPage'
import { ProfileUpdatePage } from '@src/pages/ProfileUpdatePage'
import { useBackgroundTasks } from '@src/hooks/useBackgroundTasks'
import { store, useAppSelector, useAppDispatch, setProviderApiKey, selectHasApiKey, selectFontSize, selectLibraryFilters, selectLibrarySort, selectLibraryView, clearLibraryFilters, setLibraryFilters, selectFunctionModel, DEFAULT_LIBRARY_FILTERS } from '@src/store'
import { PROVIDER_IDS } from '@src/lib/providers'
import { apiUrl } from '@src/lib/api-base'
import { previewEpub as previewEpubApi, confirmImport, type EpubPreview } from '@src/lib/api'

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


type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string; chapterCount: number }
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }
  | { type: 'review-progress' }
  | { type: 'skill-detail'; skillName: string }
  | { type: 'profile-update'; bookId: string; bookTitle: string }
  | { type: 'series'; seriesName: string }

export default function App() {
  const [view, setView] = useState<View>({ type: 'library' })
  const [apiBooks, setApiBooks] = useState<Book[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ book: Book; x: number; y: number } | null>(null)
  const [renameDialog, setRenameDialog] = useState<{ book: Book; title: string; subtitle: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ book: Book; input: string } | null>(null)
  const [rateDialog, setRateDialog] = useState<{ book: Book; rating: number } | null>(null)
  const [overviewBook, setOverviewBook] = useState<Book | null>(null)
  const [coverModal, setCoverModal] = useState<{ book: Book } | null>(null)
  const [generateAllModal, setGenerateAllModal] = useState<{ taskId: string; book: Book } | null>(null)
  const [editTagsDialog, setEditTagsDialog] = useState<{ book: Book } | null>(null)
  const [setSeriesDialog, setSetSeriesDialog] = useState<{ book: Book } | null>(null)
  const [seriesContextMenu, setSeriesContextMenu] = useState<{ seriesName: string; books: Book[]; x: number; y: number } | null>(null)
  const [renameSeriesDialog, setRenameSeriesDialog] = useState<{ seriesName: string; books: Book[]; newName: string } | null>(null)
  const [mutating, setMutating] = useState(false)
  const [serverAvailable, setServerAvailable] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [fullSearch, setFullSearch] = useState(false)
  const [contentSearchResults, setContentSearchResults] = useState<Set<string>>(new Set())
  const [importPreview, setImportPreview] = useState<EpubPreview | null>(null)
  const [importFileBase64, setImportFileBase64] = useState('')
  const [importFilename, setImportFilename] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const deferredSearch = useDeferredValue(searchQuery)
  const furthest = useAppSelector(s => s.readingProgress.furthest)
  const readingPositions = useAppSelector(s => s.readingProgress.positions)
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKey)
  const fontSize = useAppSelector(selectFontSize)
  const libraryFilters = useAppSelector(selectLibraryFilters)
  const librarySort = useAppSelector(selectLibrarySort)
  const libraryView = useAppSelector(selectLibraryView)
  const { provider: genProvider, model: genModel } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))

  useEffect(() => {
    if (window.electronAPI) {
      // Load API keys from secure storage and POST to server
      for (const provider of PROVIDER_IDS) {
        window.electronAPI.loadApiKey(provider).then(async key => {
          if (key) {
            try {
              await fetch(apiUrl('/api/settings/api-key'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: key }),
              })
            } catch { /* server may not be ready */ }
            dispatch(setProviderApiKey({ provider, apiKey: key }))
          }
        })
      }
      // Also try loading legacy key (no provider suffix) into anthropic
      window.electronAPI.loadApiKey().then(async key => {
        if (key) {
          try {
            await fetch(apiUrl('/api/settings/api-key'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: 'anthropic', apiKey: key }),
            })
          } catch { /* server may not be ready */ }
          dispatch(setProviderApiKey({ provider: 'anthropic', apiKey: key }))
        }
      })
    } else {
      // Dev/web mode — check server for existing key status
      fetch(apiUrl('/api/settings/api-key-status'))
        .then(res => res.json())
        .then((status: Record<string, boolean>) => {
          for (const provider of PROVIDER_IDS) {
            if (status[provider]) {
              dispatch(setProviderApiKey({ provider, apiKey: 'configured' }))
            }
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Health check — disable New Book when server is unreachable
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(apiUrl('/api/health'))
        setServerAvailable(res.ok)
      } catch {
        setServerAvailable(false)
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

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

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/books'))
      if (res.ok) {
        const books = await res.json()
        setApiBooks(prev => {
          // Preserve optimistic generating books not yet on server
          const generatingBooks = prev.filter(b => (b.status === 'generating' || b.status === 'generating_toc') && !books.some((sb: { id: string }) => sb.id === b.id))
          const serverBooks = books.map((b: { id: string; title: string; subtitle?: string; prompt?: string; totalChapters: number; generatedUpTo: number; status?: string; rating?: number; finalQuizScore?: number; finalQuizTotal?: number; hasCover?: boolean; showTitleOnCover?: boolean; coverUpdatedAt?: string | null; createdAt: string; tags: string[]; series?: string; seriesOrder?: number; sortOrder?: number; imported?: boolean }) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            prompt: b.prompt,
            chaptersRead: 0,
            totalChapters: b.totalChapters,
            generatedUpTo: b.generatedUpTo ?? 0,
            status: b.status,
            rating: b.rating,
            finalQuizScore: b.finalQuizScore,
            finalQuizTotal: b.finalQuizTotal,
            hasCover: b.hasCover,
            showTitleOnCover: b.showTitleOnCover,
            coverUpdatedAt: b.coverUpdatedAt,
            createdAt: b.createdAt,
            tags: b.tags,
            series: b.series,
            seriesOrder: b.seriesOrder,
            sortOrder: b.sortOrder,
            imported: b.imported,
          }))
          return [...serverBooks, ...generatingBooks]
        })
        setHasLoaded(true)
      } else {
        console.error('[fetchBooks] Server returned', res.status)
        setHasLoaded(true)
      }
    } catch {
      setHasLoaded(true)
      toast.error('Failed to load books — is the server running?')
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  // Full-text content search via backend
  useEffect(() => {
    if (!fullSearch || !deferredSearch.trim()) {
      setContentSearchResults(new Set())
      return
    }
    let cancelled = false
    const doSearch = async () => {
      try {
        const res = await fetch(apiUrl(`/api/books/search?q=${encodeURIComponent(deferredSearch.trim())}&full=true`))
        if (res.ok && !cancelled) {
          const data = await res.json()
          const results = data.results ?? data
          setContentSearchResults(new Set(results.map((r: { bookId: string }) => r.bookId)))
        }
      } catch { /* ignore */ }
    }
    doSearch()
    return () => { cancelled = true }
  }, [fullSearch, deferredSearch])

  // Connect to background task SSE stream — refresh library on cover generation + auto-download EPUB
  const handleEpubExported = useCallback((bookId: string, bookTitle: string) => {
    downloadEpub({ id: bookId, title: bookTitle } as Book)
  }, [])
  useBackgroundTasks({ onCoverGenerated: fetchBooks, onEpubExported: handleEpubExported, onGenerateAllCompleted: fetchBooks })

  // Poll for status updates when any book is generating
  useEffect(() => {
    const hasGenerating = apiBooks.some(b => b.status === 'generating_toc' || b.status === 'generating')
    if (!hasGenerating) return

    const interval = setInterval(fetchBooks, 1000)
    return () => clearInterval(interval)
  }, [apiBooks, fetchBooks])

  const [pendingCoverPrompt, setPendingCoverPrompt] = useState<string | null>(null)

  const handleCreate = (topic: string, details: string, chapterCount: number, coverPrompt?: string) => {
    setPendingCoverPrompt(coverPrompt ?? null)
    setView({ type: 'creating', topic, details, chapterCount })
  }

  const handleCreationComplete = (bookId: string) => {
    // Fire cover generation if opted in during creation
    if (pendingCoverPrompt) {
      const { provider: imgProvider, model: imgModel } = selectFunctionModel('image')(store.getState())
      fetch(apiUrl(`/api/books/${bookId}/cover/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pendingCoverPrompt, provider: imgProvider, model: imgModel }),
      }).catch(() => {}) // fire-and-forget
      setPendingCoverPrompt(null)
    }
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleCreationCancel = () => {
    // Delete any partially-created book from the server
    const creatingBook = apiBooks.find(b => b.status === 'generating_toc' || b.status === 'generating')
    if (creatingBook) {
      fetch(apiUrl(`/api/books/${creatingBook.id}`), { method: 'DELETE' }).catch(() => {})
      // Remove optimistic book immediately so it doesn't persist as a phantom
      setApiBooks(prev => prev.filter(b => b.id !== creatingBook.id))
    }
    fetchBooks()
    setView({ type: 'library' })
  }

  const handleBookCreated = useCallback((bookId: string, title: string, totalChapters?: number) => {
    // Optimistically add the book to the library so it's visible during creation
    setApiBooks(prev => {
      if (prev.some(b => b.id === bookId)) return prev
      return [...prev, {
        id: bookId,
        title,
        chaptersRead: 0,
        totalChapters: totalChapters ?? 0,
        generatedUpTo: 0,
        status: 'generating_toc',
        createdAt: new Date().toISOString(),
        tags: [],
      }]
    })
  }, [])

  const handleGenerateAll = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/generate-all`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: genModel, provider: genProvider, quizModel, quizProvider }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }
      const { taskId } = await res.json()
      setGenerateAllModal({ taskId, book })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start generation')
    }
  }

  const handleExportEpub = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/export-epub`), {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }
      const data = await res.json()
      if (data.cached) {
        // Direct download
        await downloadEpub(book)
      } else {
        // Background task created — will auto-download on completion
        toast.success('EPUB export started — check background tasks')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export EPUB')
    }
  }

  const downloadEpub = async (book: Book) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/export-epub`))
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const filename = `${book.title.replace(/[^a-zA-Z0-9 ]/g, '')}.epub`

      if (window.electronAPI?.saveFile) {
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
        await window.electronAPI.saveFile(filename, base64)
      } else {
        // Web fallback
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error('Failed to download EPUB')
    }
  }

  const handleRename = async () => {
    if (!renameDialog) return
    const trimmed = renameDialog.title.trim()
    if (!trimmed) return
    setMutating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${renameDialog.book.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, subtitle: renameDialog.subtitle.trim() || undefined }),
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to rename book')
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
        renameSeriesDialog.books.map(book =>
          fetch(apiUrl(`/api/books/${book.id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ series: trimmed }),
          })
        )
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
    if (!deleteDialog || deleteDialog.input !== 'delete') return
    setMutating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${deleteDialog.book.id}`), {
        method: 'DELETE',
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to delete book')
    } catch {
      toast.error('Failed to delete book — server unreachable')
    } finally {
      setMutating(false)
    }
    setDeleteDialog(null)
  }

  const handleSaveTags = async (bookId: string, tags: string[]) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to save tags')
    } catch {
      toast.error('Failed to save tags -- server unreachable')
    }
    setEditTagsDialog(null)
  }

  const handleSaveSeries = async (bookId: string, series: string | null, seriesOrder: number | null) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series, seriesOrder }),
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to save series')
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

      const preview = await previewEpubApi(base64, file.name)
      setImportPreview(preview)
      setImportDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview EPUB')
    }
  }

  const handleImportConfirm = async (tags: string[], series: string | null, seriesOrder: number | null) => {
    try {
      await confirmImport(
        importFileBase64,
        importFilename,
        tags.length > 0 ? tags : undefined,
        series ?? undefined,
        seriesOrder ?? undefined,
      )
      setImportDialogOpen(false)
      setImportPreview(null)
      setImportFileBase64('')
      setImportFilename('')
      toast.success('Book imported successfully')
      await fetchBooks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import EPUB')
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImportFile(file)
    // Reset file input so the same file can be selected again
    e.target.value = ''
  }

  // Track the previous sort field to detect transitions to manual mode
  const prevSortFieldRef = useRef(librarySort.field)

  // Initialize sortOrder on first switch to manual mode
  useEffect(() => {
    const wasManual = prevSortFieldRef.current === 'manual'
    prevSortFieldRef.current = librarySort.field

    if (librarySort.field !== 'manual' || wasManual) return
    // Switching to manual — assign integer sortOrders if books don't have them yet
    const needsInit = apiBooks.some(b => b.sortOrder == null)
    if (!needsInit) return

    // Use the current display order (filteredBooks would be ideal, but apiBooks is fine as a base)
    const booksToInit = [...apiBooks]
    // They're in whatever order they were before — assign integers
    const patches = booksToInit.map((book, index) => {
      if (book.sortOrder != null) return null
      return fetch(apiUrl(`/api/books/${book.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: index }),
      })
    }).filter(Boolean)

    if (patches.length > 0) {
      Promise.all(patches).then(() => fetchBooks()).catch(() => {})
    }
  }, [librarySort.field, apiBooks, fetchBooks])

  const apiBookIds = new Set(apiBooks.map(b => b.id))
  const allBooks = apiBooks

  const classifyBook = useCallback((book: Book): 'finished' | 'in-progress' | 'not-started' => {
    if (book.status === 'complete') return 'finished'
    if (furthest[book.id] != null) return 'in-progress'
    return 'not-started'
  }, [furthest])

  // Compute allTags from all books
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const book of allBooks) {
      for (const tag of book.tags) tagSet.add(tag)
    }
    return [...tagSet].sort()
  }, [allBooks])

  // Compute all series names from all books
  const allSeriesNames = useMemo(() => {
    const seriesSet = new Set<string>()
    for (const book of allBooks) {
      if (book.series) seriesSet.add(book.series)
    }
    return [...seriesSet].sort()
  }, [allBooks])

  const { filteredBooks, searchResultCount } = useMemo(() => {
    const bookClasses = new Map(allBooks.map(b => [b.id, classifyBook(b)]))

    // --- Filter logic ---
    let filtered = [...allBooks]

    // Status filter
    if (libraryFilters.status !== 'all') {
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

    const compareFn = (a: Book, b: Book): number => {
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
            ? ((furthest[a.id] != null ? furthest[a.id] + 1 : a.chaptersRead) / a.totalChapters)
            : 0
          const pb = b.totalChapters > 0
            ? ((furthest[b.id] != null ? furthest[b.id] + 1 : b.chaptersRead) / b.totalChapters)
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
    const seriesGroups = new Map<string, Book[]>()
    const nonSeries: Book[] = []
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
    const leads = new Map<string, Book>()
    for (const [series, group] of seriesGroups) {
      leads.set(series, group[0])
    }

    const allLeadsAndNonSeries = [...nonSeries, ...leads.values()]
    allLeadsAndNonSeries.sort(compareFn)

    // Now expand: replace each lead with the full series group
    const sorted: Book[] = []
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
  }, [allBooks, libraryFilters, librarySort, classifyBook, deferredSearch, furthest, readingPositions, fullSearch, contentSearchResults])

  // Drag-and-drop handler for manual sort mode
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
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
      const sBooks = apiBooks.filter(b => b.series === sName)
      bookIdsToPatch.push(...sBooks.map(b => b.id))
    } else {
      bookIdsToPatch.push(draggedItemId)
    }

    // Optimistically update state so the card doesn't jump on release
    setApiBooks(prev => prev.map(b =>
      bookIdsToPatch.includes(b.id) ? { ...b, sortOrder: newSortOrder } : b
    ))

    try {
      await Promise.all(bookIdsToPatch.map(bookId =>
        fetch(apiUrl(`/api/books/${bookId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newSortOrder }),
        })
      ))

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
            const sBooks = apiBooks.filter(b => b.series === sName)
            return sBooks.map(b =>
              fetch(apiUrl(`/api/books/${b.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sortOrder: index }),
              })
            )
          } else {
            return [fetch(apiUrl(`/api/books/${item.id}`), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: index }),
            })]
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
  }, [filteredBooks, apiBooks, fetchBooks, librarySort.direction])

  // Compute active filter chips for display
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    if (libraryFilters.status !== DEFAULT_LIBRARY_FILTERS.status) {
      const labels: Record<string, string> = {
        'in-progress': 'In Progress',
        'not-started': 'Not Started',
        'finished': 'Finished',
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
          setView({ type: 'quiz-review', book: contextMenu.book })
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
        Generate All
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
      <div className="my-1 h-px bg-border-default/50" />
      {/* Danger group */}
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
            onKeyDown={e => e.key === 'Enter' && deleteDialog?.input === 'delete' && handleDelete()}
            placeholder="delete"
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog?.input !== 'delete' || mutating}>OK</Button>
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
                    const res = await fetch(apiUrl(`/api/books/${rateDialog.book.id}/rating`), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rating: 0 }),
                    })
                    if (res.ok) await fetchBooks()
                    else toast.error('Failed to clear rating')
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
                  const res = await fetch(apiUrl(`/api/books/${rateDialog.book.id}/rating`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating: rateDialog.rating }),
                  })
                  if (res.ok) await fetchBooks()
                  else toast.error('Failed to save rating')
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
    </>
  )

  if (view.type === 'creating') {
    return (
      <CreationView
        topic={view.topic}
        details={view.details}
        chapterCount={view.chapterCount}
        onComplete={handleCreationComplete}
        onCancel={handleCreationCancel}
        onBookCreated={handleBookCreated}
      />
    )
  }

  if (view.type === 'reading') {
    return (
      <ReaderPage
        book={view.book}
        onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
        onQuizReview={() => setView({ type: 'quiz-review', book: view.book })}
        onUpdateProfile={() => setView({ type: 'profile-update', bookId: view.book.id, bookTitle: view.book.title })}
      />
    )
  }

  if (view.type === 'quiz-review') {
    return (
      <QuizReviewPage
        book={view.book}
        onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
        onBackToReader={() => setView({ type: 'reading', book: view.book })}
      />
    )
  }

  if (view.type === 'review-progress') {
    return (
      <ReviewProgressPage
        onBack={() => setView({ type: 'library' })}
        onSkillClick={(skillName) => setView({ type: 'skill-detail', skillName })}
      />
    )
  }

  if (view.type === 'skill-detail') {
    return (
      <SkillDetailPage
        skillName={view.skillName}
        onBack={() => setView({ type: 'review-progress' })}
      />
    )
  }

  if (view.type === 'profile-update') {
    return (
      <ProfileUpdatePage
        bookId={view.bookId}
        bookTitle={view.bookTitle}
        onComplete={() => { fetchBooks(); setView({ type: 'library' }) }}
      />
    )
  }

  if (view.type === 'series') {
    const seriesBooks = allBooks.filter(b => b.series === view.seriesName)
    return (
      <>
        <SeriesView
          seriesName={view.seriesName}
          books={seriesBooks}
          furthest={furthest}
          onBookClick={(book) => setView({ type: 'reading', book })}
          onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
          onContextMenu={(book, e) => {
            if (apiBookIds.has(book.id)) {
              e.preventDefault()
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
            onCreate={handleCreate}
          />
          <SettingsMenu
            apiKeyDialogOpen={apiKeyDialogOpen}
            onApiKeyDialogClose={() => setApiKeyDialogOpen(false)}
            onReviewProgress={() => setView({ type: 'review-progress' })}
          />
        </div>
      </header>

      {/* Library toolbar */}
      {allBooks.length > 0 && (
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
        className="relative flex-1 overflow-y-auto px-8"
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
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm border-2 border-dashed border-border-focus rounded-lg m-2">
            <div className="flex flex-col items-center gap-2 text-content-primary">
              <FileDown className="size-10 text-content-muted" />
              <p className="text-lg font-semibold">Drop EPUB to import</p>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-7xl py-8">
          {hasLoaded && allBooks.length === 0 ? (
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
                | { type: 'book'; book: Book; chaptersRead: number }
                | { type: 'series'; seriesName: string; bookCount: number; books: Array<{ book: Book; chaptersRead: number }> }
              > = []

              for (const book of filteredBooks) {
                if (book.series) {
                  if (renderedSeries.has(book.series)) continue
                  renderedSeries.add(book.series)

                  const seriesBooks = filteredBooks.filter(b => b.series === book.series)
                  listItems.push({
                    type: 'series',
                    seriesName: book.series,
                    bookCount: seriesBooks.length,
                    books: seriesBooks.map(b => {
                      const rp = furthest[b.id]
                      return { book: b, chaptersRead: rp != null ? rp + 1 : b.chaptersRead }
                    }),
                  })
                } else {
                  const rp = furthest[book.id]
                  listItems.push({
                    type: 'book',
                    book,
                    chaptersRead: rp != null ? rp + 1 : book.chaptersRead,
                  })
                }
              }

              return (
                <BookListView
                  items={listItems}
                  onBookClick={(book) => setView({ type: 'reading', book })}
                  onSeriesClick={(seriesName) => setView({ type: 'series', seriesName })}
                  onContextMenu={(book, e) => {
                    if (apiBookIds.has(book.id)) {
                      e.preventDefault()
                      setContextMenu({ book, x: e.clientX, y: e.clientY })
                    }
                  }}
                  onSeriesContextMenu={(seriesName, books, e) => {
                    e.preventDefault()
                    setSeriesContextMenu({ seriesName, books, x: e.clientX, y: e.clientY })
                  }}
                />
              )
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

                  const seriesBooks = filteredBooks.filter(b => b.series === book.series)
                  const totalChapters = seriesBooks.reduce((s, b) => s + b.totalChapters, 0)
                  const chaptersRead = seriesBooks.reduce((s, b) => {
                    const rp = furthest[b.id]
                    return s + (rp != null ? rp + 1 : b.chaptersRead)
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
                        onClick={() => setView({ type: 'series', seriesName: book.series! })}
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
                        onClick={() => setView({ type: 'series', seriesName: book.series! })}
                        onContextMenu={seriesCtxMenu}
                      />
                    )
                  }
                } else {
                  const reduxProgress = furthest[book.id]
                  const chaptersRead = reduxProgress != null
                    ? reduxProgress + 1
                    : book.chaptersRead
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
                        finalQuizScore={book.finalQuizScore}
                        finalQuizTotal={book.finalQuizTotal}
                        coverUrl={book.hasCover ? apiUrl(`/api/books/${book.id}/cover?v=${book.coverUpdatedAt ?? ''}`) : undefined}
                        showTitleOnCover={book.showTitleOnCover}
                        imported={book.imported}
                        onClick={() => setView({ type: 'reading', book })}
                        onContextMenu={apiBookIds.has(book.id) ? (e) => {
                          e.preventDefault()
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
                        finalQuizScore={book.finalQuizScore}
                        finalQuizTotal={book.finalQuizTotal}
                        coverUrl={book.hasCover ? apiUrl(`/api/books/${book.id}/cover?v=${book.coverUpdatedAt ?? ''}`) : undefined}
                        showTitleOnCover={book.showTitleOnCover}
                        imported={book.imported}
                        onClick={() => setView({ type: 'reading', book })}
                        onContextMenu={apiBookIds.has(book.id) ? (e) => {
                          e.preventDefault()
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
