import type { LearningProfile } from '@shared/domain.js'

export const DEPTH_LABELS = ['high-level overview', 'light coverage', 'balanced depth', 'detailed', 'comprehensive deep-dive']
export const PACE_LABELS = ['very deliberate pace', 'measured pace', 'moderate pace', 'brisk pace', 'very fast pace']
export const METAPHOR_LABELS = ['very rare metaphors', 'occasional metaphors', 'moderate metaphors', 'frequent metaphors', 'very frequent metaphors']
export const NARRATIVE_LABELS = ['strictly technical', 'mostly technical', 'balanced technical/narrative', 'mostly narrative', 'fully narrative storytelling']
export const HUMOR_LABELS = ['strictly serious', 'mostly serious', 'light humor okay', 'playful tone', 'witty and playful']
export const FORMALITY_LABELS = ['very casual', 'casual', 'balanced formality', 'somewhat academic', 'formal academic']

/**
 * Formats a learning profile into the "Reader profile:" prompt fragment
 * every generation prompt (table of contents, chapter, TOC revision)
 * embeds. Pure string formatting, no I/O — the caller reads the profile
 * (through BookRepository.getProfile()) and decides what happens when none
 * has been saved yet. server/services/profile-context.ts does exactly
 * that: it reads the profile and swallows the "not found" case into an
 * empty string for every generation service under server/services/ that
 * needs one.
 */
export function describeLearningProfile(profile: LearningProfile): string {
  const parts: string[] = []
  if (profile.identity) parts.push(`Reader background: ${profile.identity}`)
  if (profile.style) parts.push(`Preferred learning style: ${profile.style}`)
  const prefs: string[] = []
  if (profile.preferences.explainComplexTermsSimply) prefs.push('explain complex terms simply')
  if (profile.preferences.codeExamples) prefs.push('include code examples')
  if (profile.preferences.realWorldAnalogies) prefs.push('use real-world analogies')
  if (profile.preferences.includeRecaps) prefs.push('recap previous material at chapter start')
  if (profile.preferences.includeSummaries) prefs.push('include key takeaways at chapter end')
  if (profile.preferences.visualDescriptions) prefs.push('describe diagrams and visual mental models')
  // Slider preferences
  prefs.push(`depth: ${DEPTH_LABELS[profile.preferences.depthLevel - 1]}`)
  prefs.push(`pace: ${PACE_LABELS[profile.preferences.pacePreference - 1]}`)
  prefs.push(`metaphors: ${METAPHOR_LABELS[profile.preferences.metaphorDensity - 1]}`)
  prefs.push(`style: ${NARRATIVE_LABELS[profile.preferences.narrativeStyle - 1]}`)
  prefs.push(`humor: ${HUMOR_LABELS[profile.preferences.humorLevel - 1]}`)
  prefs.push(`formality: ${FORMALITY_LABELS[profile.preferences.formalityLevel - 1]}`)
  if (prefs.length > 0) parts.push(`Writing preferences: ${prefs.join(', ')}`)

  const skills = profile.skills ?? []
  if (skills.length > 0) {
    const strong = skills.filter(s => s.level >= 7).map(s => `${s.name} (${s.level}/10)`)
    const moderate = skills.filter(s => s.level >= 4 && s.level <= 6).map(s => `${s.name} (${s.level}/10)`)
    const limited = skills.filter(s => s.level <= 3).map(s => `${s.name} (${s.level}/10)`)
    const skillParts: string[] = []
    if (strong.length > 0) skillParts.push(`Strong knowledge (>=7): ${strong.join(', ')}`)
    if (moderate.length > 0) skillParts.push(`Moderate knowledge (4-6): ${moderate.join(', ')}`)
    if (limited.length > 0) skillParts.push(`Limited knowledge (<=3): ${limited.join(', ')}`)
    skillParts.push('Adjust depth — skip basics for strong areas, explain fundamentals for weak areas')
    parts.push(`Prior knowledge:\n${skillParts.join('\n')}`)
  } else {
    parts.push('No explicit skill ratings provided — infer prior knowledge from the reader background above')
  }

  return parts.join('\n')
}
