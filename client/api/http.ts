import {
  DEFAULT_API_PORT,
  HEALTH_PREWARM_ATTEMPTS,
  HEALTH_PREWARM_INTERVAL_MS,
  PROBE_TIMEOUT_MS,
  REQUEST_RETRY_DELAY_MS,
} from '@client/lib/constants'

let _base = ''
let _ready: Promise<void> | null = null

function getElectronAPI(): NonNullable<Window['electronAPI']> | null {
  return typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null
}

/**
 * Discovers the server's base URL once and caches the promise, so every
 * caller after the first awaits the same discovery rather than repeating it.
 * In the plain browser dev server there is no `window.electronAPI`, so this
 * resolves immediately with an empty base and every request stays relative.
 * In Electron, it asks the main process which port the server bound, then
 * polls `/api/health` until it answers, because the server starts at the
 * same time as the renderer and can lose that race. That poll is capped at
 * roughly a second and a half and is non-fatal either way, meaning a health
 * check that never succeeds still resolves rather than rejects, since the
 * point is to give the server a head start, not to gate the app on it.
 * Individual requests still get their own chance to fail with an actionable
 * diagnostic if the server genuinely never comes up. `main.tsx` awaits this
 * once, before the first render, so `_base` is already resolved by the time
 * any component or hook runs.
 */
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
    for (let i = 0; i < HEALTH_PREWARM_ATTEMPTS; i++) {
      try {
        const r = await fetch(`${_base}/api/health`)
        if (r.ok) return
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, HEALTH_PREWARM_INTERVAL_MS))
    }
    console.warn('[init-api-base] /api/health never returned ok; proceeding anyway')
  })()
  _ready = promise
  promise.catch(() => { _ready = null })
  return promise
}

/**
 * Prepends whatever base initApiBase discovered. This does not itself wait
 * for that discovery, it just reads whatever `_base` currently holds, so a
 * call site that runs before `main.tsx`'s startup await has resolved would
 * silently build a relative URL instead of failing loudly. Every request in
 * this app goes through apiFetch, which awaits initApiBase first, and every
 * other direct caller (the EventSource URL in sse.ts, the img/audio URLs in
 * urls.ts) only ever runs from mounted React code, which starts after that
 * same await, so the gap exists in principle but has nowhere left to bite.
 */
export function apiUrl(path: string): string {
  return `${_base}${path}`
}

/** Exposed so tests can assert on the discovered base without reaching into module state directly. The running app never needs to read this, since apiUrl already applies it. */
export function getBase(): string {
  return _base
}

/** Best-effort port for surfacing in copyable text, such as the MCP command shown in the creation wizard, not for building requests. Falls back to DEFAULT_API_PORT when the base hasn't been discovered yet or doesn't parse as a URL. */
export function getApiPort(): number {
  if (!_base) return DEFAULT_API_PORT
  try {
    const url = new URL(_base)
    return url.port ? parseInt(url.port) : DEFAULT_API_PORT
  } catch {
    return DEFAULT_API_PORT
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
      const r = await fetch(`${baseForHealth}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
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
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
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

/**
 * What a call site may vary about a request. Deliberately narrower than
 * RequestInit, because everything this app sends is either a JSON document or
 * nothing at all.
 */
export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Serialised as JSON unless it is already a string. */
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /**
   * Stamp the request with a trace id. On by default. Switch it off for hot
   * polls, where the custom header would turn a CORS-simple GET into a
   * preflighted one and double the request count.
   */
  trace?: boolean
}

export interface JsonRequestInit extends ApiRequestInit {
  /** Message to raise when the server fails without saying why. */
  fallbackMessage?: string
}

/**
 * A non-2xx answer from the API, carrying the status and the parsed body so a
 * caller can inspect the detail rather than re-parse a string.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Every route answers { error }. Fastify's own serialiser adds a more specific message. */
function reasonFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  for (const key of ['message', 'error']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function buildRequestInit(init: ApiRequestInit | undefined, traceId: string | null): RequestInit {
  const headers = new Headers(init?.headers)
  if (traceId) headers.set('X-Trace-Id', traceId)

  const request: RequestInit = { headers }
  if (init?.method) request.method = init.method
  if (init?.signal) request.signal = init.signal
  if (init?.body !== undefined) {
    if (typeof init.body === 'string') {
      request.body = init.body
    } else {
      request.body = JSON.stringify(init.body)
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    }
  }
  return request
}

/**
 * The single fetch primitive for the whole client. Adds a trace id, a one-shot
 * transparent retry, and a self-bisecting probe that runs at the moment of
 * failure. The probe is the bisection tree from our debugging flowchart,
 * answering in order whether the URL resolved absolute, whether the server is
 * reachable at all, and whether CORS preflight succeeds. The answers land in a
 * JSONL file that triages the next reproduction in one look.
 *
 * The retry fires only when fetch itself threw, meaning no response arrived.
 * Every request here goes to loopback, where that outcome is a refused
 * connection rather than a dropped mid-flight request, so replaying it cannot
 * duplicate a side effect the server already performed.
 *
 * A non-2xx response is a normal return value. Use request() to turn one into
 * an ApiError.
 */
export async function apiFetch(path: string, init?: ApiRequestInit): Promise<Response> {
  await initApiBase()
  // The id is minted even when it is not sent, so a local diagnostic entry can
  // still be correlated with the console line that reported it.
  const traceId = crypto.randomUUID().slice(0, 8)
  const url = apiUrl(path)
  const request = buildRequestInit(init, init?.trace === false ? null : traceId)
  const t0 = performance.now()

  try {
    return await fetch(url, request)
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

    await new Promise(r => setTimeout(r, REQUEST_RETRY_DELAY_MS))
    try {
      const res = await fetch(url, request)
      log({ ...entry, stage: 'recovered', recovered: true, status: res.status })
      return res
    } catch (retryErr) {
      log({ ...entry, stage: 'fatal', retryError: String(retryErr) })
      throw retryErr
    }
  }
}

/**
 * Turn a non-2xx response into an ApiError, reading whatever reason the body
 * offers. Returns the response untouched when it is fine, so it can sit inline
 * in a call chain. Streaming callers use this directly, since they consume the
 * body themselves rather than parsing it as JSON.
 */
export async function expectOk(response: Response, fallbackMessage?: string): Promise<Response> {
  if (response.ok) return response
  const body = await response.json().catch(() => null)
  const reason = reasonFrom(body) ?? fallbackMessage ?? `Request failed with status ${response.status}`
  throw new ApiError(response.status, reason, body)
}

/**
 * Send a request and return its parsed JSON body, raising an ApiError for any
 * non-2xx answer. This is the shape almost every endpoint module wants.
 */
export async function request<T>(path: string, init?: JsonRequestInit): Promise<T> {
  const response = await expectOk(await apiFetch(path, init), init?.fallbackMessage)
  // Several mutating routes answer 204, and json() rejects on an empty body.
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
