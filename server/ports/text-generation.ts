import type { z } from 'zod'
import type { ProviderId } from '@shared/provider.js'

/**
 * Abstracts every call this app makes to an AI text model: streaming plain
 * text token by token, generating a value that satisfies a Zod schema, and
 * running a short multi-step tool-calling conversation.
 *
 * Those three shapes used to be called directly against the Vercel AI SDK
 * from the services themselves, and this port exists so a caller depends on
 * a shape instead of on the SDK. Fifteen call sites go through it today, 8
 * `generateObject`, 6 `streamText`, and 1 `runToolConversation`, which is
 * the profile interview. Provider and model resolution used to sit in its
 * own service that every caller imported directly, and it now lives in the
 * adapter, so the SDK is an adapter-only concern.
 *
 * `signal` on every method means CANCELLATION ONLY, e.g. a "generate all
 * chapters" background task being cancelled. It is never a timeout. The
 * adapter owns the five-minute request timeout, by combining this signal
 * with its own `AbortSignal.timeout(...)`. Every call site used to hand-roll
 * its own timeout/`AbortController` pair; this port is what let all of those
 * collapse into the adapter.
 *
 * server/adapters/ai-sdk-text-generation.ts is the real adapter, the only
 * module in server/ allowed to import from the `ai` package. The in-memory
 * fake is text-generation.fake.ts's createFakeTextGeneration, and the
 * shared behavioural spec both must satisfy is
 * text-generation.contract.ts's describeTextGenerationContract, fake only,
 * since a real subject would call a live model.
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

/**
 * prompt and messages are mutually exclusive in practice, see the prompt
 * field below, but nothing here is a discriminated union enforcing that,
 * because every real call site already sends exactly one and never both.
 */
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

/**
 * The returned value is guaranteed to satisfy schema, not merely typed as
 * if it does. Both the real adapter, through the underlying SDK call, and
 * the fake, through schema.parse, validate before returning.
 */
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

/**
 * Unlike StreamTextRequest, system and messages are both required here,
 * and there is no prompt field. A tool calling conversation always needs
 * an explicit system prompt and an explicit message history to have
 * anything to call tools about.
 */
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

/** The failure classes TextGenerationError can carry. Mirrored by `AiErrorKind` in shared/responses.ts, pinned together by the drift guard in ai-error-kind.drift.test.ts. */
export type TextGenerationErrorKind =
  | 'auth-failed'
  | 'rate-limited'
  | 'overloaded'
  | 'timed-out'
  | 'network-failed'
  | 'content-refused'
  | 'unknown'

/**
 * TextGenerationError is a failure from any TextGeneration method. It
 * carries enough structure for a caller to decide whether to retry and
 * what to show the user. `reason` is human readable and safe to display to
 * a user as is. It is never a raw SDK error message. `kind` is a wire
 * value, mirrored by `AiErrorKind` in shared/responses.ts, so the client
 * can switch on a failure class without importing zod or anything under
 * server/. The precedent for a typed error on a port is `NotFoundError` in
 * server/ports/book-repository.ts.
 */
export class TextGenerationError extends Error {
  readonly retryAfterMs?: number

  constructor(
    readonly kind: TextGenerationErrorKind,
    readonly reason: string,
    readonly retryable: boolean = false,
    options: { retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(reason, { cause: options.cause })
    this.name = 'TextGenerationError'
    this.retryAfterMs = options.retryAfterMs
  }
}

/**
 * There is no plain, one-shot text completion method. A caller that wants
 * a single string rather than a stream collects streamText's chunks
 * itself. Nothing here provides that convenience directly.
 */
export interface TextGeneration {
  /**
   * Streams plain-text output. Covers 6 call sites across 5 modules, the table-of-contents
   * stream in `server/services/create-book.ts` (initial generation) and
   * `server/services/revise-toc.ts` (revision), the chapter-1 stream in
   * `server/services/start-book.ts`, the per-chapter stream in
   * `server/services/generate-next-chapter.ts`, and the inline reader-chat
   * stream in `server/services/explain-passage.ts`.
   */
  streamText(req: StreamTextRequest): AsyncIterable<string>

  /**
   * Generates a value satisfying `schema`. Covers 8 call sites, quiz
   * generation in `server/services/generate-quiz.ts`, skill classification
   * in `server/services/start-book.ts`, the final quiz in
   * `server/services/generate-final-quiz.ts`, profile suggestions in
   * `server/services/suggest-profile-updates.ts`, next-book suggestions in
   * `server/services/suggest-next-book.ts`, book-detail suggestions in
   * `server/services/suggest-book-details.ts`, skill suggestions in
   * `server/services/suggest-skills.ts`, and the cover-prompt suggestion in
   * `server/services/suggest-cover-prompt.ts`.
   */
  generateObject<T>(req: GenerateObjectRequest<T>): Promise<T>

  /**
   * Runs a short tool-calling conversation and yields only the model's text
   * output. A tool call happens as a side effect of invoking
   * `ToolSpec.execute` and is never surfaced on the returned iterable.
   * Covers exactly one call site, the profile interview in
   * `server/services/interview-profile.ts`, invoked from
   * `server/routes/profile.ts`. This method is that filtered stream,
   * pre-filtered, so the caller never touches the SDK's `fullStream`
   * directly.
   */
  runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk>
}
