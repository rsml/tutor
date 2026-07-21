import { resolveModelClient } from '../adapters/ai-sdk-text-generation.js'
import { getKey } from './key-store.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createModelClient(provider: string, model: string): any {
  return resolveModelClient({ get: getKey }, provider, model)
}
