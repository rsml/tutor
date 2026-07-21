import { useCallback, useState } from 'react'
import { getEngineStatus, installEngine, listVoices } from '@client/api'
import type { AudiobookStatus, VoiceInfo } from '@shared/responses'

/**
 * The narration engine's install status and its available voices, owned in
 * one place so the audiobook settings dialog and the voice picker modal
 * don't each hand-roll their own fetch-and-store logic for the same three
 * concerns: engine status, install, and voice listing.
 *
 * Loading stays imperative rather than effect-driven here. Each caller
 * combines this data with its own concerns on its own open-gated effect —
 * the settings dialog derives its initial voice choice from the learning
 * profile, loaded alongside status and voices in one Promise.all — so this
 * hook only owns what to fetch and where the result lives, not when.
 */
export function useAudiobookEngine() {
  const [status, setStatus] = useState<AudiobookStatus | null>(null)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [installing, setInstalling] = useState(false)

  const loadStatus = useCallback(async () => {
    const result = await getEngineStatus()
    setStatus(result)
    return result
  }, [])

  const loadVoices = useCallback(async () => {
    const result = await listVoices()
    setVoices(result)
    return result
  }, [])

  const install = useCallback(async () => {
    setInstalling(true)
    try {
      await installEngine()
    } finally {
      setInstalling(false)
    }
  }, [])

  return { status, voices, installing, loadStatus, loadVoices, install }
}
