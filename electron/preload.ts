import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: string) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),
  saveApiKey: (key: string, provider?: string) => ipcRenderer.invoke('apiKey:save', key, provider),
  loadApiKey: (provider?: string) => ipcRenderer.invoke('apiKey:load', provider) as Promise<string | null>,
  removeApiKey: (provider?: string) => ipcRenderer.invoke('apiKey:remove', provider),
  getApiPort: () => ipcRenderer.invoke('get-api-port') as Promise<number>,
  saveFile: (defaultName: string, base64Data: string) => ipcRenderer.invoke('file:save', defaultName, base64Data) as Promise<boolean>,
  showInFinder: (filePath: string) => ipcRenderer.invoke('shell:show-item', filePath) as Promise<boolean>,
  openInDefaultApp: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath) as Promise<boolean>,
  // Renderer pushes the live count of long-running tasks so the main process
  // can intercept window close with a confirmation when work is in flight.
  setBusyState: (count: number, labels: string[]) => ipcRenderer.invoke('app:set-busy-state', count, labels) as Promise<void>,
})
