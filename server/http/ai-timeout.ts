import { AI_GENERATION_TIMEOUT_MS } from '../constants.js'

export function createTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_GENERATION_TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}
