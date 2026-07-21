import { z } from 'zod'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { PROFILE_EXCERPT_CHARS } from '../constants.js'
import {
  DEPTH_LABELS,
  PACE_LABELS,
  METAPHOR_LABELS,
  NARRATIVE_LABELS,
  HUMOR_LABELS,
  FORMALITY_LABELS,
} from '../domain/profile-context.js'
import { describeChapterFeedback } from '../domain/learning-evidence.js'

/**
 * Suggests learning-profile updates (skills, preferences, aboutMe) based on
 * a just-completed book's chapter content, reader feedback, and quiz
 * performance. Reads the profile directly through the injected
 * BookRepository port rather than buildProfileContext() — this handler
 * builds its own profile description inline and never called
 * buildProfileContext() even before this extraction.
 *
 * Moved here from assessment.ts's POST /api/books/:id/profile-suggestions,
 * which read as a suggestion route but landed there during the mechanical
 * route split. The route registration now lives in suggestions.ts, where it
 * belongs alongside the other suggestion routes.
 */

export interface SuggestProfileUpdatesDeps {
  books: BookRepository
  textGeneration: TextGeneration
}

export interface SuggestProfileUpdatesRequest {
  bookId: string
  model: string
  provider?: ProviderId
}

export interface ProfileUpdateSuggestion {
  rationale: string
  skills: {
    added: Array<{ name: string; level: number }>
    removed: string[]
    updated: Array<{ name: string; oldLevel: number; newLevel: number }>
  }
  preferences: Array<{ key: string; oldValue: boolean | number; newValue: boolean | number }>
  aboutMe: string
}

export function createSuggestProfileUpdates(deps: SuggestProfileUpdatesDeps) {
  return async function suggestProfileUpdates(req: SuggestProfileUpdatesRequest): Promise<ProfileUpdateSuggestion> {
    const { bookId, model, provider } = req
    const meta = await deps.books.getBook(bookId)
    const toc = await deps.books.getToc(bookId)
    const profile = await deps.books.getProfile()
    const allFeedback = await deps.books.getAllFeedback(bookId)

    // Build chapter summaries (first 300 chars each).
    const chapterSummaries: string[] = []
    for (let i = 1; i <= meta.generatedUpTo; i++) {
      try {
        const content = await deps.books.getChapter(bookId, i)
        chapterSummaries.push(`Chapter ${i} "${toc.chapters[i - 1]?.title}": ${content.slice(0, PROFILE_EXCERPT_CHARS)}...`)
      } catch { /* skip */ }
    }

    const feedbackContext = describeChapterFeedback(allFeedback)

    // Build current profile description for context.
    const currentSkills = profile.skills ?? []
    const skillsDesc = currentSkills.length > 0
      ? currentSkills.map(s => `${s.name} (${s.level}/10)`).join(', ')
      : 'None'

    const prefsDesc = [
      `Explain complex terms simply: ${profile.preferences.explainComplexTermsSimply ? 'On' : 'Off'}`,
      `Code examples: ${profile.preferences.codeExamples ? 'On' : 'Off'}`,
      `Real-world analogies: ${profile.preferences.realWorldAnalogies ? 'On' : 'Off'}`,
      `Recap previous material: ${profile.preferences.includeRecaps ? 'On' : 'Off'}`,
      `Key takeaways at end: ${profile.preferences.includeSummaries ? 'On' : 'Off'}`,
      `Visual descriptions: ${profile.preferences.visualDescriptions ? 'On' : 'Off'}`,
      `Depth: ${DEPTH_LABELS[profile.preferences.depthLevel - 1]} (${profile.preferences.depthLevel}/5)`,
      `Pace: ${PACE_LABELS[profile.preferences.pacePreference - 1]} (${profile.preferences.pacePreference}/5)`,
      `Metaphors: ${METAPHOR_LABELS[profile.preferences.metaphorDensity - 1]} (${profile.preferences.metaphorDensity}/5)`,
      `Style: ${NARRATIVE_LABELS[profile.preferences.narrativeStyle - 1]} (${profile.preferences.narrativeStyle}/5)`,
      `Humor: ${HUMOR_LABELS[profile.preferences.humorLevel - 1]} (${profile.preferences.humorLevel}/5)`,
      `Formality: ${FORMALITY_LABELS[profile.preferences.formalityLevel - 1]} (${profile.preferences.formalityLevel}/5)`,
    ].join('\n')

    return deps.textGeneration.generateObject({
      model: { provider: provider ?? DEFAULT_PROVIDER, model },
      schema: z.object({
        rationale: z.string().describe('1-3 sentence explanation of why these changes are suggested, citing evidence from quiz performance and feedback'),
        skills: z.object({
          added: z.array(z.object({ name: z.string(), level: z.number() })),
          removed: z.array(z.string()),
          updated: z.array(z.object({ name: z.string(), oldLevel: z.number(), newLevel: z.number() })),
        }),
        preferences: z.array(z.object({
          key: z.string(),
          oldValue: z.union([z.boolean(), z.number()]),
          newValue: z.union([z.boolean(), z.number()]),
        })),
        aboutMe: z.string().describe('Updated aboutMe text incorporating new knowledge areas while preserving existing identity'),
      }),
      system: `You are a learning analytics advisor. Analyze the reader's performance in this completed book and suggest updates to their learning profile.

Be conservative — only suggest changes clearly supported by evidence. Cite evidence in your rationale.

For skills: add new areas the book covered that aren't already in the profile, update levels based on quiz performance (high scores = raise level, low scores = keep or lower). Only remove a skill if evidence strongly suggests it's no longer relevant.

For preferences: only change if feedback signals a clear pattern (e.g., reader consistently says chapters are too fast → lower pace).

For aboutMe: incorporate new knowledge areas and accomplishments while preserving the existing identity and voice. If the existing aboutMe is empty, write a brief description based on what you know.

${MARKDOWN_FORMATTING_RULES}`,
      prompt: `Book just completed: "${meta.title}"
Topic: ${meta.prompt}
${meta.rating ? `Reader rating: ${meta.rating}/5` : ''}
${meta.finalQuizScore !== undefined ? `Final quiz score: ${meta.finalQuizScore}/${meta.finalQuizTotal}` : ''}

Table of Contents:
${toc.chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Chapter summaries:
${chapterSummaries.join('\n\n')}

Per-chapter feedback and quiz performance:
${feedbackContext || 'No feedback recorded.'}

Current learning profile:
- About Me: ${profile.identity || '(empty)'}
- Skills: ${skillsDesc}
- Preferences:
${prefsDesc}

Suggest profile updates based on this completed book. Return the complete updated aboutMe text (not a diff). For preferences, use these exact keys: explainComplexTermsSimply, codeExamples, realWorldAnalogies, includeRecaps, includeSummaries, visualDescriptions, depthLevel, pacePreference, metaphorDensity, narrativeStyle, humorLevel, formalityLevel. Boolean preferences use true/false, slider preferences use 1-5.`,
    })
  }
}
