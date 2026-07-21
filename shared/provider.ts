import { z } from 'zod'

/**
 * The single source of truth for which AI providers this app knows how to
 * call, and the small set of rules that follow directly from that list: the
 * default provider, the shape a model identifier must match, and a runtime
 * guard for values coming from the network or disk.
 *
 * Before this module, 'anthropic', 'openai', 'google' were declared
 * independently in shared/contracts.ts, server/services/model-client.ts, and
 * server/services/key-store.ts, which is the kind of duplication that drifts
 * silently if a provider is ever added, renamed, or reordered.
 */

export const ProviderSchema = z.enum(['anthropic', 'openai', 'google'])

export type ProviderId = z.infer<typeof ProviderSchema>

/** Every provider id, in schema order. */
export const PROVIDERS = ProviderSchema.options

/** The shape a model identifier must match, e.g. "claude-sonnet-4-20250514" or "gpt-4o". */
export const MODEL_REGEX = /^[a-zA-Z0-9._:/-]{1,100}$/

/** The provider used when a request does not specify one. */
export const DEFAULT_PROVIDER: ProviderId = 'anthropic'

/** Narrows an arbitrary string to a ProviderId, for values read from the network or disk. */
export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider === value)
}
