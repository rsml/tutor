import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject as aiGenerateObject, streamText as aiStreamText, stepCountIs, tool } from 'ai'
import type { LanguageModel, RepairTextFunction } from 'ai'
import { isProviderId, MODEL_REGEX, type ProviderId } from '@shared/provider.js'
import { AI_GENERATION_TIMEOUT_MS } from '../constants.js'
import type { KeyVault } from '../ports/key-vault.js'
import { TextGenerationError } from '../ports/text-generation.js'
import type {
  GenerateObjectRequest,
  ModelRef,
  RunToolConversationRequest,
  StreamTextRequest,
  TextChunk,
  TextGeneration,
} from '../ports/text-generation.js'
import { nextDelayMs, RETRY_TOTAL_ELAPSED_CEILING_MS } from './retry-policy.js'

/**
 * The real TextGeneration adapter. Every call site listed in
 * server/ports/text-generation.ts now goes through it instead of calling
 * the `ai` package directly, which makes this the only module in server/
 * allowed to import from the `ai` package.
 *
 * Talks to whichever of Anthropic, OpenAI, or Google the caller's ModelRef
 * names, over the network, through the Vercel AI SDK. That call can time
 * out, get rate limited, or hit a transient provider outage, which is why
 * this adapter, not its callers, owns a hard timeout and a retry policy.
 *
 * It owns four things that were duplicated across those call sites before
 * this port existed. The first is resolving a provider + model into a
 * callable client, lifted from the pre-port `services/model-client.ts`.
 * The second is the five-minute generation
 * timeout, composed by {@link composeAbortSignal}. The third is the
 * `experimental_repairText` logging hook used when a model's JSON output
 * fails to parse. Previously that hook only ran on the
 * `/api/books/suggest` route. Every `generateObject` call made through
 * this adapter gets it now. The fourth is retrying a failed call, through
 * {@link mapProviderError} and the policy in ./retry-policy.ts. Every real
 * call site used to either not retry at all or hand-roll its own ad hoc
 * retry. Every SDK call below turns its own retry count down to zero, so
 * the SDK's retrying can never run underneath this adapter's.
 */

/**
 * Constructor deps for createAiSdkTextGeneration. Only keyVault matters in
 * production. sleep, rng, and now exist so a retry test can control timing
 * and randomness deterministically instead of waiting out real delays.
 */
export interface AiSdkTextGenerationDeps {
  keyVault: KeyVault
  /**
   * The delay function used between retries. Defaults to a real
   * setTimeout-based sleep. Tests inject a no-op so a retry test does not
   * actually wait out real delays.
   */
  sleep?: (ms: number) => Promise<void>
  /**
   * The random source `nextDelayMs` uses for full jitter. Defaults to
   * Math.random. Tests inject a deterministic function so a retry test's
   * delay assertions are exact.
   */
  rng?: () => number
  /**
   * The clock used to measure elapsed retry time against
   * `RETRY_TOTAL_ELAPSED_CEILING_MS`. Defaults to Date.now. Tests inject a
   * controllable clock.
   */
  now?: () => number
}

/**
 * Resolves a provider + model identifier into a callable AI SDK model,
 * looking up the provider's API key in `keyVault`. Exported, not just used
 * internally by {@link createAiSdkTextGeneration}, so its provider and
 * model validation can be unit tested directly in
 * ai-sdk-text-generation.test.ts, without driving a full `generateObject`
 * or `streamText` call. It takes raw, not-yet-validated strings rather
 * than the port's `ModelRef`, so the validation lives here rather than
 * assuming some earlier caller already did it.
 */
export function resolveModelClient(
  keyVault: { get(provider: ProviderId): string | null },
  provider: string,
  model: string,
): LanguageModel {
  if (!isProviderId(provider)) {
    throw new Error(`Invalid provider: ${provider}`)
  }
  if (!MODEL_REGEX.test(model)) {
    throw new Error(`Invalid model identifier: ${model}`)
  }

  const apiKey = keyVault.get(provider)
  if (!apiKey) {
    throw new TextGenerationError('auth-failed', `No API key configured for provider: ${provider}`, false)
  }

  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey })(model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'anthropic':
    default:
      return createAnthropic({ apiKey })(model)
  }
}

/**
 * Combines a caller's cancellation signal with this adapter's own
 * generation timeout, so every port method aborts after `timeoutMs`
 * regardless of whether the caller ever cancels.
 *
 * `timeoutMs` defaults to the real five-minute constant. Every port
 * method below relies on that default and never overrides it. The
 * parameter exists for tests. Tests override it with a tiny value
 * instead of waiting out a real five-minute native timer, or trying to
 * fake-timer-advance one. `AbortSignal.timeout()`'s countdown runs on
 * the runtime's own timer, not the global `setTimeout` that
 * `vi.useFakeTimers()` intercepts, so no amount of fake-timer-advancing
 * makes it fire early.
 *
 * Returns the combined signal and the bare timeout signal separately,
 * rather than only the combined one, because {@link mapProviderError}
 * needs to tell a timeout apart from a caller cancellation after the
 * fact. Checking `timeoutSignal.aborted` on its own answers whether the
 * generation timeout fired, independent of whether the caller also
 * cancelled.
 */
export function composeAbortSignal(
  signal?: AbortSignal,
  timeoutMs: number = AI_GENERATION_TIMEOUT_MS,
): { signal: AbortSignal; timeoutSignal: AbortSignal } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  return { signal: combined, timeoutSignal }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads the retry-after response header off a mapped API call error's
 * responseHeaders, in either form the HTTP spec allows. A plain integer
 * string is delta-seconds, converted to milliseconds. Anything else is
 * parsed as an HTTP-date and converted to the milliseconds remaining
 * until that date. Returns undefined when the header is absent or
 * unparseable.
 */
function parseRetryAfterMs(headers: Record<string, unknown> | undefined): number | undefined {
  const raw = headers?.['retry-after']
  if (typeof raw !== 'string') return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return seconds * 1000
  const target = new Date(raw).getTime()
  return Number.isNaN(target) ? undefined : target - Date.now()
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'fetch failed') return true
  const cause = err instanceof Error ? err.cause : undefined
  const code = isRecord(cause) && typeof cause.code === 'string' ? cause.code : undefined
  if (code === undefined) return false
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || code.startsWith('UND_ERR_')
}

/**
 * Maps any error thrown by the `ai` package, or by resolveModelClient,
 * onto the TextGenerationError taxonomy this adapter's callers retry
 * against. Detection is structural, reading properties like `statusCode`
 * and `responseHeaders` off the error, rather than importing the `ai`
 * package's own error classes and checking `instanceof` them. The `ai`
 * package has changed its exact error class hierarchy across versions
 * before, and a structural check survives that, since the wire shape
 * those classes wrap, an HTTP status code and its headers, changes far
 * less often than the classes do.
 *
 * `ctx.timeoutFired` and `ctx.callerAborted` both come from the two
 * signals composeAbortSignal returns. Timeout wins when both fired, so a
 * caller who cancels a task and then also sees it blow past the
 * generation timeout still gets told generation itself was slow, not just
 * that something upstream gave up. When only the caller aborted, `err` is
 * returned unchanged, by identity, since the `if (signal.aborted) return`
 * paths in generate-all and audiobook generation depend on an untouched
 * abort propagating.
 */
export function mapProviderError(err: unknown, ctx: { timeoutFired: boolean; callerAborted: boolean }): unknown {
  const message = isRecord(err) && typeof err.message === 'string' ? err.message : undefined
  const reason = message ?? 'The AI provider returned an unrecognized error.'

  if (ctx.timeoutFired) {
    return new TextGenerationError('timed-out', reason, true, { cause: err })
  }
  if (ctx.callerAborted) {
    return err
  }
  if (err instanceof TextGenerationError) {
    return err
  }

  if (message?.includes('No API key configured for provider')) {
    return new TextGenerationError('auth-failed', reason, false, { cause: err })
  }

  const name = isRecord(err) && typeof err.name === 'string' ? err.name : undefined
  if (name?.includes('LoadAPIKeyError')) {
    return new TextGenerationError('auth-failed', reason, false, { cause: err })
  }

  const statusCode = isRecord(err) && typeof err.statusCode === 'number' ? err.statusCode : undefined
  if (statusCode === 401 || statusCode === 403) {
    return new TextGenerationError('auth-failed', reason, false, { cause: err })
  }
  if (statusCode === 429) {
    const responseHeaders = isRecord(err) && isRecord(err.responseHeaders) ? err.responseHeaders : undefined
    return new TextGenerationError('rate-limited', reason, true, { retryAfterMs: parseRetryAfterMs(responseHeaders), cause: err })
  }
  if (statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 529) {
    return new TextGenerationError('overloaded', reason, true, { cause: err })
  }
  if (statusCode === 408 || statusCode === 504) {
    return new TextGenerationError('timed-out', reason, true, { cause: err })
  }

  if (isNetworkFailure(err)) {
    return new TextGenerationError('network-failed', reason, true, { cause: err })
  }

  const finishReason = isRecord(err) && typeof err.finishReason === 'string' ? err.finishReason : undefined
  const stopReason = isRecord(err) && typeof err.stop_reason === 'string' ? err.stop_reason : undefined
  if (finishReason === 'content-filter' || stopReason === 'refusal') {
    return new TextGenerationError('content-refused', reason, false, { cause: err })
  }

  return new TextGenerationError('unknown', reason, false, { cause: err })
}

const repairText: RepairTextFunction = async ({ text, error }) => {
  console.warn('[ai-sdk-text-generation] generateObject returned an unparseable payload', {
    rawText: text,
    errName: error.name,
    errMsg: error.message,
  })
  return null
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Factory for the TextGeneration port. Builds all three methods over one
 * resolved set of deps. Each method runs its own retry loop and its own
 * composeAbortSignal call, so an in-flight streamText and a concurrent
 * generateObject on the same instance never share retry or abort state.
 */
export function createAiSdkTextGeneration(deps: AiSdkTextGenerationDeps): TextGeneration {
  const sleep = deps.sleep ?? realSleep
  const rng = deps.rng ?? Math.random
  const now = deps.now ?? Date.now

  function resolveModel(ref: ModelRef): LanguageModel {
    return resolveModelClient(deps.keyVault, ref.provider, ref.model)
  }

  function streamText(req: StreamTextRequest): AsyncIterable<string> {
    // Lazy: nothing in generate() below runs until the caller starts
    // iterating. That laziness is what makes retrying a pre-first-chunk
    // failure possible, and it is safe here because every real call site
    // iterates immediately rather than holding onto the AsyncIterable
    // unread. Checked with `rg '\.streamText\(' server -g '!*.test.ts'`:
    // revise-toc.ts:48, start-book.ts:114, create-book.ts:58, and
    // generate-next-chapter.ts:71 all do `for await (const chunk of
    // deps.ai.streamText({...` directly. explain-passage.ts:54 is the one
    // indirection, it returns the AsyncIterable straight through without
    // iterating, but its only caller, routes/chat.ts:18, does `for await
    // (const chunk of explainPassage(...))` with nothing in between. This
    // also converges the adapter with the fake, which has always been
    // lazy the same way.
    async function* generate(): AsyncGenerator<string> {
      const { signal: abortSignal, timeoutSignal } = composeAbortSignal(req.signal)
      const startedAt = now()
      let emitted = false

      for (let attempt = 1; ; attempt++) {
        try {
          const model = resolveModel(req.model)
          // The AI SDK's Prompt type is a `{ prompt } | { messages }`
          // union. A single object literal can't carry both keys at once
          // and still satisfy it, even though at most one of
          // req.prompt/req.messages is ever set. Branching keeps each
          // call site's object literal to exactly one of the two.
          //
          // This adapter owns retry, so the SDK's own retry count is
          // zeroed out below. The SDK's default of 2 would multiply
          // provider calls underneath nextDelayMs's own attempt count.
          const result = req.messages
            ? aiStreamText({ model, system: req.system, messages: req.messages, abortSignal, maxRetries: 0 })
            : aiStreamText({ model, system: req.system, prompt: req.prompt ?? '', abortSignal, maxRetries: 0 })

          for await (const chunk of result.textStream) {
            emitted = true
            yield chunk
          }
          return
        } catch (err) {
          const mapped = mapProviderError(err, { timeoutFired: timeoutSignal.aborted, callerAborted: req.signal?.aborted ?? false })
          // Retrying after a chunk has already reached the client would
          // duplicate visible text on screen, so once emitted is true the
          // mapped error always propagates, no matter what kind it is.
          if (emitted || !(mapped instanceof TextGenerationError)) throw mapped
          const delay = nextDelayMs(mapped.kind, attempt, { retryAfterMs: mapped.retryAfterMs, rng })
          if (delay === null || now() - startedAt + delay > RETRY_TOTAL_ELAPSED_CEILING_MS) throw mapped
          await sleep(delay)
        }
      }
    }

    return generate()
  }

  async function generateObject<T>(req: GenerateObjectRequest<T>): Promise<T> {
    const { signal: abortSignal, timeoutSignal } = composeAbortSignal(req.signal)
    const startedAt = now()

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await aiGenerateObject({
          model: resolveModel(req.model),
          schema: req.schema,
          prompt: req.prompt,
          system: req.system,
          schemaName: req.schemaName,
          schemaDescription: req.schemaDescription,
          abortSignal,
          experimental_repairText: repairText,
          maxRetries: 0, // This adapter owns retry. See streamText's comment on why.
        })
        return result.object
      } catch (err) {
        const mapped = mapProviderError(err, { timeoutFired: timeoutSignal.aborted, callerAborted: req.signal?.aborted ?? false })
        if (!(mapped instanceof TextGenerationError)) throw mapped
        const delay = nextDelayMs(mapped.kind, attempt, { retryAfterMs: mapped.retryAfterMs, rng })
        if (delay === null || now() - startedAt + delay > RETRY_TOTAL_ELAPSED_CEILING_MS) throw mapped
        await sleep(delay)
      }
    }
  }

  function runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk> {
    const tools = Object.fromEntries(
      Object.entries(req.tools).map(([name, spec]) => [
        name,
        tool({ description: spec.description, inputSchema: spec.inputSchema, execute: spec.execute }),
      ]),
    )

    const { signal: abortSignal, timeoutSignal } = composeAbortSignal(req.signal)

    const result = aiStreamText({
      model: resolveModel(req.model),
      system: req.system,
      messages: req.messages,
      tools,
      stopWhen: stepCountIs(req.maxSteps),
      abortSignal,
      maxRetries: 0, // This adapter owns retry, but see the comment below on why this method never uses it.
    })

    // Kicking off aiStreamText() above happens eagerly, the moment
    // runToolConversation() is called. Unlike streamText() above, this
    // method has no retry loop, so there is no laziness to gain from
    // deferring the call. A tool's execute() runs as a side effect
    // partway through the SDK stepping through the conversation, so by
    // the time an error reaches the catch block below, that side effect
    // has already happened. Retrying would call execute() again and
    // repeat it. Errors are still mapped through mapProviderError, so a
    // caller sees the same TextGenerationError taxonomy as the other two
    // methods, only the retry loop is missing. Only the text-delta
    // filtering below is lazy, deferred until the caller iterates the
    // returned value.
    async function* textDeltas(): AsyncGenerator<TextChunk> {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            yield { type: 'text', text: part.text }
          }
        }
      } catch (err) {
        throw mapProviderError(err, { timeoutFired: timeoutSignal.aborted, callerAborted: req.signal?.aborted ?? false })
      }
    }

    return textDeltas()
  }

  return { streamText, generateObject, runToolConversation }
}
