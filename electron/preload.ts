import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: string) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),
  saveApiKey: (key: string, provider?: string) => ipcRenderer.invoke('apiKey:save', key, provider),
  loadApiKey: (provider?: string) => ipcRenderer.invoke('apiKey:load', provider) as Promise<string | null>,
  removeApiKey: (provider?: string) => ipcRenderer.invoke('apiKey:remove', provider),
})
