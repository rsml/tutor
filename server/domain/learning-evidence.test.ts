import { describe, it, expect } from 'vitest'
import type { BookMeta, Feedback, Toc } from '@shared/domain.js'
import { summarizeBookEvidence, describeChapterFeedback } from './learning-evidence.js'

// Pure assembly of the reader-evidence text blocks fed into AI prompts: one
// per-book summary for the next-book suggestion, and one per-chapter
// feedback description for the profile-update suggestion. All I/O (loading
// feedback, TOC, client quiz history) happens before either function is
// called — these only format what they are handed.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Rust for Rubyists',
    prompt: 'Learn Rust assuming strong Ruby experience.',
    status: 'reading',
    totalChapters: 10,
    generatedUpTo: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('summarizeBookEvidence', () => {
  it('includes title, topic, status, chapter progress, and dates with no other evidence', () => {
    const summary = summarizeBookEvidence(makeBook(), [], undefined, undefined)
    expect(summary).toContain('"Rust for Rubyists" — Topic: Learn Rust assuming strong Ruby experience.')
    expect(summary).toContain('Status: reading, Chapters: 4/10')
    expect(summary).toContain('Started: 2026-01-01T00:00:00.000Z, Last activity: 2026-01-05T00:00:00.000Z')
    expect(summary).not.toContain('Rating')
    expect(summary).not.toContain('Avg quiz score')
    expect(summary).not.toContain('Client quiz')
    // The status line legitimately contains the substring "Chapters:" (chapter
    // progress, e.g. "Chapters: 4/10") — this checks for the separate TOC-list
    // line specifically, which is always its own part and never the first one.
    expect(summary).not.toContain('\n  Chapters: ')
  })

  it('includes a rating line only when the book has a rating', () => {
    expect(summarizeBookEvidence(makeBook({ rating: 4 }), [], undefined, undefined)).toContain('Rating: 4/5')
    expect(summarizeBookEvidence(makeBook(), [], undefined, undefined)).not.toContain('Rating')
  })

  it('averages quiz scores from feedback and names the chapters the reader did worst on', () => {
    const feedback: Feedback[] = [
      {
        chapter: 1,
        feedback: {},
        quiz: {
          score: 2,
          questions: [
            { question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, correct: true },
            { question: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, correct: false },
          ],
        },
      },
      {
        chapter: 2,
        feedback: {},
        quiz: {
          score: 1,
          questions: [
            { question: 'Q3?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, correct: true },
            { question: 'Q4?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, correct: false },
          ],
        },
      },
    ]

    const summary = summarizeBookEvidence(makeBook(), feedback, undefined, undefined)
    expect(summary).toContain('Avg quiz score: 1.5/2')
    expect(summary).toContain('Struggled with: Q2?; Q4?')
  })

  it('caps the struggled-with list at 5 questions', () => {
    const feedback: Feedback[] = [{
      chapter: 1,
      feedback: {},
      quiz: {
        score: 0,
        questions: Array.from({ length: 7 }, (_, i) => ({
          question: `Q${i}?`,
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 0,
          correct: false,
        })),
      },
    }]

    const summary = summarizeBookEvidence(makeBook(), feedback, undefined, undefined)
    const struggledLine = summary.split('\n').find(l => l.includes('Struggled with'))!
    expect(struggledLine).toBe('  Struggled with: Q0?; Q1?; Q2?; Q3?; Q4?')
  })

  it('shows a zero score with a ? denominator when feedback exists but recorded no quiz questions', () => {
    const feedback: Feedback[] = [{ chapter: 1, feedback: { liked: 'nice' }, quiz: { questions: [] } }]
    const summary = summarizeBookEvidence(makeBook(), feedback, undefined, undefined)
    expect(summary).toContain('Avg quiz score: 0.0/?')
  })

  it('reports client-side quiz history and its weak areas, using the latest attempt per chapter', () => {
    const clientQuizData = {
      '1': {
        questions: [{ question: 'CQ1?', options: ['a', 'b'], correctIndex: 0 }],
        attempts: [
          { score: 0, timestamp: '2026-01-02T00:00:00.000Z', answers: [{ selectedAnswer: 1, correct: false }] },
          { score: 1, timestamp: '2026-01-03T00:00:00.000Z', answers: [{ selectedAnswer: 0, correct: true }] },
        ],
      },
    }

    const summary = summarizeBookEvidence(makeBook(), [], undefined, clientQuizData)
    // Only the latest attempt (score 1, all correct) should count.
    expect(summary).toContain('Client quiz: 1/1 (latest: 2026-01-03)')
    expect(summary).not.toContain('Weak areas (client)')
  })

  it('collects weak areas across every chapter, combining totals and capping the list at 5', () => {
    const clientQuizData = {
      '1': {
        questions: [
          { question: 'CQ1?', options: ['a', 'b'], correctIndex: 0 },
          { question: 'CQ2?', options: ['a', 'b'], correctIndex: 0 },
        ],
        attempts: [
          { score: 0, answers: [{ selectedAnswer: 1, correct: false }, { selectedAnswer: 1, correct: false }] },
        ],
      },
      '2': {
        questions: [{ question: 'CQ3?', options: ['a', 'b'], correctIndex: 0 }],
        attempts: [{ score: 1, answers: [{ selectedAnswer: 0, correct: true }] }],
      },
    }

    const summary = summarizeBookEvidence(makeBook(), [], undefined, clientQuizData)
    // Chapter 1 contributes 0/2, chapter 2 contributes 1/1: 1/3 total.
    expect(summary).toContain('Client quiz: 1/3')
    expect(summary).toContain('Weak areas (client): CQ1?; CQ2?')
  })

  it('lists chapter titles from the TOC when one is supplied', () => {
    const toc: Toc = { chapters: [{ title: 'Ownership', description: '' }, { title: 'Borrowing', description: '' }] }
    const summary = summarizeBookEvidence(makeBook(), [], toc, undefined)
    expect(summary).toContain('Chapters: Ownership, Borrowing')
  })

  it('joins every present part with a newline and two-space indent, in a fixed order', () => {
    const toc: Toc = { chapters: [{ title: 'Ownership', description: '' }] }
    const summary = summarizeBookEvidence(makeBook({ rating: 5 }), [], toc, undefined)
    const lines = summary.split('\n  ')
    expect(lines[0]).toContain('Rust for Rubyists')
    expect(lines[1]).toContain('Status:')
    expect(lines[2]).toContain('Started:')
    expect(lines[3]).toContain('Rating: 5/5')
    expect(lines[4]).toContain('Chapters: Ownership')
  })
})

describe('describeChapterFeedback', () => {
  it('names the chapter and what the reader liked, disliked, and struggled with', () => {
    const feedback: Feedback[] = [{
      chapter: 3,
      feedback: { liked: 'the diagrams', disliked: 'too fast' },
      quiz: {
        score: 1,
        questions: [
          { question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, correct: true },
          { question: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, correct: false },
        ],
      },
    }]

    const text = describeChapterFeedback(feedback)
    expect(text).toBe('Chapter 3: Liked: the diagrams. Disliked: too fast. Quiz score: 1/2. Struggled with: Q2?')
  })

  it('strips HTML tags out of liked/disliked text', () => {
    const feedback: Feedback[] = [{
      chapter: 1,
      feedback: { liked: '<b>bold</b> stuff' },
      quiz: { questions: [] },
    }]
    expect(describeChapterFeedback(feedback)).toBe('Chapter 1: Liked: bold stuff')
  })

  it('omits the quiz score line when the chapter has no scored quiz', () => {
    const feedback: Feedback[] = [{ chapter: 2, feedback: { liked: 'good' }, quiz: { questions: [] } }]
    expect(describeChapterFeedback(feedback)).toBe('Chapter 2: Liked: good')
  })

  it('omits struggled-with when every answer was correct', () => {
    const feedback: Feedback[] = [{
      chapter: 1,
      feedback: {},
      quiz: { score: 1, questions: [{ question: 'Q1?', options: ['a', 'b'], correctIndex: 0, correct: true }] },
    }]
    expect(describeChapterFeedback(feedback)).toBe('Chapter 1: Quiz score: 1/1')
  })

  it('joins multiple chapters with newlines, preserving array order', () => {
    const feedback: Feedback[] = [
      { chapter: 1, feedback: { liked: 'a' }, quiz: { questions: [] } },
      { chapter: 2, feedback: { liked: 'b' }, quiz: { questions: [] } },
    ]
    expect(describeChapterFeedback(feedback)).toBe('Chapter 1: Liked: a\nChapter 2: Liked: b')
  })

  it('returns an empty string for no feedback at all', () => {
    expect(describeChapterFeedback([])).toBe('')
  })
})
