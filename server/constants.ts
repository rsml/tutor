/**
 * Tunable values for the server.
 *
 * These were previously scattered as literals across services and routes,
 * several of them redefined independently in more than one file. Each name
 * here records what the number means, so a future change is a one-line edit
 * instead of a grep-and-replace that risks missing a copy.
 *
 * Some constants share a value today (e.g. AI_GENERATION_TIMEOUT_MS and
 * GENERATION_STREAM_CLEANUP_MS are both five minutes) but are kept separate
 * because they mean different things and would be tuned independently.
 */

// --- AI generation ---

/** Abort an AI SDK call (chapter, quiz, TOC, cover prompt, etc.) after this long. */
export const AI_GENERATION_TIMEOUT_MS = 300_000 // 5 minutes

/** How long a finished or failed SSE generation stream stays in memory, after its last subscriber leaves, before its state is evicted. */
export const GENERATION_STREAM_CLEANUP_MS = 300_000 // 5 minutes

/** How long a finished or failed background task (cover, epub, audiobook, etc.) stays in memory before eviction. */
export const TASK_CLEANUP_DELAY_MS = 60_000 // 1 minute

/** Timeout for fetching the available-models list from a provider's API. */
export const MODEL_LIST_TIMEOUT_MS = 10_000

/** Timeout for rendering a single mermaid diagram via the kroki.io fallback renderer. */
export const DIAGRAM_RENDER_TIMEOUT_MS = 30_000

// --- Book generation defaults ---

/** Chapter count used when a create-book request doesn't specify one. */
export const DEFAULT_CHAPTER_COUNT = 12

/** Hard ceiling on chapter count, used when truncating an AI-generated or AI-revised table of contents. */
export const MAX_CHAPTERS = 500

/** Quiz question count used when a request doesn't specify one. */
export const DEFAULT_QUIZ_LENGTH = 3

/** Model ID used as a fallback for on-demand quiz generation when the request doesn't specify one (e.g. reconnecting to a chapter whose quiz file went missing). */
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// --- Context window sizing ---

/** Characters kept from each chapter when summarizing a book for profile-suggestion prompts. */
export const PROFILE_EXCERPT_CHARS = 300

/** Characters of chapter content sent as context to the inline chat endpoint. */
export const CHAT_CONTEXT_CHARS = 4000

/** Characters of the previous chapter's tail included for continuity when generating the next chapter. */
export const PREV_CHAPTER_TAIL_CHARS = 500

/** Characters of surrounding text included on each side of a full-text search match, when building a result snippet. */
export const SEARCH_SNIPPET_RADIUS = 60

/** Characters of raw model output echoed in the error message when table-of-contents parsing fails. */
export const TOC_ERROR_SNIPPET_CHARS = 300

// --- HTTP caching ---

/** Cache-Control max-age, in seconds, for served book cover images. */
export const COVER_CACHE_MAX_AGE_S = 3600 // 1 hour

/** Cache-Control max-age, in seconds, for synthesized audiobook voice preview clips. */
export const VOICE_PREVIEW_CACHE_MAX_AGE_S = 2_592_000 // 30 days

// --- Misc ---

/** Max request body size, in bytes, for EPUB import endpoints (the request carries the EPUB as base64). */
export const IMPORT_BODY_LIMIT_BYTES = 20 * 1024 * 1024 // 20MB, to accommodate ~10MB EPUB as base64

/** Audio bitrate ffmpeg encodes with when muxing the final M4B audiobook. */
export const M4B_BITRATE = '64k'
