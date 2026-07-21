import { describe, it, expect } from 'vitest'
import type { LearningProfile } from '@shared/domain.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { interviewProfile, type InterviewEvent } from './interview-profile.js'

const PREFERENCES: LearningProfile['preferences'] = {
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

async function run(
  textGeneration: ReturnType<typeof createFakeTextGeneration>,
  bookRepository: ReturnType<typeof createFakeBookRepository>,
  overrides: Partial<{ userMessage: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }> = {},
): Promise<InterviewEvent[]> {
  const events: InterviewEvent[] = []
  await interviewProfile(
    { textGeneration, bookRepository },
    { model: 'claude-sonnet-4-6', userMessage: overrides.userMessage ?? 'Hi', history: overrides.history ?? [] },
    (event) => events.push(event),
  )
  return events
}

describe('interviewProfile', () => {
  it('emits a text event per streamed delta', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptToolConversation([{ type: 'text', text: 'Tell me about your background.' }])
    const bookRepository = createFakeBookRepository()

    const events = await run(textGeneration, bookRepository)

    expect(events).toEqual([{ type: 'text', content: 'Tell me about your background.' }])
  })

  it('persists the profile and emits profile_complete when the tool fires, after the preceding text', async () => {
    const textGeneration = createFakeTextGeneration()
    const profileData = { aboutMe: 'A curious engineer.', preferences: PREFERENCES, skills: [{ name: 'Rust', level: 4 }] }
    textGeneration.scriptToolConversation([
      { type: 'text', text: 'Great, thanks for sharing!' },
      { type: 'tool-call', tool: 'complete_profile', input: profileData },
    ])
    const bookRepository = createFakeBookRepository()

    const events = await run(textGeneration, bookRepository, { userMessage: 'That is everything.' })

    expect(events).toEqual([
      { type: 'text', content: 'Great, thanks for sharing!' },
      { type: 'profile_complete', profile: profileData },
    ])
    await expect(bookRepository.getProfile()).resolves.toEqual({
      identity: 'A curious engineer.',
      style: '',
      preferences: PREFERENCES,
      skills: [{ name: 'Rust', level: 4 }],
    })
  })

  it('defaults skills to an empty array when the tool call omits them', async () => {
    const textGeneration = createFakeTextGeneration()
    const profileData = { aboutMe: 'A curious engineer.', preferences: PREFERENCES }
    textGeneration.scriptToolConversation([{ type: 'tool-call', tool: 'complete_profile', input: profileData }])
    const bookRepository = createFakeBookRepository()

    await run(textGeneration, bookRepository)

    await expect(bookRepository.getProfile()).resolves.toMatchObject({ skills: [] })
  })

  it('never persists a profile when the tool never fires', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptToolConversation([{ type: 'text', text: 'What do you do for work?' }])
    const bookRepository = createFakeBookRepository()

    await run(textGeneration, bookRepository)

    await expect(bookRepository.getProfile()).rejects.toThrow()
  })

  it('passes the prior history plus the new user message to the model, in order', async () => {
    const textGeneration = createFakeTextGeneration()
    const bookRepository = createFakeBookRepository()

    await run(textGeneration, bookRepository, {
      userMessage: 'And one more thing.',
      history: [{ role: 'assistant', content: 'What do you do for work?' }],
    })

    expect(textGeneration.requests.runToolConversation[0].messages).toEqual([
      { role: 'assistant', content: 'What do you do for work?' },
      { role: 'user', content: 'And one more thing.' },
    ])
  })

  it('caps the conversation at two steps', async () => {
    const textGeneration = createFakeTextGeneration()
    const bookRepository = createFakeBookRepository()

    await run(textGeneration, bookRepository)

    expect(textGeneration.requests.runToolConversation[0].maxSteps).toBe(2)
  })

  it('defaults to the anthropic provider when none is given', async () => {
    const textGeneration = createFakeTextGeneration()
    const bookRepository = createFakeBookRepository()

    await run(textGeneration, bookRepository)

    expect(textGeneration.requests.runToolConversation[0].model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })
})
