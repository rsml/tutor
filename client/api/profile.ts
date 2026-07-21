import type { z } from 'zod'
import type {
  AiRequestSchema,
  InterviewChatBodySchema,
  SuggestSkillsBodySchema,
  UpdateProfileBodySchema,
} from '@shared/contracts'
import type { LearningProfile, Preferences } from '@shared/domain'
import { request } from './http'
import { streamNdjson } from './sse'

/**
 * Endpoints for the learning profile, its skills, and the AI interview and
 * suggestion flows that shape it.
 *
 * Request bodies are inferred from the Zod schemas the server validates
 * against, so a body this module sends cannot drift from what the route
 * accepts. The schemas are imported as types only and compile away, so no
 * validator reaches the browser bundle.
 */

/** One skill in the learning profile's prior knowledge list, reusing the shape LearningProfile already declares. */
export type Skill = LearningProfile['skills'][number]

/** The model and provider choice every AI-backed profile call sends. */
type AiRequest = z.infer<typeof AiRequestSchema>

/**
 * The learning profile as the server answers or accepts it over the wire.
 *
 * This is not LearningProfile from shared/domain.ts. That type's fields are
 * style and identity, the shape the profile is persisted as on disk. The
 * profile route folds those two fields into a single aboutMe string before
 * it answers. That aboutMe field is what every caller actually reads, so
 * this module names the wire shape on its own rather than importing a type
 * that would be misleading.
 */
export interface ProfileResponse {
  aboutMe: string
  preferences: Preferences
  skills: Skill[]
}

/** Fetch the learning profile, meaning About Me, preferences, and prior knowledge skills. */
export async function getProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>('/api/profile')
}

/** Persist the learning profile, meaning About Me, preferences, and prior knowledge skills. */
export async function saveProfile(profile: z.infer<typeof UpdateProfileBodySchema>): Promise<void> {
  await request('/api/profile', { method: 'PUT', body: profile })
}

/** What suggestSkills sends, meaning the reader's background and the skills already on file. */
export type SuggestSkillsBody = z.infer<typeof SuggestSkillsBodySchema>

/** Ask the model to suggest skills to add, given the reader's About Me text and existing skills. */
export async function suggestSkills(body: SuggestSkillsBody): Promise<Skill[]> {
  const { skills } = await request<{ skills: Skill[] }>('/api/profile/suggest-skills', { method: 'POST', body })
  return skills
}

/** Suggested updates to one reader's profile after finishing a book, covering skills, preferences, and a rewritten About Me. */
export interface ProfileSuggestions {
  rationale: string
  skills: {
    added: Array<{ name: string; level: number }>
    removed: string[]
    updated: Array<{ name: string; oldLevel: number; newLevel: number }>
  }
  preferences: Array<{ key: string; oldValue: boolean | number; newValue: boolean | number }>
  aboutMe: string
}

/** Ask the model to suggest profile updates based on one finished book's feedback and quiz history. */
export async function getProfileSuggestions(bookId: string, body: AiRequest): Promise<ProfileSuggestions> {
  return request<ProfileSuggestions>(`/api/books/${bookId}/profile-suggestions`, { method: 'POST', body })
}

/** What streamInterview sends on each turn, meaning the reader's latest message and the conversation so far. */
export type InterviewChatBody = z.infer<typeof InterviewChatBodySchema>

/** One value emitted by the profile interview stream, either assistant text or the finished profile. */
export type InterviewValue =
  | { type: 'text'; content: string }
  | { type: 'profile_complete'; profile: ProfileResponse }

/**
 * Stream one turn of the learning profile interview, forwarding assistant
 * text and the finished profile as they arrive.
 *
 * The signal is optional here, unlike streamChat's. A caller that omits it
 * has no way to abort a turn already in flight. When it is passed and fires,
 * or the connection drops mid-turn, the returned promise rejects. Values
 * already handed to onValue stay delivered, but see streamNdjson in sse.ts
 * for why a value still sitting unterminated in the buffer at that moment is
 * lost rather than flushed.
 */
export async function streamInterview(
  body: InterviewChatBody,
  onValue: (value: InterviewValue) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamNdjson<InterviewValue>('/api/profile/interview', { method: 'POST', body, signal }, onValue)
}
