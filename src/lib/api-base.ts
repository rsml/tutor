let _base = ''

export async function initApiBase() {
  if (window.electronAPI) {
    const port = await window.electronAPI.getApiPort()
    _base = `http://localhost:${port}`
  }
  // In web/dev mode, _base stays '' (relative paths work via Vite proxy)
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}
