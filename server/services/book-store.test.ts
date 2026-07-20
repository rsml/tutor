import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { stringify as stringifyYaml } from 'yaml'
import type { BookMeta, Feedback, LearningProfile, Quiz, Toc } from '../schemas.js'

// Mock getDataDir at module level so book-store ALWAYS uses temp dir.
// This prevents tests from ever writing to the production data directory.
let testDir: string

vi.mock('@shared/node/data-dir.js', () => ({
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
    audioGeneratedChapters: [],
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

  describe('reset', () => {
    const testFeedback: Feedback = {
      chapter: 1,
      feedback: { liked: 'Great', disliked: 'Too dense' },
      quiz: {
        questions: [
          { question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, userAnswer: 1, correct: false },
          { question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 2, userAnswer: 2, correct: true },
        ],
        score: 1,
      },
    }

    const testQuiz: Quiz = {
      questions: [
        { question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, userAnswer: 3, correct: false },
        { question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, userAnswer: 1, correct: true },
      ],
    }

    // Seed a book with chapters, TOC, progress, feedback, per-chapter quiz,
    // final quiz, and full meta (rating + final-quiz score).
    async function seedReadBook(): Promise<BookMeta> {
      const meta: BookMeta = {
        ...testMeta,
        status: 'complete',
        rating: 4.5,
        finalQuizScore: 8,
        finalQuizTotal: 10,
      }
      await store.saveBook(meta)
      await store.saveToc(meta.id, testToc)
      await store.saveChapter(meta.id, 1, '# Chapter 1\n\nBody')
      await store.saveChapter(meta.id, 2, '# Chapter 2\n\nBody')
      await store.saveChapterProgress(meta.id, 1, { scroll: 1, completed: true, completedAt: '2026-05-01T00:00:00Z' })
      await store.saveChapterProgress(meta.id, 2, { scroll: 0.5, completed: false })
      await store.saveFeedback(meta.id, 1, testFeedback)
      await store.saveFeedback(meta.id, 2, { ...testFeedback, chapter: 2 })
      await store.saveQuiz(meta.id, 1, testQuiz)
      await store.saveQuiz(meta.id, 2, testQuiz)
      await store.saveFinalQuiz(meta.id, testQuiz)
      return meta
    }

    it('clears user-interaction files', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)

      // progress.yml is gone
      const progress = await store.getProgress(meta.id)
      expect(progress.chapters).toEqual({})

      // feedback files are gone
      const allFeedback = await store.getAllFeedback(meta.id)
      expect(allFeedback).toEqual([])

      // per-chapter quiz files exist; userAnswer/correct stripped
      const q1 = await store.getQuiz(meta.id, 1)
      expect(q1.questions).toHaveLength(2)
      for (const q of q1.questions) {
        expect(q).not.toHaveProperty('userAnswer')
        expect(q).not.toHaveProperty('correct')
        expect(q.question).toBeTruthy()
        expect(q.options).toHaveLength(4)
        expect(typeof q.correctIndex).toBe('number')
      }
      const q2 = await store.getQuiz(meta.id, 2)
      expect(q2.questions).toHaveLength(2)

      // final quiz exists; userAnswer/correct stripped
      const fq = await store.getFinalQuiz(meta.id)
      expect(fq.questions).toHaveLength(2)
      for (const q of fq.questions) {
        expect(q).not.toHaveProperty('userAnswer')
        expect(q).not.toHaveProperty('correct')
      }
    })

    it('preserves generated content', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)

      // chapters stay
      const ch1 = await store.getChapter(meta.id, 1)
      expect(ch1).toContain('# Chapter 1')
      const ch2 = await store.getChapter(meta.id, 2)
      expect(ch2).toContain('# Chapter 2')

      // TOC stays
      const toc = await store.getToc(meta.id)
      expect(toc.chapters).toHaveLength(3)
    })

    it('resets meta fields', async () => {
      const meta = await seedReadBook()
      const before = meta.updatedAt
      await store.resetBook(meta.id)
      const after = await store.getBook(meta.id)

      expect(after.status).toBe('reading')
      expect(after.rating).toBeUndefined()
      expect(after.finalQuizScore).toBeUndefined()
      expect(after.finalQuizTotal).toBeUndefined()
      expect(after.updatedAt > before).toBe(true)

      // Preserved meta fields
      expect(after.id).toBe(meta.id)
      expect(after.title).toBe(meta.title)
      expect(after.prompt).toBe(meta.prompt)
      expect(after.totalChapters).toBe(meta.totalChapters)
      expect(after.generatedUpTo).toBe(meta.generatedUpTo)
      expect(after.createdAt).toBe(meta.createdAt)
    })

    it('is idempotent', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)
      const firstReset = await store.getBook(meta.id)
      // Second reset on an already-reset book should not throw and should
      // leave the book in the same shape (modulo updatedAt).
      await store.resetBook(meta.id)
      const secondReset = await store.getBook(meta.id)

      expect(secondReset.status).toBe('reading')
      expect(secondReset.rating).toBeUndefined()
      expect(secondReset.finalQuizScore).toBeUndefined()
      expect(secondReset.finalQuizTotal).toBeUndefined()

      const progress = await store.getProgress(meta.id)
      expect(progress.chapters).toEqual({})
      const allFeedback = await store.getAllFeedback(meta.id)
      expect(allFeedback).toEqual([])

      // updatedAt monotonically increases (or is at least not earlier)
      expect(secondReset.updatedAt >= firstReset.updatedAt).toBe(true)
    })

    it('is a no-op on a fresh book without progress/feedback/quizzes', async () => {
      const meta: BookMeta = { ...testMeta, status: 'reading' }
      await store.saveBook(meta)
      await store.saveToc(meta.id, testToc)
      await store.saveChapter(meta.id, 1, '# Chapter 1')

      await expect(store.resetBook(meta.id)).resolves.not.toThrow()

      const after = await store.getBook(meta.id)
      expect(after.status).toBe('reading')
      expect(after.rating).toBeUndefined()
      const ch = await store.getChapter(meta.id, 1)
      expect(ch).toContain('# Chapter 1')
    })

    it('rejects when status is generating', async () => {
      const meta: BookMeta = { ...testMeta, status: 'generating' }
      await store.saveBook(meta)
      await expect(store.resetBook(meta.id)).rejects.toThrow(/generating/)
    })

    it('rejects when status is generating_toc', async () => {
      const meta: BookMeta = { ...testMeta, status: 'generating_toc' }
      await store.saveBook(meta)
      await expect(store.resetBook(meta.id)).rejects.toThrow(/generating/)
    })
  })

  describe('crash recovery', () => {
    it('moves generating_toc with toc.yml present to toc_review', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-toc-ok', status: 'generating_toc' }
      await store.saveBook(meta)
      await store.saveToc(meta.id, testToc)
      const report = await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.status).toBe('toc_review')
      expect(report.booksReset.some(b => b.id === meta.id && b.to === 'toc_review')).toBe(true)
    })

    it('moves generating_toc without toc.yml to failed', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-toc-empty', status: 'generating_toc' }
      await store.saveBook(meta)
      // intentionally no saveToc
      await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.status).toBe('failed')
    })

    it('moves generating with chapters to reading', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-chap', status: 'generating', generatedUpTo: 2 }
      await store.saveBook(meta)
      await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.status).toBe('reading')
    })

    it('moves generating with zero chapters to toc_review', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-no-chap', status: 'generating', generatedUpTo: 0 }
      await store.saveBook(meta)
      await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.status).toBe('toc_review')
    })

    it('wipes audio dir + audioGeneratedChapters when m4b missing', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-audio', audioGeneratedChapters: [1, 2] }
      await store.saveBook(meta)
      // Create a fake audio dir with stale per-chapter MP3s but no m4b.
      await mkdir(store.audioDir(meta.id), { recursive: true })
      await writeFile(store.chapterAudioPath(meta.id, 1), 'fake mp3')
      await writeFile(store.chapterAudioPath(meta.id, 2), 'fake mp3')
      const report = await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.audioGeneratedChapters).toEqual([])
      expect(report.artifactsRemoved).toContain(store.audioDir(meta.id))
    })

    it('preserves audio dir when m4b exists', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-audio-ok', audioGeneratedChapters: [1, 2] }
      await store.saveBook(meta)
      await mkdir(store.audioDir(meta.id), { recursive: true })
      await writeFile(store.chapterAudioPath(meta.id, 1), 'fake mp3')
      await writeFile(store.audiobookPath(meta.id), 'fake m4b')
      await store.recoverFromCrash()
      const recovered = await store.getBook(meta.id)
      expect(recovered.audioGeneratedChapters).toEqual([1, 2])
      expect(existsSync(store.audiobookPath(meta.id))).toBe(true)
      expect(existsSync(store.chapterAudioPath(meta.id, 1))).toBe(true)
    })

    it('removes leftover chapter .tmp files', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-tmp' }
      await store.saveBook(meta)
      const chapTmp = join(testDir, 'books', meta.id, 'chapters', '01.md.tmp')
      await mkdir(join(testDir, 'books', meta.id, 'chapters'), { recursive: true })
      await writeFile(chapTmp, 'half-written')
      const report = await store.recoverFromCrash()
      expect(existsSync(chapTmp)).toBe(false)
      expect(report.artifactsRemoved).toContain(chapTmp)
    })

    it('removes leftover epub .tmp', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-epub-tmp' }
      await store.saveBook(meta)
      const epubTmp = join(testDir, 'books', meta.id, 'book.epub.tmp')
      await writeFile(epubTmp, 'half')
      await store.recoverFromCrash()
      expect(existsSync(epubTmp)).toBe(false)
    })

    it('leaves healthy reading book untouched', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-healthy', status: 'reading' }
      await store.saveBook(meta)
      const before = await store.getBook(meta.id)
      const report = await store.recoverFromCrash()
      const after = await store.getBook(meta.id)
      expect(after.status).toBe('reading')
      expect(after.updatedAt).toBe(before.updatedAt)
      expect(report.booksReset).toEqual([])
    })

    it('recoverStuckBooks alias still works', async () => {
      const meta: BookMeta = { ...testMeta, id: 'recov-alias', status: 'generating', generatedUpTo: 1 }
      await store.saveBook(meta)
      await store.recoverStuckBooks()
      const recovered = await store.getBook(meta.id)
      expect(recovered.status).toBe('reading')
    })
  })
})
