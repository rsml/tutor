/**
 * The lifecycle a book moves through, and the predicates both sides of the app
 * use to ask about it.
 *
 * This module exists so the status strings appear in exactly one place. Before
 * it, `status === 'generating_toc' || status === 'generating'` was spelled out
 * at seven separate call sites in the client, which is the kind of duplication
 * that drifts silently when a status is added or renamed.
 *
 * The predicates take `string | undefined` rather than `BookStatus` on purpose.
 * The client still types the field as an optional string in several local
 * interfaces, so a narrower parameter would force casts at the call sites this
 * module is meant to simplify. Tightening those interfaces is a later phase's
 * job, and `shared/book-status.test.ts` covers the loose inputs meanwhile.
 *
 * DELIBERATELY FREE OF ZOD, and of every other runtime dependency. The client
 * imports these predicates, so a value import of zod here would drag the whole
 * validator into the renderer bundle for the sake of six string comparisons.
 * The matching `BookStatusSchema` therefore lives in `shared/domain.ts`, which
 * is server-side and already builds on zod, and it is derived from the
 * `BOOK_STATUSES` tuple below so the two cannot drift apart.
 */

/**
 * Every status a book can hold, in lifecycle order. This tuple is the single
 * source of truth. `shared/domain.ts` builds the Zod enum from it.
 */
export const BOOK_STATUSES = [
  'generating_toc',
  'toc_review',
  'generating',
  'reading',
  'complete',
  'failed',
] as const

export type BookStatus = (typeof BOOK_STATUSES)[number]

/**
 * The book is producing content right now, either its table of contents or a
 * chapter. Callers use this to show a spinner and to keep polling.
 */
export const isGenerating = (status: string | undefined): boolean =>
  status === 'generating_toc' || status === 'generating'

/**
 * Specifically the table-of-contents step, which is the one generating state
 * that has no chapters to show yet and therefore reads differently in the UI.
 */
export const isGeneratingToc = (status: string | undefined): boolean =>
  status === 'generating_toc'

/** The table of contents is generated and waiting for the reader to approve it. */
export const isAwaitingTocApproval = (status: string | undefined): boolean =>
  status === 'toc_review'

/** There is at least one chapter to open, whether or not the book is finished. */
export const isReadable = (status: string | undefined): boolean =>
  status === 'reading' || status === 'complete'

/** Every chapter has been generated and read. */
export const isComplete = (status: string | undefined): boolean =>
  status === 'complete'

/** Generation stopped on an error and the book needs retrying. */
export const isFailed = (status: string | undefined): boolean =>
  status === 'failed'
