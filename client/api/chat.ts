import type { z } from 'zod'
import type { ChatBodySchema } from '@shared/contracts'
import { streamText } from './sse'

/**
 * The inline chat endpoint, which answers with a plain text stream rather
 * than a document, so it is read with streamText instead of request.
 *
 * The request body is inferred from the Zod schema the server validates
 * against, so it cannot drift from what the route accepts. The schema is
 * imported as a type only and compiles away, so no validator reaches the
 * browser bundle.
 */

/** Everything streamChat needs to ask the tutor about a chapter or a selection. */
export type StreamChatParams = z.infer<typeof ChatBodySchema> & {
  /** Lets the caller abort the request in flight, since the chat panel cancels one whenever the user restarts or clears the conversation. */
  signal?: AbortSignal
}

/**
 * Streams the tutor's reply to a chat message, one decoded chunk at a time.
 *
 * Abort by passing a signal in params, see StreamChatParams.signal above for
 * who does that and why. Aborting, or the connection dropping mid-reply,
 * rejects the returned promise. Whatever chunks already reached onChunk stay
 * in the caller's message state either way, since streamText never buffers
 * or retracts a chunk once it's been handed over.
 */
export function streamChat(params: StreamChatParams, onChunk: (chunk: string) => void): Promise<void> {
  const { signal, ...body } = params
  return streamText('/api/chat', { method: 'POST', body, signal }, onChunk)
}
