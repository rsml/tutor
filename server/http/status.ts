/**
 * Named HTTP status codes for the ones this codebase actually sends, found by
 * grepping every `reply.status(N)` call in `server/`. Using the name instead
 * of the bare number at a call site makes the intent readable without
 * memorizing the HTTP spec.
 *
 * This is not a general-purpose HTTP status enum — codes this app never
 * sends are deliberately absent, so an unused import here is a sign the
 * response probably wants a code that isn't in this list yet, not a reason
 * to add every code in the spec speculatively.
 */

/** The OPTIONS preflight response — no body. */
export const STATUS_NO_CONTENT = 204

/** Request body or params failed validation. */
export const STATUS_BAD_REQUEST = 400

/** Origin not on the allowed CORS list. */
export const STATUS_FORBIDDEN = 403

/** Book, chapter, cover, task, or other resource does not exist. */
export const STATUS_NOT_FOUND = 404

/** The request conflicts with the resource's current state (e.g. generation already running). */
export const STATUS_CONFLICT = 409

/** The Range header could not be satisfied against the resource. */
export const STATUS_RANGE_NOT_SATISFIABLE = 416

/** Unexpected server-side failure. */
export const STATUS_INTERNAL_SERVER_ERROR = 500

/** An upstream provider (model list fetch, etc.) returned a failure. */
export const STATUS_BAD_GATEWAY = 502
