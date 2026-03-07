import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createModelClient(provider: string, apiKey: string, model: string): any {
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
