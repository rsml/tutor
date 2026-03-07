interface ElectronAPI {
  platform: string
  storageGet: (key: string) => Promise<string | null>
  storageSet: (key: string, value: string) => Promise<void>
  storageRemove: (key: string) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
