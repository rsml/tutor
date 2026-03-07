import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector, setPosition, migratePosition } from '@src/store'
import { splitChapterIntoSections, type Section } from '@src/lib/split-sections'
import { apiUrl } from '@src/lib/api-base'

interface UseSectionNavigationOptions {
  bookId: string
  totalChapters: number
  generatedUpTo: number
}

interface UseSectionNavigationReturn {
  chapterIndex: number
  sectionIndex: number
  sections: Section[]
  currentSection: Section | null
  fullChapterContent: string | null
  loading: boolean
  hasPrev: boolean
  hasNext: boolean
  isLastSectionOfChapter: boolean
  isLastSectionOfLastGenerated: boolean
  isLastSectionOfBook: boolean
  isLastChapter: boolean
  sectionLabel: string
  goNext: () => void
  goPrev: () => void
  goToChapter: (chapter: number, section?: number) => void
}

const CACHE_SIZE = 5

export function useSectionNavigation({
  bookId,
  totalChapters,
  generatedUpTo,
}: UseSectionNavigationOptions): UseSectionNavigationReturn {
  const dispatch = useAppDispatch()
  const rawPosition = useAppSelector(s => s.readingProgress.positions[bookId])
  const position = rawPosition ? migratePosition(rawPosition) : null

  const chapterIndex = position?.chapter ?? 0
  const sectionIndex = position?.section ?? 0

  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<Section[]>([])
  const [fullChapterContent, setFullChapterContent] = useState<string | null>(null)

  // Chapter content cache: chapterIndex -> markdown
  const cacheRef = useRef<Map<number, string>>(new Map())

  const fetchChapter = useCallback(async (chapIdx: number): Promise<string | null> => {
    const cached = cacheRef.current.get(chapIdx)
    if (cached !== undefined) return cached

    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/chapters/${chapIdx + 1}`))
      if (!res.ok) return null
      const data = await res.json()
      const content = data.content as string

      // Maintain cache size
      cacheRef.current.set(chapIdx, content)
      if (cacheRef.current.size > CACHE_SIZE) {
        const firstKey = cacheRef.current.keys().next().value!
        cacheRef.current.delete(firstKey)
      }

      return content
    } catch {
      return null
    }
  }, [bookId])

  // Fetch and split current chapter
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetchChapter(chapterIndex).then(content => {
      if (cancelled) return
      if (content) {
        setFullChapterContent(content)
        setSections(splitChapterIntoSections(content))
      } else {
        setFullChapterContent(null)
        setSections([])
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [chapterIndex, fetchChapter])

  // Clear cache when bookId changes
  useEffect(() => {
    cacheRef.current = new Map()
  }, [bookId])

  const isLastChapter = chapterIndex + 1 >= totalChapters
  const isLastSectionOfChapter = sections.length === 0 || sectionIndex >= sections.length - 1
  const isOnLastGeneratedChapter = chapterIndex + 1 === generatedUpTo && generatedUpTo < totalChapters
  const isLastSectionOfLastGenerated = isOnLastGeneratedChapter && isLastSectionOfChapter
  const isLastSectionOfBook = isLastChapter && isLastSectionOfChapter && generatedUpTo >= totalChapters

  const hasNext = !(isLastChapter && isLastSectionOfChapter)
  const hasPrev = !(chapterIndex === 0 && sectionIndex === 0)

  const currentSection = sections[sectionIndex] ?? null

  const sectionLabel = sections.length > 1
    ? `Ch. ${chapterIndex + 1} · ${sectionIndex + 1}/${sections.length}`
    : `${chapterIndex + 1} / ${totalChapters}`

  const goToChapter = useCallback((chapter: number, section = 0) => {
    dispatch(setPosition({ bookId, chapter, section }))
  }, [dispatch, bookId])

  const goNext = useCallback(() => {
    if (!isLastSectionOfChapter) {
      dispatch(setPosition({ bookId, chapter: chapterIndex, section: sectionIndex + 1 }))
    } else if (!isLastChapter) {
      dispatch(setPosition({ bookId, chapter: chapterIndex + 1, section: 0 }))
    }
  }, [dispatch, bookId, chapterIndex, sectionIndex, isLastSectionOfChapter, isLastChapter])

  const goPrev = useCallback(async () => {
    if (sectionIndex > 0) {
      dispatch(setPosition({ bookId, chapter: chapterIndex, section: sectionIndex - 1 }))
    } else if (chapterIndex > 0) {
      // Fetch previous chapter to get its last section
      const prevContent = await fetchChapter(chapterIndex - 1)
      if (prevContent) {
        const prevSections = splitChapterIntoSections(prevContent)
        dispatch(setPosition({ bookId, chapter: chapterIndex - 1, section: prevSections.length - 1 }))
      } else {
        dispatch(setPosition({ bookId, chapter: chapterIndex - 1, section: 0 }))
      }
    }
  }, [dispatch, bookId, chapterIndex, sectionIndex, fetchChapter])

  return {
    chapterIndex,
    sectionIndex,
    sections,
    currentSection,
    fullChapterContent,
    loading,
    hasPrev,
    hasNext,
    isLastSectionOfChapter,
    isLastSectionOfLastGenerated,
    isLastSectionOfBook,
    isLastChapter,
    sectionLabel,
    goNext,
    goPrev,
    goToChapter,
  }
}
