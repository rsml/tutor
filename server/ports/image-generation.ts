import type { ProviderId } from '@shared/provider.js'

/**
 * Abstracts turning a prompt into a cover image. The port promises a shape
 * and nothing more. Try the caller's preferred model, fall back to the next
 * model in the chain on a recoverable failure, stop immediately on one that
 * trying another model will not fix, and report which model actually
 * produced the image. Which HTTP endpoint is called, and what the fallback
 * chain contains, is adapter work.
 *
 * There is no `apiKey` field, by design. The adapter resolves the key from
 * a `KeyVault` so a caller never handles one.
 *
 * server/adapters/http-image-generation.ts is the real adapter today,
 * already built and already injecting a KeyVault rather than resolving a
 * key itself. The in-memory fake is image-generation.fake.ts's
 * createFakeImageGeneration, and the shared behavioural spec both must
 * satisfy is image-generation.contract.ts's describeImageGenerationContract,
 * fake only, since a real subject would spend money against a live
 * provider.
 */

/**
 * preferredModel is the only model this request names. The fallback chain
 * it may fall through to on a recoverable failure is owned entirely by the
 * adapter, per the file header above, and is not configurable here.
 */
export interface ImageGenerationRequest {
  provider: ProviderId
  preferredModel: string
  prompt: string
  signal: AbortSignal
}

/**
 * data and mediaType feed straight into ArtifactStore.saveCover once the
 * caller confirms the cover is still wanted (server/services/generate-cover.ts
 * guards this with a race check). Neither is re-validated in between, so
 * an adapter's mediaType must already be one saveCover accepts.
 */
export interface GeneratedImage {
  data: Buffer
  mediaType: string
  /**
   * Diagnostics only, never surfaced to the user. Mirrors the real
   * function's own `_diag` field.
   */
  _diag: {
    modelUsed: string
    /** True when the preferred model failed and a fallback model produced this image instead. */
    fellBack: boolean
  }
}

/**
 * A single method, deliberately. Unlike TextGeneration, which bundles
 * three shapes behind one port because many call sites need them, this
 * port has exactly one real caller today, so it exposes exactly the one
 * operation that caller needs.
 */
export interface ImageGeneration {
  /**
   * Covers the one real call site, the cover-generation background task in
   * `server/routes/covers.ts`, which calls `generateImageWithFallback`
   * (`server/services/image-generation.ts:185`) as is.
   */
  generate(req: ImageGenerationRequest): Promise<GeneratedImage>
}
