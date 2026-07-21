import type { ProviderId } from '@shared/provider.js'

/**
 * Abstracts turning a prompt into a cover image. The one real implementation
 * today, `generateImageWithFallback` in `server/services/image-generation.ts`,
 * calls OpenAI's or Google's image endpoint directly over `fetch` and, on a
 * recoverable failure (anything except bad credentials or a content-policy
 * rejection), retries against the next model in a provider-owned fallback
 * chain before giving up entirely. That HTTP and provider detail is
 * entirely adapter work; this port only promises the shape of that
 * behaviour: try the caller's preferred model, fall back on a recoverable
 * failure, stop immediately on one that will not be fixed by trying another
 * model, and report which model actually produced the image.
 *
 * There is no `apiKey` field. The future adapter resolves the key itself
 * from a `KeyVault`, the same way `generateImageWithFallback` calls
 * `getKey()` today.
 */

export interface ImageGenerationRequest {
  provider: ProviderId
  preferredModel: string
  prompt: string
  signal: AbortSignal
}

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

export interface ImageGeneration {
  /**
   * Covers the one real call site, the cover-generation background task in
   * `server/routes/covers.ts`, which calls `generateImageWithFallback`
   * (`server/services/image-generation.ts:185`) as is.
   */
  generate(req: ImageGenerationRequest): Promise<GeneratedImage>
}
