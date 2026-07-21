/**
 * Reader for the Server-Sent Event streams the generation routes write.
 *
 * The event vocabulary itself lives in `@shared/events`, one union per stream,
 * so the client and the server cannot drift apart on what an event looks like.
 * This module only knows the wire format, which is `data: ` followed by one
 * JSON document per line.
 */

export interface SSECallbacks<TEvent> {
  onEvent: (event: TEvent) => void
}

/**
 * Consume an SSE stream from a fetch Response, parsing `data: {...}` lines
 * and invoking the callback for each parsed event.
 *
 * The caller establishes that the response has a body worth reading, which is
 * what `openStream` in `@client/api/sse` does before delegating here. A
 * response with no body simply produces no events.
 */
export async function parseSSEStream<TEvent>(
  response: Response,
  callbacks: SSECallbacks<TEvent>,
): Promise<void> {
  if (!response.body) return

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
        const data = JSON.parse(line.slice(6)) as TEvent
        callbacks.onEvent(data)
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
