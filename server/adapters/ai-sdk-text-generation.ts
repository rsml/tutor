import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject as aiGenerateObject, streamText as aiStreamText, stepCountIs, tool } from 'ai'
import type { LanguageModel, RepairTextFunction } from 'ai'
import { isProviderId, MODEL_REGEX, type ProviderId } from '@shared/provider.js'
import { AI_GENERATION_TIMEOUT_MS } from '../constants.js'
import type { KeyVault } from '../ports/key-vault.js'
import type {
  GenerateObjectRequest,
  ModelRef,
  RunToolConversationRequest,
  StreamTextRequest,
  TextChunk,
  TextGeneration,
} from '../ports/text-generation.js'

/**
 * The real TextGeneration adapter. Every call site listed in
 * server/ports/text-generation.ts now goes through it instead of calling
 * the `ai` package directly, which makes this the only module in server/
 * allowed to import from the `ai` package.
 *
 * It owns three things that were duplicated across those call sites before
 * this port existed. The first is resolving a provider + model into a
 * callable client, lifted from the pre-port `services/model-client.ts`.
 * The second is the five-minute generation
 * timeout, composed by {@link composeAbortSignal}. The third is the
 * `experimental_repairText` logging hook used when a model's JSON output
 * fails to parse. Previously that hook only ran on the
 * `/api/books/suggest` route. Every `generateObject` call made through
 * this adapter gets it now.
 */

export interface AiSdkTextGenerationDeps {
  keyVault: KeyVault
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
    throw new Error(`No API key configured for provider: ${provider}`)
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
 */
export function composeAbortSignal(signal?: AbortSignal, timeoutMs: number = AI_GENERATION_TIMEOUT_MS): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

const repairText: RepairTextFunction = async ({ text, error }) => {
  console.warn('[ai-sdk-text-generation] generateObject returned an unparseable payload', {
    rawText: text,
    errName: error.name,
    errMsg: error.message,
  })
  return null
}

export function createAiSdkTextGeneration(deps: AiSdkTextGenerationDeps): TextGeneration {
  function resolveModel(ref: ModelRef): LanguageModel {
    return resolveModelClient(deps.keyVault, ref.provider, ref.model)
  }

  function streamText(req: StreamTextRequest): AsyncIterable<string> {
    const model = resolveModel(req.model)
    const abortSignal = composeAbortSignal(req.signal)
    // The AI SDK's Prompt type is a `{ prompt } | { messages }` union. A
    // single object literal can't carry both keys at once and still
    // satisfy it, even though at most one of req.prompt/req.messages is
    // ever set. Branching keeps each call site's object literal to
    // exactly one of the two.
    const result = req.messages
      ? aiStreamText({ model, system: req.system, messages: req.messages, abortSignal })
      : aiStreamText({ model, system: req.system, prompt: req.prompt ?? '', abortSignal })
    return result.textStream
  }

  async function generateObject<T>(req: GenerateObjectRequest<T>): Promise<T> {
    const result = await aiGenerateObject({
      model: resolveModel(req.model),
      schema: req.schema,
      prompt: req.prompt,
      system: req.system,
      schemaName: req.schemaName,
      schemaDescription: req.schemaDescription,
      abortSignal: composeAbortSignal(req.signal),
      experimental_repairText: repairText,
    })
    return result.object
  }

  function runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk> {
    const tools = Object.fromEntries(
      Object.entries(req.tools).map(([name, spec]) => [
        name,
        tool({ description: spec.description, inputSchema: spec.inputSchema, execute: spec.execute }),
      ]),
    )

    const result = aiStreamText({
      model: resolveModel(req.model),
      system: req.system,
      messages: req.messages,
      tools,
      stopWhen: stepCountIs(req.maxSteps),
      abortSignal: composeAbortSignal(req.signal),
    })

    // Kicking off aiStreamText() above happens eagerly, the moment
    // runToolConversation() is called, matching how streamText() behaves
    // in every real call site today. Only the text-delta filtering below
    // is lazy, deferred until the caller iterates the returned value.
    async function* textDeltas(): AsyncGenerator<TextChunk> {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield { type: 'text', text: part.text }
        }
      }
    }

    return textDeltas()
  }

  return { streamText, generateObject, runToolConversation }
}
