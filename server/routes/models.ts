import type { FastifyInstance } from 'fastify'
import { getKey } from '../services/key-store.js'
import { MODEL_LIST_TIMEOUT_MS } from '../constants.js'
import { providerParamSchema } from '../http/route-params.js'
import { STATUS_BAD_REQUEST, STATUS_BAD_GATEWAY } from '../http/status.js'

interface ModelOption {
  value: string
  label: string
}

interface ProviderModels {
  chat: ModelOption[]
  image: ModelOption[]
}

interface AnthropicModel { id: string; display_name?: string }
interface OpenAIModel { id: string }
interface GoogleModel { name: string; displayName?: string; supportedGenerationMethods?: string[] }

// Friendly labels for well-known model IDs. Unmatched IDs fall back to upstream
// display_name or the raw ID. Add entries as new headline models ship.
const KNOWN_LABELS: Record<string, string> = {
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1-mini': 'GPT Image 1 Mini',
  'gpt-image-1.5': 'GPT Image 1.5',
  'dall-e-3': 'DALL-E 3 (legacy)',
  'dall-e-2': 'DALL-E 2 (legacy)',
}

function labelFor(id: string, upstreamName?: string): string {
  return KNOWN_LABELS[id] ?? upstreamName ?? id
}

// Versioned snapshots like `gpt-4o-2024-08-06` or `claude-opus-4-20250514`.
// We keep the unversioned alias and drop dated snapshots to reduce noise.
function isDatedSnapshot(id: string): boolean {
  return /-\d{4}-?\d{0,2}-?\d{0,2}$/.test(id) || /-\d{8}$/.test(id)
}

async function fetchAnthropicModels(apiKey: string, signal: AbortSignal): Promise<ProviderModels> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    signal,
  })
  if (!res.ok) throw new Error(`Anthropic /v1/models returned ${res.status}`)
  const data = (await res.json()) as { data?: AnthropicModel[] }
  const chat = (data.data ?? []).map(m => ({
    value: m.id,
    label: labelFor(m.id, m.display_name),
  }))
  return { chat, image: [] }
}

const OPENAI_CHAT_EXCLUDE_TOKENS = [
  'audio', 'tts', 'whisper', 'embedding', 'realtime', 'transcribe',
  'moderation', 'davinci', 'babbage', 'search', 'instruct',
]

async function fetchOpenAIModels(apiKey: string, signal: AbortSignal): Promise<ProviderModels> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI /v1/models returned ${res.status}`)
  const data = (await res.json()) as { data?: OpenAIModel[] }
  const ids = (data.data ?? []).map(m => m.id)

  const chat = ids
    .filter(id => !isDatedSnapshot(id))
    .filter(id => /^(gpt-|o\d)/.test(id))
    .filter(id => !/^(dall-e|gpt-image)/.test(id))
    .filter(id => !OPENAI_CHAT_EXCLUDE_TOKENS.some(tok => id.includes(tok)))
    .sort()
    .map(id => ({ value: id, label: labelFor(id) }))

  const image = ids
    .filter(id => /^(dall-e|gpt-image)/.test(id))
    .filter(id => !isDatedSnapshot(id))
    .sort()
    .map(id => ({ value: id, label: labelFor(id) }))

  return { chat, image }
}

async function fetchGoogleModels(apiKey: string, signal: AbortSignal): Promise<ProviderModels> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { signal })
  if (!res.ok) throw new Error(`Google /v1beta/models returned ${res.status}`)
  const data = (await res.json()) as { models?: GoogleModel[] }
  const all = data.models ?? []

  const chat = all
    .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map(m => {
      const id = m.name.replace(/^models\//, '')
      return { value: id, label: labelFor(id, m.displayName) }
    })

  const image = all
    .filter(m => (m.supportedGenerationMethods ?? []).includes('predict'))
    .filter(m => /imagen/i.test(m.name))
    .map(m => {
      const id = m.name.replace(/^models\//, '')
      return { value: id, label: labelFor(id, m.displayName) }
    })

  return { chat, image }
}

export async function modelsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { provider: string } }>(
    '/api/providers/:provider/models',
    { schema: { params: providerParamSchema } },
    async (request, reply) => {
      const provider = request.params.provider
      const apiKey = getKey(provider)
      if (!apiKey) return reply.status(STATUS_BAD_REQUEST).send({ error: 'No API key configured for ' + provider })

      const signal = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
      try {
        let models: ProviderModels
        switch (provider) {
          case 'anthropic': models = await fetchAnthropicModels(apiKey, signal); break
          case 'openai': models = await fetchOpenAIModels(apiKey, signal); break
          case 'google': models = await fetchGoogleModels(apiKey, signal); break
          default: return reply.status(STATUS_BAD_REQUEST).send({ error: 'Invalid provider' })
        }
        return models
      } catch (err) {
        return reply.status(STATUS_BAD_GATEWAY).send({ error: err instanceof Error ? err.message : 'Failed to fetch models' })
      }
    },
  )
}
