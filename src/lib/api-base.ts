let _base = ''

export async function initApiBase() {
  if (window.electronAPI) {
    const port = await window.electronAPI.getApiPort()
    _base = `http://127.0.0.1:${port}`
  }
  // In web/dev mode, _base stays '' (relative paths work via Vite proxy)
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}
