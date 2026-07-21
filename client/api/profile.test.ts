import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Preferences } from '@shared/domain'
import { ApiError } from './http'
import {
  getProfile,
  saveProfile,
  suggestSkills,
  getProfileSuggestions,
  streamInterview,
  type ProfileResponse,
  type InterviewValue,
} from './profile'

/**
 * The learning profile, its skills, and the AI interview and suggestion
 * flows that shape it. getProfile and saveProfile both use the wire shape
 * this module names ProfileResponse rather than the LearningProfile domain
 * type, since the server folds identity and style into a single aboutMe
 * string before it answers.
 */

const SAMPLE_PREFERENCES: Preferences = {
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

/** A response whose body arrives in the given pieces rather than all at once, matching the helper sse.test.ts uses for the same purpose. */
function chunkedResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, init)
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
})

describe('getProfile', () => {
  it('requests the profile', async () => {
    const payload: ProfileResponse = {
      aboutMe: 'A backend engineer learning audio synthesis.',
      preferences: SAMPLE_PREFERENCES,
      skills: [{ name: 'TypeScript', level: 8 }],
    }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await getProfile()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/profile')
    expect((init as RequestInit).method).toBeUndefined()
    expect(result).toEqual(payload)
  })

  it('throws an ApiError carrying the status and the reason the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Profile is corrupt' }), { status: 500 }))

    const failure = await getProfile().catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(500)
    expect((failure as Error).message).toBe('Profile is corrupt')
  })
})

describe('saveProfile', () => {
  it('puts the profile with the given about me, preferences, and skills', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const profile: ProfileResponse = {
      aboutMe: 'A backend engineer learning audio synthesis.',
      preferences: SAMPLE_PREFERENCES,
      skills: [{ name: 'TypeScript', level: 8 }],
    }

    await saveProfile(profile)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/profile')
    expect((init as RequestInit).method).toBe('PUT')
    expect((init as RequestInit).body).toBe(JSON.stringify(profile))
  })
})

describe('suggestSkills', () => {
  it('posts the about me text and existing skills, and unwraps the response', async () => {
    const suggested = [{ name: 'Rust', level: 4 }]
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ skills: suggested }), { status: 200 }))
    const body = {
      model: 'claude-sonnet-4-5',
      provider: 'anthropic' as const,
      aboutMe: 'A backend engineer.',
      existingSkills: [{ name: 'TypeScript', level: 8 }],
    }

    const result = await suggestSkills(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/profile/suggest-skills')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual(suggested)
  })
})

describe('getProfileSuggestions', () => {
  it('posts the model and provider for one book, and returns the suggestions', async () => {
    const suggestions = {
      rationale: 'Quiz scores were strong on async patterns.',
      skills: { added: [{ name: 'Concurrency', level: 6 }], removed: [], updated: [] },
      preferences: [{ key: 'depthLevel', oldValue: 3, newValue: 4 }],
      aboutMe: 'A backend engineer who now understands audio synthesis.',
    }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(suggestions), { status: 200 }))
    const body = { model: 'claude-sonnet-4-5', provider: 'anthropic' as const }

    const result = await getProfileSuggestions('ada', body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/profile-suggestions')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual(suggestions)
  })

  it('throws an ApiError carrying the status and the reason the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Book is not fully generated' }), { status: 400 }),
    )

    const failure = await getProfileSuggestions('ada', { model: 'claude-sonnet-4-5' }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(400)
    expect((failure as Error).message).toBe('Book is not fully generated')
  })
})

describe('streamInterview', () => {
  it('posts the message and history, and reports assistant text', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['{"type":"text","content":"Tell me more."}\n']))
    const body = {
      model: 'claude-sonnet-4-5',
      provider: 'anthropic' as const,
      userMessage: 'I am a backend engineer.',
      history: [],
    }
    const values: InterviewValue[] = []

    await streamInterview(body, v => values.push(v))

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/profile/interview')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(values).toEqual([{ type: 'text', content: 'Tell me more.' }])
  })

  it('reports both assistant text and the finished profile, the last of which arrives with no trailing newline', async () => {
    const profile: ProfileResponse = {
      aboutMe: 'A backend engineer learning audio synthesis.',
      preferences: SAMPLE_PREFERENCES,
      skills: [{ name: 'TypeScript', level: 8 }],
    }
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      '{"type":"text","content":"Got it."}\n',
      `{"type":"profile_complete","profile":${JSON.stringify(profile)}}`,
    ]))
    const values: InterviewValue[] = []

    await streamInterview(
      { model: 'claude-sonnet-4-5', userMessage: 'That is everything.', history: [] },
      v => values.push(v),
    )

    expect(values).toEqual([
      { type: 'text', content: 'Got it.' },
      { type: 'profile_complete', profile },
    ])
  })

  it('forwards the abort signal', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['{"type":"text","content":"hi"}\n']))
    const controller = new AbortController()

    await streamInterview(
      { model: 'claude-sonnet-4-5', userMessage: 'hi', history: [] },
      () => {},
      controller.signal,
    )

    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal)
  })
})
