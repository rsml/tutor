const VALID_PROVIDERS = ['anthropic', 'openai', 'google'] as const
type Provider = (typeof VALID_PROVIDERS)[number]

const keys = new Map<string, string>()

// Seed from env vars on import
for (const p of VALID_PROVIDERS) {
  const envKey = process.env[`${p.toUpperCase()}_API_KEY`]
  if (envKey) keys.set(p, envKey)
}

function validateProvider(provider: string): asserts provider is Provider {
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    throw new Error(`Invalid provider: ${provider}`)
  }
}

export function setKey(provider: string, key: string): void {
  validateProvider(provider)
  keys.set(provider, key)
}

export function getKey(provider: string): string | null {
  validateProvider(provider)
  return keys.get(provider) ?? null
}

export function removeKey(provider: string): void {
  validateProvider(provider)
  keys.delete(provider)
}

export function hasKey(provider: string): boolean {
  validateProvider(provider)
  return keys.has(provider)
}

export function keyStatus(): Record<string, boolean> {
  return Object.fromEntries(VALID_PROVIDERS.map(p => [p, keys.has(p)]))
}
