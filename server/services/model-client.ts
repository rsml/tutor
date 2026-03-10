import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getKey } from './key-store.js'

const VALID_PROVIDERS = ['anthropic', 'openai', 'google']
const IMAGE_PROVIDERS = ['openai', 'google']
const MODEL_REGEX = /^[a-zA-Z0-9._:/-]{1,100}$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createModelClient(provider: string, model: string): any {
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`Invalid provider: ${provider}`)
  }
  if (!MODEL_REGEX.test(model)) {
    throw new Error(`Invalid model identifier: ${model}`)
  }

  const apiKey = getKey(provider)
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`)
  }

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey })
      return openai(model)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey })
      return google(model)
    }
    case 'anthropic':
    default: {
      const anthropic = createAnthropic({ apiKey })
      return anthropic(model)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createImageModelClient(provider: string, model: string): any {
  if (!IMAGE_PROVIDERS.includes(provider)) {
    throw new Error(`Provider ${provider} does not support image generation`)
  }
  if (!MODEL_REGEX.test(model)) {
    throw new Error(`Invalid model identifier: ${model}`)
  }

  const apiKey = getKey(provider)
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`)
  }

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey })
      return openai.image(model)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey })
      return google.image(model)
    }
    default:
      throw new Error(`Provider ${provider} does not support image generation`)
  }
}
