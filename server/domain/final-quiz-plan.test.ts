import { describe, it, expect } from 'vitest'
import { charsPerChapterFor, questionCountFor, focusInstructionsFor, planFinalQuiz } from './final-quiz-plan.js'

// Pure planning for the final, whole-book quiz. No I/O, no fakes — just
// plain inputs and outputs, one tier boundary at a time.

describe('charsPerChapterFor', () => {
  it('gives the smallest books the largest per-chapter budget', () => {
    expect(charsPerChapterFor(1)).toBe(8000)
    expect(charsPerChapterFor(2)).toBe(8000)
  })

  it('gives mid-sized books the middle budget', () => {
    expect(charsPerChapterFor(3)).toBe(3000)
    expect(charsPerChapterFor(5)).toBe(3000)
  })

  it('gives large books the smallest budget', () => {
    expect(charsPerChapterFor(6)).toBe(1500)
    expect(charsPerChapterFor(100)).toBe(1500)
  })
})

describe('questionCountFor', () => {
  it('asks fewer questions for a single-chapter book', () => {
    expect(questionCountFor(1)).toBe(5)
  })

  it('asks the full count once there is more than one chapter', () => {
    expect(questionCountFor(2)).toBe(10)
    expect(questionCountFor(12)).toBe(10)
  })
})

describe('focusInstructionsFor', () => {
  it('asks for deep single-chapter comprehension when there is only one chapter', () => {
    const text = focusInstructionsFor(1, 5)
    expect(text).toContain('Generate exactly 5 multiple-choice questions')
    expect(text).toContain('DEEP COMPREHENSION of the single chapter')
  })

  it('asks for a mix of cross-chapter and single-chapter questions for small books', () => {
    const text = focusInstructionsFor(3, 10)
    expect(text).toContain('Generate exactly 10 multiple-choice questions')
    expect(text).toContain('test connections between concepts from different chapters')
    expect(text).not.toContain('DEEP COMPREHENSION')
    expect(text).not.toContain('SYNTHESIS and CROSS-CHAPTER')
  })

  it('asks for synthesis and cross-chapter understanding for larger books', () => {
    const text = focusInstructionsFor(4, 10)
    expect(text).toContain('SYNTHESIS and CROSS-CHAPTER understanding')
    expect(text).toContain('Require knowledge from 2+ chapters')
  })
})

describe('planFinalQuiz', () => {
  it('assembles the tier, question count, and focus text from a single chapter count', () => {
    const plan = planFinalQuiz(1)
    expect(plan).toEqual({
      charsPerChapter: 8000,
      questionCount: 5,
      focusInstructions: focusInstructionsFor(1, 5),
    })
  })

  it('assembles a large-book plan consistently', () => {
    const plan = planFinalQuiz(12)
    expect(plan.charsPerChapter).toBe(1500)
    expect(plan.questionCount).toBe(10)
    expect(plan.focusInstructions).toContain('SYNTHESIS and CROSS-CHAPTER understanding')
  })
})
