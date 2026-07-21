import { useEffect } from 'react'
import { useAppDispatch, setProviderApiKey } from '@client/store'
import { PROVIDER_IDS } from '@client/lib/providers'
import { getApiKeyStatus, saveApiKey } from '@client/api'

/**
 * Loads API keys out of Electron's secure storage on startup, mirrors each
 * onto the server, and records it in Redux. `window.electronAPI` does not
 * exist in the plain-browser dev server, so every access below stays
 * optional — this hook must behave identically with or without Electron.
 */
export function useElectronApiKeys(): void {
  const dispatch = useAppDispatch()

  useEffect(() => {
    const populated = new Set<string>()
    const loadPromises: Promise<void>[] = []

    if (window.electronAPI) {
      // Load API keys from secure storage and POST to server
      for (const provider of PROVIDER_IDS) {
        loadPromises.push(
          window.electronAPI.loadApiKey(provider).then(async key => {
            if (key) {
              try {
                await saveApiKey(provider, key)
              } catch { /* server may not be ready */ }
              dispatch(setProviderApiKey({ provider, apiKey: key }))
              populated.add(provider)
            }
          }).catch(() => {})
        )
      }
      // Also try loading legacy key (no provider suffix) into anthropic
      loadPromises.push(
        window.electronAPI.loadApiKey().then(async key => {
          if (key) {
            try {
              await saveApiKey('anthropic', key)
            } catch { /* server may not be ready */ }
            dispatch(setProviderApiKey({ provider: 'anthropic', apiKey: key }))
            populated.add('anthropic')
          }
        }).catch(() => {})
      )
    }

    // Belt-and-suspenders: after local IPC attempts (or if not in Electron),
    // ask the server which providers it considers configured. If main.ts
    // already posted a key whose .enc file the renderer's IPC couldn't read
    // (race or transient IPC failure), this still surfaces it in Redux as
    // 'configured' so the UI doesn't falsely show "no key".
    Promise.all(loadPromises).then(() =>
      getApiKeyStatus()
        .then((status) => {
          for (const provider of PROVIDER_IDS) {
            if (status[provider] && !populated.has(provider)) {
              dispatch(setProviderApiKey({ provider, apiKey: 'configured' }))
            }
          }
        })
        .catch(() => {})
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
