import type { z } from 'zod'
import type { ProviderId } from '@shared/provider.js'

/**
 * Abstracts every call this app makes to an AI text model: streaming plain
 * text token by token, generating a value that satisfies a Zod schema, and
 * running a short multi-step tool-calling conversation.
 *
 * Today those three shapes are each called directly against the Vercel AI
 * SDK from five route/service modules: 9 `generateObject` call sites and 6
 * `streamText` call sites (one of which drives tool calling and is really a
 * `runToolConversation` call in disguise). This port exists so those call
 * sites can depend on a shape instead of the SDK, so `services/model-client.ts`
 * and the SDK itself become adapter-only concerns.
 *
 * `signal` on every method means CANCELLATION ONLY, e.g. a "generate all
 * chapters" background task being cancelled. It is never a timeout. The
 * adapter owns the five-minute request timeout, by combining this signal
 * with its own `AbortSignal.timeout(...)`. Every current call site
 * hand-rolls a `createTimeout()`/`AbortController` pair for that timeout
 * today; this port is what lets all of those collapse into the adapter.
 */

/** Which provider and model to call. Validating that the pair is well-formed is the adapter's job. */
export interface ModelRef {
  provider: ProviderId
  model: string
}

/** One turn of a chat-style conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamTextRequest {
  model: ModelRef
  system?: string
  /**
   * Single-shot instruction. Every real call site sends either `prompt` or
   * `messages`, never both and never neither — the type does not enforce
   * that, it just mirrors how the two fields are used today.
   */
  prompt?: string
  messages?: ChatMessage[]
  signal?: AbortSignal
}

export interface GenerateObjectRequest<T> {
  model: ModelRef
  schema: z.ZodType<T>
  prompt: string
  system?: string
  /** Extra schema metadata forwarded to the provider call. Only one real call site (the next-book suggestion) sets these. */
  schemaName?: string
  schemaDescription?: string
  signal?: AbortSignal
}

/**
 * One tool the model may call during {@link TextGeneration.runToolConversation}.
 * `execute` receives its input already validated against `inputSchema`. The
 * one real caller (the profile interview in `server/routes/profile.ts`) uses
 * `execute` purely for its side effect, persisting the learning profile, and
 * never reads the resolved value, but the shape describes a tool in
 * general, not that one caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolSpec<TInput = any, TResult = unknown> {
  description: string
  inputSchema: z.ZodType<TInput>
  execute: (input: TInput) => Promise<TResult>
}

export interface RunToolConversationRequest {
  model: ModelRef
  system: string
  messages: ChatMessage[]
  tools: Record<string, ToolSpec>
  /** Upper bound on model round-trips, e.g. one step to call a tool and one more to respond to its result. */
  maxSteps: number
  signal?: AbortSignal
}

/**
 * A text delta from {@link TextGeneration.runToolConversation}. The only
 * part type a real caller reads today — tool calls and their results are
 * side effects of `ToolSpec.execute`, not stream output.
 */
export interface TextChunk {
  type: 'text'
  text: string
}

export interface TextGeneration {
  /**
   * Streams plain-text output. Covers 5 call sites: the table-of-contents
   * stream (initial generation and revision) and the chapter-1 stream in
   * `server/routes/books.ts`, the chapter stream in
   * `server/services/generation-manager.ts`, and the inline reader-chat
   * stream in `server/routes/chat.ts`.
   */
  streamText(req: StreamTextRequest): AsyncIterable<string>

  /**
   * Generates a value satisfying `schema`. Covers 9 call sites: quiz
   * generation, skill classification, the final quiz, and profile/next-book/
   * book-detail suggestions in `server/routes/books.ts`; skill suggestions
   * in `server/routes/profile.ts`; the cover-prompt suggestion in
   * `server/routes/covers.ts`; and quiz generation in
   * `server/services/generation-manager.ts`.
   */
  generateObject<T>(req: GenerateObjectRequest<T>): Promise<T>

  /**
   * Runs a short tool-calling conversation and yields only the model's text
   * output. A tool call happens as a side effect of invoking
   * `ToolSpec.execute` and is never surfaced on the returned iterable.
   * Covers exactly one call site: the profile interview in
   * `server/routes/profile.ts`, which today filters the SDK's `fullStream`
   * down to `text-delta` parts. This method is that filtered stream,
   * pre-filtered.
   */
  runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk>
}
