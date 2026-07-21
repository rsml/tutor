import { useDeferredValue, useEffect, useState } from 'react'
import { searchBooks } from '@client/api'

/**
 * Full-text content search runs against the deferred query so a fast typist
 * doesn't fire a request per keystroke, and only when the caller has opted
 * into searching chapter contents rather than just titles and subtitles.
 */
export function useLibrarySearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [fullSearch, setFullSearch] = useState(false)
  const [contentSearchResults, setContentSearchResults] = useState<Set<string>>(new Set())
  const deferredSearch = useDeferredValue(searchQuery)

  useEffect(() => {
    if (!fullSearch || !deferredSearch.trim()) {
      setContentSearchResults(new Set())
      return
    }
    let cancelled = false
    const doSearch = async () => {
      try {
        const data = await searchBooks(deferredSearch.trim(), true)
        if (!cancelled) {
          const results = data.results ?? data
          setContentSearchResults(new Set(results.map(r => r.bookId)))
        }
      } catch { /* ignore */ }
    }
    doSearch()
    return () => { cancelled = true }
  }, [fullSearch, deferredSearch])

  return {
    searchQuery,
    setSearchQuery,
    fullSearch,
    setFullSearch,
    deferredSearch,
    contentSearchResults,
  }
}
