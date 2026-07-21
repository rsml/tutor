/**
 * The client's only door to the server.
 *
 * Every component and hook imports from here rather than from a module inside
 * this folder, so there is exactly one import path to grep for and exactly one
 * place a new endpoint can be added. Nothing outside this folder calls fetch
 * or constructs an EventSource, and a lint rule enforces that.
 *
 * The folder is arranged by resource. `http.ts` holds the transport, meaning
 * the base URL, the trace id, the retry and the error type. `sse.ts` holds the
 * three streaming shapes. `urls.ts` builds the URLs handed to an img or audio
 * element rather than to fetch. Everything else is one file per group of
 * endpoints.
 */

export { ApiError, apiUrl, getApiPort, initApiBase } from './http'
export type { ApiRequestInit, JsonRequestInit } from './http'

export { audiobookFileUrl, coverUrl, voicePreviewUrl } from './urls'

export * from './audiobook'
export * from './books'
export * from './chapters'
export * from './chat'
export * from './covers'
export * from './creation'
export * from './import'
export * from './profile'
export * from './progress'
export * from './settings'
export * from './tasks'
