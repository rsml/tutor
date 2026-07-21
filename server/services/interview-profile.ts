import type { z } from 'zod'
import { CompleteProfileSchema } from '@shared/contracts.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ChatMessage, TextGeneration, ToolSpec } from '../ports/text-generation.js'

/**
 * One turn of the learning-profile interview. Emits events to `onEvent` in
 * the exact order the model produces them: a `text` event per streamed
 * delta, and a `profile_complete` event, with the profile persisted as a
 * side effect, the instant the model calls the complete_profile tool. The
 * route forwards each event to the client verbatim as one NDJSON line;
 * this function never touches HTTP, so a test can assert on the event
 * sequence directly instead of parsing a response stream.
 *
 * A callback rather than a second async-generator channel, because the
 * profile_complete event originates from the tool's execute() side effect,
 * not from iterating the text stream — runToolConversation() deliberately
 * never surfaces tool calls on its returned iterable (see its port doc).
 * Calling onEvent from both places, exactly as the original handler called
 * a single sendLine() from both places, keeps their relative order
 * whatever it was before.
 */

const INTERVIEW_SYSTEM_PROMPT = `You are conducting a learning profile interview to understand this reader so that an AI-generated book can be perfectly tailored to them. You combine three expert perspectives:

1. **Professional Tutor** — Understand their background, education, expertise areas, strengths/weaknesses, motivation, and learning style.
2. **World-Renowned Writer** — Understand their narrative preferences: metaphor usage, humor tolerance, formality level, storytelling vs technical prose.
3. **World-Renowned Editor** — Understand their pacing preferences, desired depth, whether they want recaps/summaries, visual descriptions, and content structure.

## Interview Rules:
- Ask ONE question at a time
- Start broad (background, what they do, what they're learning) then narrow to specifics (writing style, pace, humor)
- Follow up on interesting answers — dig deeper before moving on
- Ask at least 6-8 questions minimum before considering completion
- Before calling the tool, ask a final "Is there anything else you'd like me to know about how you learn best?"
- Keep responses concise: 2-4 sentences + your question
- When you are confident about ALL 12 preferences (6 booleans + 6 sliders), call the complete_profile tool
- The aboutMe field should be a rich 2-4 sentence synthesis of who this person is as a learner
- Identify their key skills and estimate proficiency levels (1-10) for the skills array

## Preference Keys (for the tool call):
**Booleans:**
- explainComplexTermsSimply: Should complex jargon be broken down?
- codeExamples: Should chapters include code snippets?
- realWorldAnalogies: Use real-world comparisons to explain concepts?
- includeRecaps: Start each chapter with a brief recap of the previous one?
- includeSummaries: End each chapter with key takeaways?
- visualDescriptions: Describe diagrams and visual mental models in text?

**Sliders (1-5):**
- depthLevel: 1=high-level overview, 5=comprehensive deep-dive
- pacePreference: 1=deliberate/slow, 5=brisk/fast-moving
- metaphorDensity: 1=rare metaphors, 5=frequent metaphors
- narrativeStyle: 1=technical/reference-style, 5=narrative/storytelling
- humorLevel: 1=serious/professional, 5=playful/witty
- formalityLevel: 1=casual/conversational, 5=academic/formal

${MARKDOWN_FORMATTING_RULES}`

type CompleteProfileData = z.infer<typeof CompleteProfileSchema>

export type InterviewEvent =
  | { type: 'text'; content: string }
  | { type: 'profile_complete'; profile: CompleteProfileData }

export interface InterviewProfileRequest {
  model: string
  provider?: ProviderId
  userMessage: string
  history: ChatMessage[]
}

export interface InterviewProfileDeps {
  textGeneration: TextGeneration
  bookRepository: BookRepository
}

export async function interviewProfile(
  deps: InterviewProfileDeps,
  req: InterviewProfileRequest,
  onEvent: (event: InterviewEvent) => void,
): Promise<void> {
  const completeProfile: ToolSpec<CompleteProfileData, string> = {
    description: 'Call this when you have gathered enough information to build the complete learning profile. Only call after asking at least 6-8 questions and a final confirmation.',
    inputSchema: CompleteProfileSchema,
    execute: async (profileData) => {
      await deps.bookRepository.saveProfile({
        identity: profileData.aboutMe,
        style: '',
        preferences: profileData.preferences,
        skills: profileData.skills ?? [],
      })
      onEvent({ type: 'profile_complete', profile: profileData })
      return 'Profile saved successfully.'
    },
  }

  const stream = deps.textGeneration.runToolConversation({
    model: { provider: req.provider ?? DEFAULT_PROVIDER, model: req.model },
    system: INTERVIEW_SYSTEM_PROMPT,
    messages: [...req.history, { role: 'user', content: req.userMessage }],
    tools: { complete_profile: completeProfile },
    maxSteps: 2,
  })

  for await (const chunk of stream) {
    onEvent({ type: 'text', content: chunk.text })
  }
}
