export interface Skill {
  name: string
  level: number
}

export interface Preferences {
  explainComplexTermsSimply: boolean
  codeExamples: boolean
  realWorldAnalogies: boolean
  includeRecaps: boolean
  includeSummaries: boolean
  visualDescriptions: boolean
  depthLevel: number
  pacePreference: number
  metaphorDensity: number
  narrativeStyle: number
  humorLevel: number
  formalityLevel: number
}

export const BOOL_PREF_LABELS: Record<string, string> = {
  explainComplexTermsSimply: 'Explain complex terms simply',
  codeExamples: 'Include code examples',
  realWorldAnalogies: 'Use real-world analogies',
  includeRecaps: 'Recap previous material at chapter start',
  includeSummaries: 'Key takeaways at chapter end',
  visualDescriptions: 'Describe diagrams and visual mental models',
}

export const BOOL_KEYS = Object.keys(BOOL_PREF_LABELS) as Array<keyof typeof BOOL_PREF_LABELS>

export const SLIDER_PREFS: Array<{
  key: keyof Preferences
  label: string
  left: string
  right: string
}> = [
  { key: 'depthLevel', label: 'Depth', left: 'Overview', right: 'Comprehensive' },
  { key: 'pacePreference', label: 'Pace', left: 'Deliberate', right: 'Brisk' },
  { key: 'metaphorDensity', label: 'Metaphors', left: 'Rare', right: 'Frequent' },
  { key: 'narrativeStyle', label: 'Style', left: 'Technical', right: 'Narrative' },
  { key: 'humorLevel', label: 'Humor', left: 'Serious', right: 'Playful' },
  { key: 'formalityLevel', label: 'Formality', left: 'Casual', right: 'Academic' },
]

export const DEFAULT_PREFS: Preferences = {
  explainComplexTermsSimply: true,
  codeExamples: true,
  realWorldAnalogies: true,
  includeRecaps: true,
  includeSummaries: true,
  visualDescriptions: false,
  depthLevel: 3,
  pacePreference: 3,
  metaphorDensity: 3,
  narrativeStyle: 3,
  humorLevel: 2,
  formalityLevel: 3,
}
