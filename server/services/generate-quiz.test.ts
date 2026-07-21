import { describe, expect, it } from 'vitest'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createGenerateQuiz, QUIZ_QUALITY_RULES, shuffleQuizOptions } from './generate-quiz.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_QUIZ_LENGTH } from '../constants.js'

describe('createGenerateQuiz', () => {
  it('sends the chapter content and requested question count to the AI port', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [{ question: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })
    const generateQuiz = createGenerateQuiz({ ai })

    await generateQuiz({ model: 'claude-sonnet-4-6', provider: 'anthropic', chapterContent: 'Chapter text here', quizLength: 5 })

    expect(ai.requests.generateObject).toHaveLength(1)
    const req = ai.requests.generateObject[0]
    expect(req.prompt).toContain('generate exactly 5 multiple-choice quiz questions')
    expect(req.prompt).toContain('Chapter text here')
    expect(req.prompt).toContain(QUIZ_QUALITY_RULES)
    expect(req.model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })

  it('defaults the question count to DEFAULT_QUIZ_LENGTH when not given', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [] })
    const generateQuiz = createGenerateQuiz({ ai })

    await generateQuiz({ model: 'claude-sonnet-4-6', chapterContent: 'x' })

    expect(ai.requests.generateObject[0].prompt).toContain(`generate exactly ${DEFAULT_QUIZ_LENGTH} multiple-choice`)
  })

  it('defaults the provider to anthropic when not given', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [] })
    const generateQuiz = createGenerateQuiz({ ai })

    await generateQuiz({ model: 'claude-sonnet-4-6', chapterContent: 'x' })

    expect(ai.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })

  it('appends the shared markdown formatting rules only when includeFormattingRules is true', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [] })
    ai.scriptGenerateObject({ questions: [] })
    const generateQuiz = createGenerateQuiz({ ai })

    await generateQuiz({ model: 'm', chapterContent: 'x', includeFormattingRules: true })
    await generateQuiz({ model: 'm', chapterContent: 'x' })

    expect(ai.requests.generateObject[0].prompt).toContain(MARKDOWN_FORMATTING_RULES)
    expect(ai.requests.generateObject[1].prompt).not.toContain(MARKDOWN_FORMATTING_RULES)
  })

  it('shuffles the returned options while keeping correctIndex pointing at the right answer', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({
      questions: [{ question: 'Q1?', options: ['correct', 'wrong-a', 'wrong-b', 'wrong-c'], correctIndex: 0 }],
    })
    const generateQuiz = createGenerateQuiz({ ai })

    const quiz = await generateQuiz({ model: 'm', chapterContent: 'x' })

    expect(quiz.questions).toHaveLength(1)
    const [q] = quiz.questions
    expect(q.options).toEqual(expect.arrayContaining(['correct', 'wrong-a', 'wrong-b', 'wrong-c']))
    expect(q.options[q.correctIndex]).toBe('correct')
  })

  it('accepts a generated question with fewer than 4 options, matching the historical loose validation', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [{ question: 'Q', options: ['a', 'b'], correctIndex: 1 }] })
    const generateQuiz = createGenerateQuiz({ ai })

    const quiz = await generateQuiz({ model: 'm', chapterContent: 'x' })

    expect(quiz.questions[0].options.slice().sort()).toEqual(['a', 'b'])
    expect(quiz.questions[0].options[quiz.questions[0].correctIndex]).toBe('b')
  })

  it('passes the cancellation signal through to the AI port', async () => {
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ questions: [] })
    const generateQuiz = createGenerateQuiz({ ai })
    const controller = new AbortController()

    await generateQuiz({ model: 'm', chapterContent: 'x', signal: controller.signal })

    expect(ai.requests.generateObject[0].signal).toBe(controller.signal)
  })
})

describe('shuffleQuizOptions (whitebox)', () => {
  it('preserves the option set and keeps correctIndex aligned with the correct text across many shuffles', () => {
    for (let i = 0; i < 20; i++) {
      const quiz = { questions: [{ question: 'Q?', options: ['1', '2', '3', '4'], correctIndex: 2 }] }
      const shuffled = shuffleQuizOptions(quiz)
      expect(shuffled.questions[0].options.slice().sort()).toEqual(['1', '2', '3', '4'])
      expect(shuffled.questions[0].options[shuffled.questions[0].correctIndex]).toBe('3')
    }
  })
})
