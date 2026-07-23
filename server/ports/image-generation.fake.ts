import type { ProviderId } from '@shared/provider.js'
import type { GeneratedImage, ImageGeneration, ImageGenerationRequest } from './image-generation.js'

/**
 * In-memory ImageGeneration. Reproduces the real adapter's fallback-chain
 * shape, try the preferred model, walk a provider-owned chain on a
 * recoverable failure, stop immediately on an 'auth' or 'content-policy'
 * failure, without any HTTP call. The "provider" it talks to is a script
 * the test supplies through `failNextAttempt`; a generated image's bytes
 * are a deterministic placeholder derived from the request, never real
 * image data.
 *
 * `openai` and `google` get a small default fallback chain out of the box
 * (mirroring which providers the real `FALLBACK_CHAINS` covers) so the
 * fallback path is exercisable without a test having to configure one. The
 * model names in that default chain are fake and only exist so a test can
 * assert that generate() moved on to a different model, never assert an
 * exact real model id.
 */

type FakeImageFailureReason = 'auth' | 'content-policy' | 'recoverable'

interface ScriptedFailure {
  reason: FakeImageFailureReason
  message?: string
}

const DEFAULT_FALLBACK_CHAINS: Partial<Record<ProviderId, string[]>> = {
  openai: ['fake-openai-fallback-1', 'fake-openai-fallback-2'],
  google: ['fake-google-fallback-1'],
}

export interface FakeImageGenerationOptions {
  fallbackChains?: Partial<Record<ProviderId, string[]>>
}

export interface FakeImageGeneration extends ImageGeneration {
  /** Every request handed to generate(), in call order. */
  requests: ImageGenerationRequest[]
  /**
   * Makes the next attempt against `model` on `provider` fail. Consumed
   * once, the same model succeeds on a later call unless failed again.
   * 'auth' and 'content-policy' stop the chain walk immediately, exactly
   * like the real function; 'recoverable' (the default) advances to the
   * next model in the chain.
   */
  failNextAttempt(provider: ProviderId, model: string, reason?: FakeImageFailureReason, message?: string): void
}

export function createFakeImageGeneration(options: FakeImageGenerationOptions = {}): FakeImageGeneration {
  const fallbackChains = { ...DEFAULT_FALLBACK_CHAINS, ...options.fallbackChains }
  const requests: ImageGenerationRequest[] = []
  const scriptedFailures = new Map<string, ScriptedFailure>()

  function chainKey(provider: ProviderId, model: string): string {
    return `${provider}:${model}`
  }

  function failNextAttempt(provider: ProviderId, model: string, reason: FakeImageFailureReason = 'recoverable', message?: string): void {
    scriptedFailures.set(chainKey(provider, model), { reason, message })
  }

  async function generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    requests.push(req)
    if (req.signal.aborted) throw req.signal.reason

    const chain = [req.preferredModel, ...(fallbackChains[req.provider] ?? [])]
      .filter((model, i, arr) => arr.indexOf(model) === i)

    let lastMessage: string | undefined
    for (const model of chain) {
      const key = chainKey(req.provider, model)
      const failure = scriptedFailures.get(key)
      if (!failure) {
        return {
          data: Buffer.from(`fake-image:${req.provider}:${model}`),
          mediaType: 'image/png',
          _diag: { modelUsed: model, fellBack: model !== req.preferredModel },
        }
      }
      scriptedFailures.delete(key)
      if (failure.reason === 'auth') {
        throw new Error(failure.message ?? `Authentication failed for ${req.provider}. Check your API key in Settings.`)
      }
      if (failure.reason === 'content-policy') {
        throw new Error(failure.message ?? 'Image rejected by content policy. Try a different prompt.')
      }
      lastMessage = failure.message ?? `${req.provider}/${model} failed`
    }
    throw new Error(`All image models failed. Last error: ${lastMessage ?? 'unknown'}`)
  }

  return { requests, failNextAttempt, generate }
}
