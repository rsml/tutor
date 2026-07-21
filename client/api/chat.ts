import type { ProviderId } from '@client/lib/providers'
import { streamText } from './sse'

/**
 * This module streams the inline chat endpoint, which answers with a plain
 * text stream rather than a document, so it is read with streamText instead
 * of request.
 */

/** This is one turn of chat history, sent to the server as context for the next reply. */
export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/** This holds everything streamChat needs to ask the tutor about a chapter or a selection. */
export interface StreamChatParams {
  model: string
  provider: ProviderId
  chapterContent: string
  selectedText: string
  userMessage: string
  history: ChatHistoryMessage[]
  /** Lets the caller abort the request in flight, since the chat panel cancels one whenever the user restarts or clears the conversation. */
  signal?: AbortSignal
}

/** Streams the tutor's reply to a chat message, one decoded chunk at a time. */
export function streamChat(params: StreamChatParams, onChunk: (chunk: string) => void): Promise<void> {
  const { signal, ...body } = params
  return streamText('/api/chat', { method: 'POST', body, signal }, onChunk)
}
