interface ElectronAPI {
  platform: string
  storageGet: (key: string) => Promise<string | null>
  storageSet: (key: string, value: string) => Promise<void>
  storageRemove: (key: string) => Promise<void>
  saveApiKey: (key: string) => Promise<void>
  loadApiKey: () => Promise<string | null>
  removeApiKey: () => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
