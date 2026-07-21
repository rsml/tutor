import { useCallback, useState } from 'react'
import { getProfile, type ProfileResponse } from '@client/api'

export interface UseLearningProfileResult {
  /** Whether About Me is non-empty, or null before the first fetch settles. */
  configured: boolean | null
  /**
   * Fetches the learning profile and updates `configured`. Resolves with the
   * profile, or null if the request failed, so a caller populating its own
   * edit state can tell a failed fetch apart from a profile that is simply
   * blank.
   */
  refresh: () => Promise<ProfileResponse | null>
}

/**
 * Fetches the learning profile on demand rather than owning a cache, since
 * SettingsMenu, ProfileDialog and SkillsPanel each need the fetch on a
 * different trigger. SettingsMenu calls refresh on mount and again whenever
 * its profile or interview dialog closes, so the settings badge reflects the
 * latest save. ProfileDialog and SkillsPanel call it whenever they open, so
 * they always show the latest saved profile rather than a stale one from
 * the last time they were open. This hook owns the one GET /api/profile
 * implementation those three components shared before; each caller still
 * decides when to call it.
 */
export function useLearningProfile(): UseLearningProfileResult {
  const [configured, setConfigured] = useState<boolean | null>(null)

  const refresh = useCallback(async (): Promise<ProfileResponse | null> => {
    try {
      const profile = await getProfile()
      setConfigured(!!profile.aboutMe?.trim())
      return profile
    } catch {
      setConfigured(false)
      return null
    }
  }, [])

  return { configured, refresh }
}
