import { describe, it, expect } from 'vitest'
import {
  BOOK_STATUSES,
  isGenerating,
  isGeneratingToc,
  isAwaitingTocApproval,
  isReadable,
  isComplete,
  isFailed,
} from './book-status.js'

/**
 * These tests are the safety net for the status predicates, so they are written
 * exhaustively rather than by example. Each predicate is asserted against EVERY
 * member of the BookStatus union, which means adding a seventh status to the
 * union without deciding how each predicate treats it fails here immediately
 * instead of silently changing behaviour in the UI.
 *
 * The predicates accept `string | undefined` rather than `BookStatus` because
 * the client currently types the field as an optional string (see
 * client/components/BookCard.tsx). Tightening that is a later phase's job, so
 * these tests also pin the behaviour for unknown and missing values.
 */

/** Maps each predicate to exactly the statuses it must accept. */
const EXPECTED: Record<string, { fn: (s: string | undefined) => boolean; accepts: string[] }> = {
  isGenerating: { fn: isGenerating, accepts: ['generating_toc', 'generating'] },
  isGeneratingToc: { fn: isGeneratingToc, accepts: ['generating_toc'] },
  isAwaitingTocApproval: { fn: isAwaitingTocApproval, accepts: ['toc_review'] },
  isReadable: { fn: isReadable, accepts: ['reading', 'complete'] },
  isComplete: { fn: isComplete, accepts: ['complete'] },
  isFailed: { fn: isFailed, accepts: ['failed'] },
}

describe('BOOK_STATUSES', () => {
  it('lists every status the app can persist, in schema order', () => {
    expect(BOOK_STATUSES).toEqual([
      'generating_toc',
      'toc_review',
      'generating',
      'reading',
      'complete',
      'failed',
    ])
  })

  it('has no duplicates', () => {
    expect(new Set(BOOK_STATUSES).size).toBe(BOOK_STATUSES.length)
  })
})

describe('status predicates', () => {
  for (const [name, { fn, accepts }] of Object.entries(EXPECTED)) {
    describe(name, () => {
      for (const status of BOOK_STATUSES) {
        const shouldAccept = accepts.includes(status)
        it(`${shouldAccept ? 'accepts' : 'rejects'} ${status}`, () => {
          expect(fn(status)).toBe(shouldAccept)
        })
      }

      it('rejects undefined', () => {
        expect(fn(undefined)).toBe(false)
      })

      it('rejects an unknown status string', () => {
        expect(fn('not_a_real_status')).toBe(false)
      })
    })
  }
})

describe('predicate relationships', () => {
  it('treats isGeneratingToc as a strict subset of isGenerating', () => {
    for (const status of BOOK_STATUSES) {
      if (isGeneratingToc(status)) expect(isGenerating(status)).toBe(true)
    }
    // Strict, meaning at least one generating status is not the TOC step.
    expect(BOOK_STATUSES.some(s => isGenerating(s) && !isGeneratingToc(s))).toBe(true)
  })

  it('treats isComplete as a subset of isReadable', () => {
    for (const status of BOOK_STATUSES) {
      if (isComplete(status)) expect(isReadable(status)).toBe(true)
    }
  })

  it('never reports a book as both generating and readable', () => {
    for (const status of BOOK_STATUSES) {
      expect(isGenerating(status) && isReadable(status)).toBe(false)
    }
  })

  it('assigns every status to at least one predicate', () => {
    const predicates = Object.values(EXPECTED).map(e => e.fn)
    for (const status of BOOK_STATUSES) {
      expect(predicates.some(p => p(status))).toBe(true)
    }
  })
})
