interface ElectronAPI {
  platform: string
  storageGet: (key: string) => Promise<string | null>
  storageSet: (key: string, value: string) => Promise<void>
  storageRemove: (key: string) => Promise<void>
  saveApiKey: (key: string, provider?: string) => Promise<void>
  loadApiKey: (provider?: string) => Promise<string | null>
  removeApiKey: (provider?: string) => Promise<void>
  getApiPort: () => Promise<number>
}

interface Window {
  electronAPI?: ElectronAPI
}
