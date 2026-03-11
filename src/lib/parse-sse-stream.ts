/**
 * Parsed SSE event types emitted by the generation endpoints.
 */
export type SSEEvent =
  | { type: 'book_created'; bookId: string; title: string; totalChapters: number }
  | { type: 'toc'; text: string }
  | { type: 'toc_done'; bookId: string; title: string; subtitle?: string; totalChapters: number }
  | { type: 'skills_classified' }
  | { type: 'chapter'; text: string; buffered?: boolean }
  | { type: 'stage'; stage: string }
  | { type: 'done'; bookId?: string; title?: string; totalChapters?: number; chapterNum?: number }
  | { type: 'error'; message: string }

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void
}

/**
 * Consume an SSE stream from a fetch Response, parsing `data: {...}` lines
 * and invoking the callback for each parsed event.
 */
export async function parseSSEStream(
  response: Response,
  callbacks: SSECallbacks,
): Promise<void> {
  if (!response.body) {
    callbacks.onEvent({ type: 'error', message: 'No response body' })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6)) as SSEEvent
        callbacks.onEvent(data)
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
