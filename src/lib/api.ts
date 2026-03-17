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
