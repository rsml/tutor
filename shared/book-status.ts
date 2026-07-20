import { z } from 'zod'

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
 */

export const BookStatusSchema = z.enum([
  'generating_toc',
  'toc_review',
  'generating',
  'reading',
  'complete',
  'failed',
])

export type BookStatus = z.infer<typeof BookStatusSchema>

/** Every status, in schema order. Useful for exhaustive iteration. */
export const BOOK_STATUSES = BookStatusSchema.options

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
