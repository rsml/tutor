import type { SkillProgress } from '@shared/responses'
import { request } from './http'

/** Endpoint for skill mastery rolled up across every book. */

/** Fetch skill mastery and completion stats rolled up across every book. */
export async function getSkillProgress(): Promise<SkillProgress> {
  return request<SkillProgress>('/api/progress/skills')
}
