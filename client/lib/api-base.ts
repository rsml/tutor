let _base = ''
let _ready: Promise<void> | null = null

function getElectronAPI(): NonNullable<Window['electronAPI']> | null {
  return typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null
}

export function initApiBase(): Promise<void> {
  if (_ready) return _ready
  const promise = (async () => {
    const electron = getElectronAPI()
    if (!electron) return
    const port = await electron.getApiPort()
    if (!port) throw new Error('electronAPI returned no port')
    _base = `http://127.0.0.1:${port}`
    // Pre-warm the loopback path. Plugin registration and listen() complete
    // asynchronously, so the port can be reachable while the first request
    // briefly fails. Poll /api/health until it answers — usually one round
    // trip, capped at ~1.5s in degenerate cases. Non-fatal if it never
    // returns ok; individual requests still get their chance to fail with
    // an actionable diagnostic.
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${_base}/api/health`)
        if (r.ok) return
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 50))
    }
    console.warn('[init-api-base] /api/health never returned ok; proceeding anyway')
  })()
  _ready = promise
  promise.catch(() => { _ready = null })
  return promise
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}

export function getBase(): string {
  return _base
}

export function getApiPort(): number {
  if (!_base) return 3147
  try {
    const url = new URL(_base)
    return url.port ? parseInt(url.port) : 3147
  } catch {
    return 3147
  }
}

type DiagnosticEntry = {
  traceId: string
  urlInput: string
  urlResolved: string
  base: string
  error?: string
  retryError?: string
  status?: number
  recovered?: boolean
  stage?: 'initial' | 'recovered' | 'fatal'
  durationMs?: number
  probe?: Record<string, unknown>
}

async function diagnose(url: string): Promise<Record<string, unknown>> {
  const probe: Record<string, unknown> = {}
  probe.urlIsAbsolute = /^https?:/.test(url)
  const baseForHealth = probe.urlIsAbsolute ? new URL(url).origin : _base
  try {
    if (!baseForHealth) {
      probe.healthSkipped = 'no base resolved'
    } else {
      const r = await fetch(`${baseForHealth}/api/health`, { signal: AbortSignal.timeout(5000) })
      probe.healthStatus = r.status
    }
  } catch (e) {
    probe.healthError = String(e)
  }
  try {
    const r = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-trace-id',
      },
      signal: AbortSignal.timeout(5000),
    })
    probe.optionsStatus = r.status
    probe.allowOrigin = r.headers.get('access-control-allow-origin')
    probe.allowHeaders = r.headers.get('access-control-allow-headers')
  } catch (e) {
    probe.optionsError = String(e)
  }
  return probe
}

function log(entry: DiagnosticEntry): void {
  const tag = entry.stage === 'fatal' ? '[fetch-fatal]'
    : entry.stage === 'recovered' ? '[fetch-recovered]'
    : '[fetch-failure]'
  // Console for live debugging, file for postmortem. logDiagnostic is a
  // best-effort sink — missing in non-Electron contexts.
  console[entry.stage === 'fatal' ? 'error' : 'warn'](tag, entry)
  void getElectronAPI()?.logDiagnostic?.(entry)
}

// Wraps fetch with a trace id, a one-shot transparent retry, and a self-bisecting
// probe that runs at the moment of failure. The probe is the bisection tree from
// our debugging flowchart: it answers (in order) "did the URL resolve absolute?",
// "is the server reachable at all?", and "does CORS preflight succeed?". The
// answers land in a JSONL file that triages the next reproduction in one look.
export async function tracedFetch(path: string, init?: RequestInit): Promise<Response> {
  await initApiBase()
  const traceId = crypto.randomUUID().slice(0, 8)
  const url = apiUrl(path)
  const headers = new Headers(init?.headers)
  headers.set('X-Trace-Id', traceId)
  const t0 = performance.now()

  try {
    return await fetch(url, { ...init, headers })
  } catch (err) {
    const probe = await diagnose(url)
    const entry: DiagnosticEntry = {
      traceId,
      urlInput: path,
      urlResolved: url,
      base: _base,
      error: String(err),
      durationMs: Math.round(performance.now() - t0),
      probe,
      stage: 'initial',
    }
    log(entry)

    await new Promise(r => setTimeout(r, 200))
    try {
      const res = await fetch(url, { ...init, headers })
      log({ ...entry, stage: 'recovered', recovered: true, status: res.status })
      return res
    } catch (retryErr) {
      log({ ...entry, stage: 'fatal', retryError: String(retryErr) })
      throw retryErr
    }
  }
}
