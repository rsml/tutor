import type { ProviderId } from '@shared/provider.js'
import type { KeyVault } from '../ports/key-vault.js'
import type { GeneratedImage, ImageGeneration, ImageGenerationRequest } from '../ports/image-generation.js'

/**
 * The real ImageGeneration adapter. Its logic is lifted from the pre-port
 * server/services/image-generation.ts, which calls OpenAI's or Google's
 * image endpoint directly over fetch and, on a recoverable failure, falls
 * back through a provider-owned chain of known-good models before giving
 * up entirely.
 *
 * Design goals, in priority order: always produce some image if any
 * configured model can produce one, send the minimum request body that is
 * guaranteed to work, recover silently from parameter-shape drift (a new
 * model rejected a param), fall back to a known-good model when the
 * user's preferred one breaks, and never crash on a recoverable error,
 * only surface auth or content-policy failures.
 *
 * The one real change from that module is that it never resolves an API
 * key itself. A KeyVault is injected instead, so this adapter depends on
 * the KeyVault port rather than importing a concrete key store module
 * directly. fetch is injected too,
 * defaulting to the global, so a test can assert every path (success,
 * fallback, auth failure, content-policy failure, exhausted chain)
 * without ever making a real HTTP request.
 */

// Known-good models per provider, in preferred order. Used as fallbacks when
// the user's preferred model fails for a recoverable reason. Keep small —
// these are last-resort defaults, not a curation.
const FALLBACK_CHAINS: Partial<Record<ProviderId, string[]>> = {
  openai: ['gpt-image-1', 'dall-e-3'],
  google: ['imagen-4.0-generate-001'],
}

// Per-family optional parameters. Only added to the request when the model
// matches. Unknown families get just {model, prompt} — produces a default-size
// image but never errors on parameter rejection.
interface OpenAIFamily {
  match: (model: string) => boolean
  portraitSize: `${number}x${number}`
}

const OPENAI_FAMILIES: OpenAIFamily[] = [
  { match: m => m.startsWith('gpt-image-'), portraitSize: '1024x1536' },
  { match: m => m === 'dall-e-3', portraitSize: '1024x1792' },
]

function openaiOptionalParams(model: string): Record<string, unknown> {
  const family = OPENAI_FAMILIES.find(f => f.match(model))
  return family ? { size: family.portraitSize } : {}
}

// Error categories drive the recovery decision. Auth errors never fall back
// (a bad key won't get better with another model); model/parameter errors
// trigger the fallback chain.
type ErrorCategory =
  | { kind: 'auth' } // bad/missing key — bail to user
  | { kind: 'rate-limit'; retryAfterMs?: number } // wait + retry same model
  | { kind: 'invalid-param'; param: string } // strip param + retry same model
  | { kind: 'model-unavailable' } // try next model in chain
  | { kind: 'content-policy' } // bail — won't help to retry
  | { kind: 'server'; status: number } // retry same model once
  | { kind: 'network' } // retry same model once
  | { kind: 'unknown'; message: string } // try next model in chain

function categorizeOpenAIError(status: number, body: string): ErrorCategory {
  if (status === 401 || status === 403) return { kind: 'auth' }
  if (status === 429) return { kind: 'rate-limit' }
  let parsed: { error?: { message?: string; code?: string; type?: string } } = {}
  try { parsed = JSON.parse(body) } catch { /* leave empty */ }
  const message = parsed.error?.message ?? ''
  const code = parsed.error?.code ?? ''
  if (status === 404 || /model_not_found|does not exist/i.test(message)) {
    return { kind: 'model-unavailable' }
  }
  if (status === 400) {
    const m = message.match(/Unknown parameter:\s*'([^']+)'/)
    if (m) return { kind: 'invalid-param', param: m[1] }
    if (/content_policy|safety|policy/i.test(message + code)) return { kind: 'content-policy' }
  }
  if (status >= 500) return { kind: 'server', status }
  return { kind: 'unknown', message: message || body.slice(0, 200) }
}

function categorizeGoogleError(status: number, body: string): ErrorCategory {
  if (status === 401 || status === 403) return { kind: 'auth' }
  if (status === 429) return { kind: 'rate-limit' }
  if (status === 404) return { kind: 'model-unavailable' }
  if (status >= 500) return { kind: 'server', status }
  return { kind: 'unknown', message: body.slice(0, 200) }
}

// Single attempt against one model. Throws a categorized error for the chain
// dispatcher to interpret.
class CategorizedError extends Error {
  constructor(public category: ErrorCategory, message: string) {
    super(message)
  }
}

export interface HttpImageGenerationDeps {
  keyVault: KeyVault
  /** Defaults to the global fetch. Inject a fake so a test never makes a real HTTP request. */
  fetch?: typeof fetch
}

export function createHttpImageGeneration(deps: HttpImageGenerationDeps): ImageGeneration {
  const { keyVault } = deps
  const doFetch = deps.fetch ?? fetch

  async function attemptOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    signal: AbortSignal,
    stripParams: Set<string> = new Set(),
  ): Promise<GeneratedImage> {
    const body: Record<string, unknown> = { model, prompt, ...openaiOptionalParams(model) }
    for (const p of stripParams) delete body[p]

    const res = await doFetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }).catch(err => {
      if (signal.aborted) throw err
      throw new CategorizedError({ kind: 'network' }, err instanceof Error ? err.message : 'network error')
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      const category = categorizeOpenAIError(res.status, errBody)
      // Handle strip-and-retry inline so it doesn't consume a fallback step
      if (category.kind === 'invalid-param' && !stripParams.has(category.param) && category.param in body) {
        console.warn(`[image-gen] OpenAI ${model} rejected param '${category.param}', retrying without it`)
        const next = new Set(stripParams); next.add(category.param)
        return attemptOpenAI(apiKey, model, prompt, signal, next)
      }
      throw new CategorizedError(category, `OpenAI ${res.status}: ${errBody.slice(0, 200)}`)
    }

    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
    const item = json.data?.[0]
    if (item?.b64_json) {
      return { data: Buffer.from(item.b64_json, 'base64'), mediaType: 'image/png', _diag: { modelUsed: model, fellBack: false } }
    }
    if (item?.url) {
      const r = await doFetch(item.url, { signal })
      if (!r.ok) throw new CategorizedError({ kind: 'unknown', message: `image download failed: ${r.status}` }, `image download ${r.status}`)
      return { data: Buffer.from(await r.arrayBuffer()), mediaType: r.headers.get('content-type') ?? 'image/png', _diag: { modelUsed: model, fellBack: false } }
    }
    throw new CategorizedError({ kind: 'unknown', message: 'no image in response' }, 'OpenAI returned no image data')
  }

  async function attemptGoogle(apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<GeneratedImage> {
    const parameters: Record<string, unknown> = { sampleCount: 1 }
    if (/imagen/i.test(model)) parameters.aspectRatio = '9:16'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters }),
      signal,
    }).catch(err => {
      if (signal.aborted) throw err
      throw new CategorizedError({ kind: 'network' }, err instanceof Error ? err.message : 'network error')
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new CategorizedError(categorizeGoogleError(res.status, errBody), `Google ${res.status}: ${errBody.slice(0, 200)}`)
    }
    const json = (await res.json()) as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] }
    const pred = json.predictions?.[0]
    if (!pred?.bytesBase64Encoded) {
      throw new CategorizedError({ kind: 'unknown', message: 'no image in response' }, 'Google returned no image data')
    }
    return { data: Buffer.from(pred.bytesBase64Encoded, 'base64'), mediaType: pred.mimeType ?? 'image/png', _diag: { modelUsed: model, fellBack: false } }
  }

  async function attemptOnce(provider: ProviderId, apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<GeneratedImage> {
    if (provider === 'openai') return attemptOpenAI(apiKey, model, prompt, signal)
    if (provider === 'google') return attemptGoogle(apiKey, model, prompt, signal)
    throw new CategorizedError({ kind: 'unknown', message: `unsupported provider: ${provider}` }, `unsupported provider: ${provider}`)
  }

  return {
    // Build the model list to try: user's preferred first, then known-good
    // fallbacks (dedup'd, skipping the preferred). On categorized recoverable
    // errors, advance to the next model. On hard errors (auth, content
    // policy), bail immediately — those won't get better with a different
    // model.
    async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
      const apiKey = keyVault.get(req.provider)
      if (!apiKey) throw new Error(`No API key configured for ${req.provider}`)

      const chain = [req.preferredModel, ...(FALLBACK_CHAINS[req.provider] ?? [])]
        .filter((m, i, arr) => arr.indexOf(m) === i) // dedup

      let lastError: CategorizedError | undefined
      for (const model of chain) {
        if (req.signal.aborted) throw new Error('cancelled')
        try {
          const result = await attemptOnce(req.provider, apiKey, model, req.prompt, req.signal)
          result._diag.fellBack = model !== req.preferredModel
          if (result._diag.fellBack) {
            // Server-side log only — never surfaces to the user. They get a cover; that's all they need to know.
            console.warn(`[image-gen] Preferred ${req.preferredModel} failed; produced image with ${model} instead`)
          }
          return result
        } catch (err) {
          if (!(err instanceof CategorizedError)) throw err
          lastError = err
          const cat = err.category
          // Hard stops: these won't be fixed by trying a different model
          if (cat.kind === 'auth') throw new Error(`Authentication failed for ${req.provider}. Check your API key in Settings.`, { cause: err })
          if (cat.kind === 'content-policy') throw new Error('Image rejected by content policy. Try a different prompt.', { cause: err })
          // Soft stops: try the next model in chain
          console.warn(`[image-gen] ${req.provider}/${model} failed (${cat.kind}): ${err.message}`)
        }
      }
      throw new Error(`All image models failed. Last error: ${lastError?.message ?? 'unknown'}`)
    },
  }
}
