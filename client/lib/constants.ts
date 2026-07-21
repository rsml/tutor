/**
 * Every timing value the client depends on, named once.
 *
 * These are tuning decisions rather than incidental numbers. Reading them side
 * by side is the point, because the relationships between them are what matter.
 * The library poll is the fastest thing this app does and the reason the health
 * check is a hundred times slower. The task stream reconnect delay has to stay
 * well under the row dismissal delay, or a task can finish and disappear during
 * a reconnect without ever being seen.
 */

// --- Transport ---

/** Fallback for the standalone dev server, used when Electron never told us a port. */
export const DEFAULT_API_PORT = 3147

/**
 * Electron starts the server and the renderer at the same time, so the first
 * request can beat listen(). The renderer polls health until it answers, which
 * normally costs one round trip and is capped at roughly a second and a half.
 */
export const HEALTH_PREWARM_ATTEMPTS = 30
export const HEALTH_PREWARM_INTERVAL_MS = 50

/** How long a failed request waits before its single transparent retry. */
export const REQUEST_RETRY_DELAY_MS = 200

/** Ceiling on each leg of the failure probe, so diagnosis cannot itself hang. */
export const PROBE_TIMEOUT_MS = 5_000

// --- Polling and streams ---

/** Server reachability check behind the offline banner. */
export const HEALTH_POLL_MS = 10_000

/** Library refresh while any book is generating, which drives the card progress. */
export const GENERATING_POLL_MS = 1_000

/** Reader check for a chapter being generated in another window or by the MCP server. */
export const EXTERNAL_CHAPTER_POLL_MS = 5_000

/** Audiobook manifest refresh, which lights up per-chapter listen buttons as they land. */
export const AUDIOBOOK_POLL_MS = 4_000

/** Delay before re-opening the background task stream after it drops. */
export const TASK_STREAM_RECONNECT_MS = 3_000

// --- Interaction timings ---

/** How long a finished task stays visible in the footer before it clears itself. */
export const TASK_ROW_DISMISS_MS = 10_000

/** Settling time before an edited API key is sent, so typing does not save per keystroke. */
export const API_KEY_DEBOUNCE_MS = 200

/** Settling time before edited skills are saved, which is slower because the rows are draggable. */
export const SKILL_SAVE_DEBOUNCE_MS = 300

/** Lets the search field mount before it is focused. */
export const SEARCH_FOCUS_DELAY_MS = 100

/** Time the generate-all modal leaves its terminal state on screen before closing. */
export const GENERATE_ALL_DONE_CLOSE_MS = 1_500
export const GENERATE_ALL_CANCELLED_CLOSE_MS = 1_000

/** Pause after chapter one finishes streaming before the reader takes over. */
export const CREATION_ADVANCE_MS = 600

/** How long a copy button stays in its copied state. */
export const COPY_RESET_MS = 2_000

// --- Toast durations ---

/** Toasts carrying an action the user has to reach for outlive the default. */
export const AUDIOBOOK_READY_TOAST_MS = 12_000
export const CLIPBOARD_FALLBACK_TOAST_MS = 10_000
export const MCP_COMMAND_TOAST_MS = 8_000

// --- Reader scrolling ---

/** Fraction of the viewport a page-down travels, leaving an overlap to read across. */
export const PAGE_SCROLL_FRACTION = 2 / 3

/** Matches the leading Tailwind applies to chapter prose, so arrow keys move whole lines. */
export const READER_LINE_HEIGHT = 1.625

/** Lines an arrow key travels. */
export const LINE_SCROLL_LINES = 5

export const SMOOTH_SCROLL_MS = 320
export const PAGE_SCROLL_MS = 420
export const LINE_SCROLL_MS = 240

/** Slack allowed when deciding the reader is at the bottom, absorbing sub-pixel layout. */
export const AT_BOTTOM_EPSILON_PX = 40
