import { describe, it, expect } from 'vitest'
import { scoreQuizAnswers, shuffleQuizOptions } from './quiz-scoring.js'

// Pure scoring and shuffling. No I/O — a caller supplies the quiz and the
// reader's answers already loaded, and gets back exactly what a reader
// would be shown, computed with no fakes at all.

describe('scoreQuizAnswers', () => {
  const questions = [
    { question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
    { question: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 },
  ]

  it('counts a right answer', () => {
    const result = scoreQuizAnswers(questions, [0, 1])
    expect(result.score).toBe(2)
    expect(result.questions[0]).toMatchObject({ userAnswer: 0, correct: true })
    expect(result.questions[1]).toMatchObject({ userAnswer: 1, correct: true })
  })

  it('rejects a wrong answer', () => {
    const result = scoreQuizAnswers(questions, [0, 2])
    expect(result.score).toBe(1)
    expect(result.questions[0]).toMatchObject({ userAnswer: 0, correct: true })
    expect(result.questions[1]).toMatchObject({ userAnswer: 2, correct: false })
  })

  it('treats a missing answer as wrong rather than throwing', () => {
    const result = scoreQuizAnswers(questions, [0])
    expect(result.score).toBe(1)
    expect(result.questions[1]).toMatchObject({ userAnswer: undefined, correct: false })
  })

  it('scores every question wrong when no answers were submitted at all', () => {
    const result = scoreQuizAnswers(questions, undefined)
    expect(result.score).toBe(0)
    expect(result.questions.every(q => q.correct === false)).toBe(true)
  })

  it('preserves question order and content', () => {
    const result = scoreQuizAnswers(questions, [0, 1])
    expect(result.questions.map(q => q.question)).toEqual(['Q1?', 'Q2?'])
    expect(result.questions[0].options).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('shuffleQuizOptions', () => {
  const quiz = {
    questions: [
      { question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
    ],
  }

  it('is a permutation that preserves the correct answer identity', () => {
    // Exercise several fixed random sources rather than one, so this holds
    // across more of the Fisher-Yates loop's branches, not just one path.
    for (const fixed of [0, 0.25, 0.5, 0.75, 0.999]) {
      const shuffled = shuffleQuizOptions(quiz, () => fixed)
      const q = shuffled.questions[0]
      expect([...q.options].sort()).toEqual(['A', 'B', 'C', 'D'])
      expect(q.options[q.correctIndex]).toBe('A')
    }
  })

  it('produces the exact permutation Fisher-Yates gives for a fully deterministic source', () => {
    // random() always 0 forces every swap to pick index 0, which walks the
    // array through a fixed, hand-traceable sequence of swaps.
    const shuffled = shuffleQuizOptions(quiz, () => 0)
    expect(shuffled.questions[0].options).toEqual(['B', 'C', 'D', 'A'])
    expect(shuffled.questions[0].correctIndex).toBe(3)
  })

  it('defaults to Math.random in production so no caller has to supply one', () => {
    const shuffled = shuffleQuizOptions(quiz)
    expect([...shuffled.questions[0].options].sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(shuffled.questions[0].options[shuffled.questions[0].correctIndex]).toBe('A')
  })

  it('does not mutate the input quiz', () => {
    const original = JSON.parse(JSON.stringify(quiz))
    shuffleQuizOptions(quiz, () => 0.5)
    expect(quiz).toEqual(original)
  })
})
