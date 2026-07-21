import { z } from 'zod'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { TextGeneration } from '../ports/text-generation.js'

/**
 * POST /api/profile/suggest-skills: asks the model to propose skills and
 * proficiency levels from a free-text "about me" description, excluding
 * whatever the reader already listed.
 *
 * The result schema is deliberately looser than shared/domain.ts's
 * SkillSchema (no bounds on level or name length) because this is the raw
 * model suggestion before the reader edits it, not the stored profile.
 */

const SuggestedSkillsSchema = z.object({
  skills: z.array(z.object({
    name: z.string(),
    level: z.number(),
  })),
})

export type SuggestedSkills = z.infer<typeof SuggestedSkillsSchema>

export interface SuggestSkillsRequest {
  model: string
  provider?: ProviderId
  aboutMe: string
  existingSkills: Array<{ name: string; level: number }>
}

export interface SuggestSkillsDeps {
  textGeneration: TextGeneration
}

export async function suggestSkills(deps: SuggestSkillsDeps, req: SuggestSkillsRequest): Promise<SuggestedSkills> {
  const { aboutMe, existingSkills } = req

  const existingSkillsSection = existingSkills.length > 0
    ? `They already have these skills listed (do NOT suggest duplicates):\n${existingSkills.map(s => `- ${s.name}: ${s.level}/10`).join('\n')}`
    : ''

  return deps.textGeneration.generateObject({
    model: { provider: req.provider ?? DEFAULT_PROVIDER, model: req.model },
    schema: SuggestedSkillsSchema,
    prompt: `Based on this person's background, suggest 3-8 skills/knowledge areas with estimated proficiency levels (1-10).

About the person:
${aboutMe}

${existingSkillsSection}

Suggest skills that are relevant to their background and learning goals. Rate their likely proficiency honestly based on what they described. Include both strengths and areas where they might be learning.`,
  })
}
