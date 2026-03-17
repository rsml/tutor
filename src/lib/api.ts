import { apiUrl } from './api-base'

export interface SearchMatch {
  type: 'title' | 'toc' | 'chapter'
  chapter?: number
  snippet: string
}

export interface SearchResult {
  bookId: string
  matches: SearchMatch[]
}

export interface SearchResponse {
  results: SearchResult[]
}

export async function searchBooks(query: string, full: boolean): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query })
  if (full) params.set('full', 'true')
  const res = await fetch(apiUrl(`/api/books/search?${params}`))
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

// --- EPUB Import ---

export interface EpubPreview {
  title: string
  subtitle?: string
  chapterCount: number
  hasCover: boolean
  coverBase64?: string
}

export async function previewEpub(base64: string, filename: string): Promise<EpubPreview> {
  const res = await fetch(apiUrl('/api/books/import/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, filename }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Preview failed' }))
    throw new Error(err.error ?? 'Preview failed')
  }
  return res.json()
}

export async function confirmImport(
  base64: string,
  filename: string,
  tags?: string[],
  series?: string,
  seriesOrder?: number,
): Promise<{ book: Record<string, unknown> }> {
  const res = await fetch(apiUrl('/api/books/import/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, filename, tags, series, seriesOrder }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Import failed' }))
    throw new Error(err.error ?? 'Import failed')
  }
  return res.json()
}
