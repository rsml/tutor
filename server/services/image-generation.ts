import type { ProviderId } from '@shared/provider.js'
import { getKey, setKey, removeKey, hasKey, keyStatus } from './key-store.js'
import type { KeyVault } from '../ports/key-vault.js'
import { createHttpImageGeneration } from '../adapters/http-image-generation.js'

/**
 * Keeps generateImageWithFallback's current exported signature and
 * behaviour. The real logic now lives behind the ImageGeneration port, in
 * server/adapters/http-image-generation.ts, which takes a KeyVault rather
 * than resolving a key itself. This module adapts server/services/key-store.ts's
 * existing exported functions to that KeyVault shape and constructs one
 * module-scope adapter instance from it, so the adapter itself never
 * imports the key store directly. Callers of generateImageWithFallback see
 * no change.
 */
const keyVault: KeyVault = {
  get: getKey,
  set: setKey,
  remove: removeKey,
  has: hasKey,
  // keyStatus() builds its object from PROVIDERS, so it always has exactly
  // the ProviderId keys this cast asserts, just declared as the wider
  // Record<string, boolean> on the key-store side.
  status: () => keyStatus() as Record<ProviderId, boolean>,
}

const imageGeneration = createHttpImageGeneration({ keyVault })

export interface GeneratedImage {
  data: Buffer
  mediaType: string
  // Diagnostics only — never surface to the user. Used for server-side logs
  // and (eventually) the developer diagnostics panel.
  _diag: {
    modelUsed: string
    /** True when we fell back from the preferred model. Internal only. */
    fellBack: boolean
  }
}

export interface ImageGenerationRequest {
  provider: string
  preferredModel: string
  prompt: string
  signal: AbortSignal
}

export async function generateImageWithFallback(req: ImageGenerationRequest): Promise<GeneratedImage> {
  // keyVault.get (== the real getKey) throws "Invalid provider: ..." for
  // anything that isn't a known ProviderId, the same validation and the
  // same message generateImageWithFallback has always surfaced, just
  // reached through the adapter's own key lookup rather than a direct call
  // here. This cast only widens the compile-time type; it lets no bad
  // value pass silently at runtime.
  return imageGeneration.generate({ ...req, provider: req.provider as ProviderId })
}
