export type ProviderId = 'anthropic' | 'openai' | 'google'

export interface ModelOption {
  value: string
  label: string
}

export interface ProviderDef {
  id: ProviderId
  name: string
  label: string
  models: ModelOption[]
  defaultModel: string
  placeholder: string
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    label: 'Claude',
    models: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
    placeholder: 'sk-ant-...',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    label: 'ChatGPT',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'o3-mini', label: 'o3 Mini' },
    ],
    defaultModel: 'gpt-4o',
    placeholder: 'sk-...',
  },
  google: {
    id: 'google',
    name: 'Google (Gemini)',
    label: 'Gemini',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro' },
    ],
    defaultModel: 'gemini-2.0-flash',
    placeholder: 'AIza...',
  },
}

export const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'google']

export type AiFunctionGroup = 'generation' | 'quiz' | 'chat' | 'profile' | 'image'

export const FUNCTION_GROUPS: { id: AiFunctionGroup; label: string; description: string }[] = [
  { id: 'generation', label: 'Book Generation', description: 'TOC, chapters, skill classification' },
  { id: 'quiz', label: 'Quizzes', description: 'Chapter quizzes & final quiz' },
  { id: 'chat', label: 'Inline Chat', description: 'Sentence explanations' },
  { id: 'profile', label: 'Profile & Suggestions', description: 'Interview, skill & book suggestions' },
  { id: 'image', label: 'Cover Images', description: 'AI-generated book covers' },
]

export const IMAGE_MODELS: Partial<Record<ProviderId, ModelOption[]>> = {
  openai: [
    { value: 'dall-e-3', label: 'DALL-E 3' },
    { value: 'gpt-image-1', label: 'GPT Image 1' },
  ],
  google: [
    { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0' },
    { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' },
  ],
}
