import { describe, it, expect } from 'vitest'
import { assertChapterInRange } from './chapter-range.js'

// assertChapterInRange is the pure replacement for validateChapterNum, used
// by the reading and authoring services, which fetch the book themselves
// through ports.bookRepository and pass totalChapters in here.

describe('assertChapterInRange', () => {
  it('does not throw for a chapter number within range', () => {
    expect(() => assertChapterInRange(5, 1)).not.toThrow()
    expect(() => assertChapterInRange(5, 5)).not.toThrow()
  })

  it('throws a 400 with a descriptive message for chapter 0', () => {
    expect(() => assertChapterInRange(5, 0)).toThrowError(
      expect.objectContaining({ message: 'Chapter 0 out of range (1-5)', statusCode: 400 }),
    )
  })

  it('throws a 400 for a chapter number past totalChapters', () => {
    expect(() => assertChapterInRange(2, 5)).toThrowError(
      expect.objectContaining({ message: 'Chapter 5 out of range (1-2)', statusCode: 400 }),
    )
  })

  it('throws for a negative chapter number', () => {
    expect(() => assertChapterInRange(5, -1)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})
