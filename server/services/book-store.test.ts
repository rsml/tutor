import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { stringify as stringifyYaml } from 'yaml'
import type { BookMeta, Feedback, LearningProfile, Toc } from '../schemas.js'

// Mock getDataDir at module level so book-store ALWAYS uses temp dir.
// This prevents tests from ever writing to the production data directory.
let testDir: string

vi.mock('../../lib/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

// Import AFTER mock is set up — vitest hoists vi.mock automatically
import * as store from './book-store.js'

describe('book-store', () => {
  const testMeta: BookMeta = {
    id: 'test-book-123',
    title: 'Test Book',
    prompt: 'Teach me testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 2,
    createdAt: '2026-03-06T10:00:00Z',
    updatedAt: '2026-03-06T14:30:00Z',
    tags: [],
  }

  const testToc: Toc = {
    chapters: [
      { title: 'Chapter 1', description: 'Introduction' },
      { title: 'Chapter 2', description: 'Deep dive' },
      { title: 'Chapter 3', description: 'Conclusion' },
    ],
  }

  const testProfile: LearningProfile = {
    style: 'mental models',
    identity: 'developer',
    preferences: {
      explainComplexTermsSimply: true,
      codeExamples: true,
      realWorldAnalogies: true,
      includeRecaps: true,
      includeSummaries: true,
      visualDescriptions: false,
      depthLevel: 3,
      pacePreference: 3,
      metaphorDensity: 3,
      narrativeStyle: 3,
      humorLevel: 2,
      formalityLevel: 3,
    },
    skills: [],
  }

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-test-'))
    await mkdir(join(testDir, 'books'), { recursive: true })

    // Write a learning profile so getProfile works
    await writeFile(
      join(testDir, 'books', 'learning-profile.yml'),
      stringifyYaml(testProfile),
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true })
  })

  describe('learning profile', () => {
    it('reads the learning profile', async () => {
      const profile = await store.getProfile()
      expect(profile.style).toBe('mental models')
      expect(profile.preferences.codeExamples).toBe(true)
    })

    it('saves and reads back a profile', async () => {
      const updated = { ...testProfile, style: 'updated style' }
      await store.saveProfile(updated)
      const result = await store.getProfile()
      expect(result.style).toBe('updated style')
    })
  })

  describe('book CRUD', () => {
    it('lists books (empty)', async () => {
      const books = await store.listBooks()
      expect(books).toEqual([])
    })

    it('saves and retrieves a book', async () => {
      await store.saveBook(testMeta)
      const book = await store.getBook('test-book-123')
      expect(book.id).toBe('test-book-123')
      expect(book.title).toBe('Test Book')
      expect(book.status).toBe('reading')
    })

    it('lists books after saving', async () => {
      await store.saveBook(testMeta)
      const books = await store.listBooks()
      expect(books).toHaveLength(1)
      expect(books[0].id).toBe('test-book-123')
    })

    it('deletes a book', async () => {
      await store.saveBook(testMeta)
      await store.deleteBook('test-book-123')
      const books = await store.listBooks()
      expect(books).toHaveLength(0)
    })

    it('lists multiple books sorted by createdAt descending', async () => {
      await store.saveBook({ ...testMeta, id: 'book-a', createdAt: '2026-01-01T00:00:00Z' })
      await store.saveBook({ ...testMeta, id: 'book-b', createdAt: '2026-03-01T00:00:00Z' })
      const books = await store.listBooks()
      expect(books[0].id).toBe('book-b')
      expect(books[1].id).toBe('book-a')
    })
  })

  describe('table of contents', () => {
    it('saves and retrieves TOC', async () => {
      await store.saveBook(testMeta)
      await store.saveToc('test-book-123', testToc)
      const toc = await store.getToc('test-book-123')
      expect(toc.chapters).toHaveLength(3)
      expect(toc.chapters[0].title).toBe('Chapter 1')
    })
  })

  describe('chapters', () => {
    it('saves and retrieves chapter content', async () => {
      await store.saveBook(testMeta)
      await store.saveChapter('test-book-123', 1, '# Chapter 1\n\nHello world')
      const content = await store.getChapter('test-book-123', 1)
      expect(content).toBe('# Chapter 1\n\nHello world')
    })

    it('checks chapter existence', async () => {
      await store.saveBook(testMeta)
      expect(await store.chapterExists('test-book-123', 1)).toBe(false)
      await store.saveChapter('test-book-123', 1, '# Ch1')
      expect(await store.chapterExists('test-book-123', 1)).toBe(true)
    })

    it('pads chapter numbers', async () => {
      await store.saveBook(testMeta)
      await store.saveChapter('test-book-123', 3, '# Ch3')
      const content = await store.getChapter('test-book-123', 3)
      expect(content).toBe('# Ch3')
    })
  })

  describe('progress', () => {
    it('returns empty progress for new book', async () => {
      await store.saveBook(testMeta)
      const progress = await store.getProgress('test-book-123')
      expect(progress.chapters).toEqual({})
    })

    it('saves and retrieves chapter progress', async () => {
      await store.saveBook(testMeta)
      await store.saveChapterProgress('test-book-123', 1, {
        scroll: 0.75,
        completed: false,
      })
      const progress = await store.getProgress('test-book-123')
      expect(progress.chapters['1'].scroll).toBe(0.75)
      expect(progress.chapters['1'].completed).toBe(false)
    })

    it('preserves progress across chapters', async () => {
      await store.saveBook(testMeta)
      await store.saveChapterProgress('test-book-123', 1, { scroll: 1.0, completed: true, completedAt: '2026-03-06T12:00:00Z' })
      await store.saveChapterProgress('test-book-123', 2, { scroll: 0.5, completed: false })
      const progress = await store.getProgress('test-book-123')
      expect(progress.chapters['1'].completed).toBe(true)
      expect(progress.chapters['2'].scroll).toBe(0.5)
    })
  })

  describe('feedback', () => {
    const testFeedback: Feedback = {
      chapter: 1,
      feedback: {
        liked: 'Great analogies',
        disliked: 'Too much jargon',
      },
      quiz: {
        questions: [
          {
            question: 'What is X?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 2,
            userAnswer: 2,
            correct: true,
          },
          {
            question: 'What is Y?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
            userAnswer: 1,
            correct: false,
          },
          {
            question: 'What is Z?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 3,
            userAnswer: 3,
            correct: true,
          },
        ],
        score: 2,
      },
    }

    it('saves and retrieves feedback', async () => {
      await store.saveBook(testMeta)
      await store.saveFeedback('test-book-123', 1, testFeedback)
      const fb = await store.getFeedback('test-book-123', 1)
      expect(fb.chapter).toBe(1)
      expect(fb.feedback.liked).toBe('Great analogies')
      expect(fb.quiz.score).toBe(2)
    })

    it('retrieves all feedback for a book', async () => {
      await store.saveBook(testMeta)
      await store.saveFeedback('test-book-123', 1, testFeedback)
      await store.saveFeedback('test-book-123', 2, { ...testFeedback, chapter: 2 })
      const all = await store.getAllFeedback('test-book-123')
      expect(all).toHaveLength(2)
      expect(all[0].chapter).toBe(1)
      expect(all[1].chapter).toBe(2)
    })

    it('returns empty array when no feedback exists', async () => {
      await store.saveBook(testMeta)
      const all = await store.getAllFeedback('test-book-123')
      expect(all).toEqual([])
    })
  })

  describe('validation', () => {
    it('rejects invalid book meta', async () => {
      const invalid = { ...testMeta, status: 'invalid_status' } as unknown as BookMeta
      await expect(store.saveBook(invalid)).rejects.toThrow()
    })

    it('rejects invalid feedback', async () => {
      await store.saveBook(testMeta)
      const invalid = { chapter: 'not-a-number' } as unknown as Feedback
      await expect(store.saveFeedback('test-book-123', 1, invalid)).rejects.toThrow()
    })
  })
})
