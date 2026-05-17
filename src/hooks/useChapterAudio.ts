import { useEffect, useState, useCallback } from 'react'
import { apiUrl } from '@src/lib/api-base'

interface AudiobookStatus {
  exists: boolean
  generatedChapters: number[]
  manifest: { voice: string; speed: number; generatedAt: string } | null
}

// Shared lookup so every chapter button doesn't fire its own HTTP call.
export function useChapterAudio(bookId: string) {
  const [status, setStatus] = useState<AudiobookStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/audiobook`))
      if (!res.ok) { setStatus(null); return }
      const data = await res.json()
      setStatus({
        exists: !!data.exists,
        generatedChapters: data.generatedChapters ?? [],
        manifest: data.manifest ?? null,
      })
    } catch {
      setStatus(null)
    }
  }, [bookId])

  useEffect(() => { void refresh() }, [refresh])

  const hasAudio = useCallback((chapterNum: number) => {
    return status?.generatedChapters.includes(chapterNum) ?? false
  }, [status])

  return { status, hasAudio, refresh }
}
