import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: string) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),
  saveApiKey: (key: string) => ipcRenderer.invoke('apiKey:save', key),
  loadApiKey: () => ipcRenderer.invoke('apiKey:load') as Promise<string | null>,
  removeApiKey: () => ipcRenderer.invoke('apiKey:remove'),
})
