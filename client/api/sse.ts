import { TASK_STREAM_RECONNECT_MS } from '@client/lib/constants'
import { parseSSEStream } from '@client/lib/parse-sse-stream'
import { ApiError, apiFetch, apiUrl, expectOk, type JsonRequestInit } from './http'

/**
 * The streaming half of the API client.
 *
 * Generation, inline chat and the profile interview all answer with a stream
 * rather than a document, in three different encodings. Everything below turns
 * one of those encodings into a callback, so no component has to own a reader
 * loop, a text decoder, or a reconnect timer.
 */

/**
 * Start a request and hand back a response that is guaranteed to have a body
 * worth reading. A stream endpoint that fails does so before the first byte,
 * answering with an ordinary JSON error, which is why the failure path here is
 * the same one every other request uses.
 */
async function openStream(path: string, init: JsonRequestInit | undefined): Promise<Response> {
  const response = await expectOk(await apiFetch(path, init), init?.fallbackMessage)
  if (!response.body) {
    throw new ApiError(response.status, init?.fallbackMessage ?? 'The server opened no stream')
  }
  return response
}

/**
 * Read a stream to its end, handing each decoded chunk to the caller. The
 * decoder is kept in streaming mode so a multi-byte character split across two
 * network chunks is reassembled rather than mangled.
 */
async function readChunks(response: Response, onChunk: (chunk: string) => void): Promise<void> {
  // Only ever called on a response from openStream, which has already
  // established that the body is there.
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    onChunk(decoder.decode(value, { stream: true }))
  }
}

/**
 * Consume a server-sent event stream, reporting each parsed event. Used by
 * every generation endpoint, which is anything that writes a chapter or a
 * table of contents while the user watches.
 *
 * The event type is supplied by the caller from `@shared/events`, which names
 * one union per stream rather than one loose union for all of them, so a
 * handler cannot claim to receive an event its endpoint never sends.
 */
export async function streamGeneration<TEvent>(
  path: string,
  init: JsonRequestInit | undefined,
  onEvent: (event: TEvent) => void,
): Promise<void> {
  await parseSSEStream(await openStream(path, init), { onEvent })
}

/** Consume a plain text stream, reporting each chunk. Used by inline chat. */
export async function streamText(
  path: string,
  init: JsonRequestInit | undefined,
  onChunk: (chunk: string) => void,
): Promise<void> {
  await readChunks(await openStream(path, init), onChunk)
}

/**
 * Consume a newline delimited JSON stream, reporting each parsed value. Used
 * by the profile interview, which interleaves assistant text with the finished
 * profile.
 */
export async function streamNdjson<T>(
  path: string,
  init: JsonRequestInit | undefined,
  onValue: (value: T) => void,
): Promise<void> {
  const response = await openStream(path, init)
  let buffer = ''

  const emit = (line: string): void => {
    if (!line.trim()) return
    try {
      onValue(JSON.parse(line) as T)
    } catch {
      // A line that is not JSON is a server-side artefact, not something the
      // reader can act on. Keep going rather than abandoning the stream.
    }
  }

  await readChunks(response, chunk => {
    buffer += chunk
    const lines = buffer.split('\n')
    // The last piece is whatever came after the final newline, which is either
    // an empty string or the start of a value still in flight.
    buffer = lines.pop() ?? ''
    for (const line of lines) emit(line)
  })

  // The stream can end without a trailing newline, and for the interview the
  // completed profile is exactly that last unterminated line.
  emit(buffer)
}

/**
 * Follow the background task stream until the returned function is called.
 *
 * The connection is re-opened after a drop, which happens routinely when the
 * server restarts during development. Reconnection is owned here rather than
 * by a component so the timer cannot be torn down and rebuilt by an unrelated
 * re-render.
 *
 * The event type is the caller's to name, because the transport neither knows
 * nor needs to know the task vocabulary.
 */
export function subscribeToTasks<E>(onEvent: (event: E) => void): () => void {
  let source: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribed = false

  const connect = (): void => {
    source = new EventSource(apiUrl('/api/tasks/stream'))

    source.onmessage = event => {
      try {
        onEvent(JSON.parse(event.data) as E)
      } catch {
        // A truncated frame tells us nothing actionable.
      }
    }

    source.onerror = () => {
      source?.close()
      if (unsubscribed) return
      reconnectTimer = setTimeout(connect, TASK_STREAM_RECONNECT_MS)
    }
  }

  connect()

  return () => {
    unsubscribed = true
    source?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  }
}
