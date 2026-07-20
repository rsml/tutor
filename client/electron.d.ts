interface ElectronAPI {
  platform: string
  storageGet: (key: string) => Promise<string | null>
  storageSet: (key: string, value: string) => Promise<void>
  storageRemove: (key: string) => Promise<void>
  saveApiKey: (key: string, provider?: string) => Promise<void>
  loadApiKey: (provider?: string) => Promise<string | null>
  removeApiKey: (provider?: string) => Promise<void>
  getApiPort: () => Promise<number>
  saveFile: (defaultName: string, base64Data: string) => Promise<boolean>
  showInFinder: (filePath: string) => Promise<boolean>
  openInDefaultApp: (filePath: string) => Promise<boolean>
  setBusyState: (count: number, labels: string[]) => Promise<void>
  logDiagnostic: (entry: unknown) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
