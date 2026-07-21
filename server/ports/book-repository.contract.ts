import { describe, it, expect, beforeEach } from 'vitest'
import type {
  BookMeta,
  Toc,
  Quiz,
  Feedback,
  ChapterProgress,
  LearningProfile,
  ChapterSummary,
} from '@shared/domain.js'
import type { BookRepository } from './book-repository.js'

/**
 * The behavioural specification every BookRepository must satisfy, whether
 * it is the in-memory fake or a future real adapter. Run this once against
 * each with describeBookRepositoryContract(label, makeSubject), rather than
 * writing the same assertions twice and letting them drift apart.
 *
 * A missing entity is asserted with rejects.toMatchObject({ code: 'ENOENT' })
 * rather than an instanceof check, on purpose, so both the fake's
 * NotFoundError and a real adapter's plain Node fs error satisfy the same
 * expectation without this file importing either one.
 */

function makeBookMeta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Teach me testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

function makeToc(overrides: Partial<Toc> = {}): Toc {
  return {
    chapters: [
      { title: 'Chapter 1', description: 'Introduction' },
      { title: 'Chapter 2', description: 'Deep dive' },
    ],
    ...overrides,
  }
}

function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    questions: [
      { question: 'What is X?', options: ['A', 'B', 'C', 'D'], correctIndex: 1 },
    ],
    ...overrides,
  }
}

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    chapter: 1,
    feedback: { liked: 'The analogies', disliked: 'Too much jargon' },
    quiz: { questions: makeQuiz().questions, score: 1 },
    ...overrides,
  }
}

function makeProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
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
    ...overrides,
  }
}

function makeChapterProgress(overrides: Partial<ChapterProgress> = {}): ChapterProgress {
  return { scroll: 1, completed: true, completedAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

function makeSummary(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  return { summary: 'A short summary', keyPoints: ['point one', 'point two'], ...overrides }
}

export function describeBookRepositoryContract(
  label: string,
  makeSubject: () => BookRepository | Promise<BookRepository>,
): void {
  describe(`BookRepository contract (${label})`, () => {
    let repo: BookRepository

    beforeEach(async () => {
      repo = await makeSubject()
    })

    describe('learning profile', () => {
      it('rejects with a not found code when nothing has been saved', async () => {
        await expect(repo.getProfile()).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved profile', async () => {
        await repo.saveProfile(makeProfile({ style: 'story-driven' }))
        const result = await repo.getProfile()
        expect(result.style).toBe('story-driven')
      })

      it('reports no updatedAt until the first save', async () => {
        expect(await repo.getProfileUpdatedAt()).toBeNull()
      })

      it('reports an updatedAt after saving, that advances on a second save', async () => {
        await repo.saveProfile(makeProfile())
        const first = await repo.getProfileUpdatedAt()
        expect(first).not.toBeNull()

        await repo.saveProfile(makeProfile({ style: 'changed' }))
        const second = await repo.getProfileUpdatedAt()
        expect(second).not.toBeNull()
        expect(second! > first!).toBe(true)
      })
    })

    describe('book CRUD', () => {
      it('lists no books when nothing has been saved', async () => {
        expect(await repo.listBooks()).toEqual([])
      })

      it('rejects with a not found code for a book that was never saved', async () => {
        await expect(repo.getBook('missing')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved book', async () => {
        await repo.saveBook(makeBookMeta())
        const book = await repo.getBook('book-1')
        expect(book).toEqual(makeBookMeta())
      })

      it('reflects a saved book in the listing', async () => {
        await repo.saveBook(makeBookMeta())
        const books = await repo.listBooks()
        expect(books).toHaveLength(1)
        expect(books[0].id).toBe('book-1')
      })

      it('lists newest createdAt first', async () => {
        await repo.saveBook(makeBookMeta({ id: 'older', createdAt: '2026-01-01T00:00:00.000Z' }))
        await repo.saveBook(makeBookMeta({ id: 'newer', createdAt: '2026-03-01T00:00:00.000Z' }))
        const books = await repo.listBooks()
        expect(books.map((b) => b.id)).toEqual(['newer', 'older'])
      })

      it('makes a book unreadable after deleting it', async () => {
        await repo.saveBook(makeBookMeta())
        await repo.deleteBook('book-1')

        await expect(repo.getBook('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await repo.listBooks()).toEqual([])
      })

      it('does not throw when deleting a book that was never saved', async () => {
        await expect(repo.deleteBook('never-existed')).resolves.not.toThrow()
      })

      it('deleting a book also clears its table of contents, chapters, quizzes, feedback, and progress', async () => {
        await repo.saveBook(makeBookMeta())
        await repo.saveToc('book-1', makeToc())
        await repo.saveChapter('book-1', 1, '# Chapter 1')
        await repo.saveQuiz('book-1', 1, makeQuiz())
        await repo.saveFinalQuiz('book-1', makeQuiz())
        await repo.saveFeedback('book-1', 1, makeFeedback())
        await repo.saveChapterProgress('book-1', 1, makeChapterProgress())
        await repo.saveBrief('book-1', 'Write a book about testing.')
        await repo.saveSummary('book-1', 1, makeSummary())
        await repo.saveReference('book-1', 'source-a', 'Reference body')

        await repo.deleteBook('book-1')

        await expect(repo.getToc('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(repo.getChapter('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await repo.chapterExists('book-1', 1)).toBe(false)
        await expect(repo.getQuiz('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(repo.finalQuizExists('book-1')).toBe(false)
        expect(await repo.getAllFeedback('book-1')).toEqual([])
        expect(await repo.getProgress('book-1')).toEqual({ chapters: {} })
        await expect(repo.getBrief('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await repo.getAllSummaries('book-1')).toEqual([])
        expect(await repo.listReferences('book-1')).toEqual([])
      })
    })

    describe('resetBook', () => {
      async function seedReadBook(): Promise<void> {
        await repo.saveBook(makeBookMeta({
          status: 'complete',
          rating: 4.5,
          finalQuizScore: 8,
          finalQuizTotal: 10,
        }))
        await repo.saveToc('book-1', makeToc())
        await repo.saveChapter('book-1', 1, '# Chapter 1')
        await repo.saveChapterProgress('book-1', 1, makeChapterProgress())
        await repo.saveFeedback('book-1', 1, makeFeedback())
        await repo.saveQuiz('book-1', 1, {
          questions: [{ question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, userAnswer: 3, correct: false }],
        })
        await repo.saveFinalQuiz('book-1', {
          questions: [{ question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 1, userAnswer: 1, correct: true }],
        })
      }

      it('rejects with a not found code for a book that was never saved', async () => {
        await expect(repo.resetBook('missing')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('rejects while the book is generating its table of contents or a chapter', async () => {
        await repo.saveBook(makeBookMeta({ status: 'generating_toc' }))
        await expect(repo.resetBook('book-1')).rejects.toThrow(/generating/)

        await repo.saveBook(makeBookMeta({ status: 'generating' }))
        await expect(repo.resetBook('book-1')).rejects.toThrow(/generating/)
      })

      it('clears progress and feedback, and strips answers from quizzes while keeping the questions', async () => {
        await seedReadBook()
        await repo.resetBook('book-1')

        expect(await repo.getProgress('book-1')).toEqual({ chapters: {} })
        expect(await repo.getAllFeedback('book-1')).toEqual([])

        const quiz = await repo.getQuiz('book-1', 1)
        expect(quiz.questions).toHaveLength(1)
        expect(quiz.questions[0]).not.toHaveProperty('userAnswer')
        expect(quiz.questions[0]).not.toHaveProperty('correct')
        expect(quiz.questions[0].question).toBe('Q1')

        const finalQuiz = await repo.getFinalQuiz('book-1')
        expect(finalQuiz.questions[0]).not.toHaveProperty('userAnswer')
        expect(finalQuiz.questions[0]).not.toHaveProperty('correct')
      })

      it('preserves generated content such as chapters and the table of contents', async () => {
        await seedReadBook()
        await repo.resetBook('book-1')

        expect(await repo.getChapter('book-1', 1)).toBe('# Chapter 1')
        expect((await repo.getToc('book-1')).chapters).toHaveLength(2)
      })

      it('resets status and drops rating and final quiz score, and advances updatedAt', async () => {
        await seedReadBook()
        const before = await repo.getBook('book-1')

        await repo.resetBook('book-1')
        const after = await repo.getBook('book-1')

        expect(after.status).toBe('reading')
        expect(after.rating).toBeUndefined()
        expect(after.finalQuizScore).toBeUndefined()
        expect(after.finalQuizTotal).toBeUndefined()
        expect(after.updatedAt > before.updatedAt).toBe(true)
        expect(after.id).toBe(before.id)
        expect(after.title).toBe(before.title)
      })

      it('is idempotent across repeated calls', async () => {
        await seedReadBook()
        await repo.resetBook('book-1')
        await expect(repo.resetBook('book-1')).resolves.not.toThrow()
        const after = await repo.getBook('book-1')
        expect(after.status).toBe('reading')
      })
    })

    describe('table of contents', () => {
      it('rejects with a not found code when no table of contents has been saved', async () => {
        await expect(repo.getToc('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved table of contents', async () => {
        await repo.saveToc('book-1', makeToc())
        const toc = await repo.getToc('book-1')
        expect(toc.chapters).toHaveLength(2)
        expect(toc.chapters[0].title).toBe('Chapter 1')
      })
    })

    describe('chapters', () => {
      it('rejects with a not found code for a chapter that was never saved', async () => {
        await expect(repo.getChapter('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips saved chapter content', async () => {
        await repo.saveChapter('book-1', 1, '# Chapter 1\n\nHello world')
        expect(await repo.getChapter('book-1', 1)).toBe('# Chapter 1\n\nHello world')
      })

      it('reports existence in agreement with what was saved', async () => {
        expect(await repo.chapterExists('book-1', 1)).toBe(false)
        await repo.saveChapter('book-1', 1, '# Chapter 1')
        expect(await repo.chapterExists('book-1', 1)).toBe(true)
      })
    })

    describe('per chapter quiz', () => {
      it('rejects with a not found code for a quiz that was never saved', async () => {
        await expect(repo.getQuiz('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved quiz', async () => {
        await repo.saveQuiz('book-1', 1, makeQuiz())
        const quiz = await repo.getQuiz('book-1', 1)
        expect(quiz.questions).toHaveLength(1)
        expect(quiz.questions[0].question).toBe('What is X?')
      })

      it('reports existence in agreement with what was saved', async () => {
        expect(await repo.quizExists('book-1', 1)).toBe(false)
        await repo.saveQuiz('book-1', 1, makeQuiz())
        expect(await repo.quizExists('book-1', 1)).toBe(true)
      })
    })

    describe('final quiz', () => {
      it('rejects with a not found code when no final quiz has been saved', async () => {
        await expect(repo.getFinalQuiz('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved final quiz', async () => {
        await repo.saveFinalQuiz('book-1', makeQuiz())
        const quiz = await repo.getFinalQuiz('book-1')
        expect(quiz.questions).toHaveLength(1)
      })

      it('reports existence synchronously, in agreement with what was saved', () => {
        expect(repo.finalQuizExists('book-1')).toBe(false)
      })

      it('reports existence synchronously after a save', async () => {
        await repo.saveFinalQuiz('book-1', makeQuiz())
        expect(repo.finalQuizExists('book-1')).toBe(true)
      })
    })

    describe('feedback', () => {
      it('rejects with a not found code for feedback that was never saved', async () => {
        await expect(repo.getFeedback('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips saved feedback', async () => {
        await repo.saveFeedback('book-1', 1, makeFeedback())
        const fb = await repo.getFeedback('book-1', 1)
        expect(fb.feedback.liked).toBe('The analogies')
      })

      it('lists no feedback when none has been saved', async () => {
        expect(await repo.getAllFeedback('book-1')).toEqual([])
      })

      it('lists saved feedback ordered by chapter number', async () => {
        await repo.saveFeedback('book-1', 2, makeFeedback({ chapter: 2 }))
        await repo.saveFeedback('book-1', 1, makeFeedback({ chapter: 1 }))
        const all = await repo.getAllFeedback('book-1')
        expect(all.map((f) => f.chapter)).toEqual([1, 2])
      })
    })

    describe('progress', () => {
      it('resolves to empty progress rather than rejecting when nothing has been saved', async () => {
        expect(await repo.getProgress('book-1')).toEqual({ chapters: {} })
      })

      it('round trips saved chapter progress', async () => {
        await repo.saveChapterProgress('book-1', 1, makeChapterProgress({ scroll: 0.75, completed: false, completedAt: undefined }))
        const progress = await repo.getProgress('book-1')
        expect(progress.chapters['1'].scroll).toBe(0.75)
        expect(progress.chapters['1'].completed).toBe(false)
      })

      it('accumulates progress across chapters', async () => {
        await repo.saveChapterProgress('book-1', 1, makeChapterProgress({ completed: true }))
        await repo.saveChapterProgress('book-1', 2, makeChapterProgress({ completed: false, completedAt: undefined }))
        const progress = await repo.getProgress('book-1')
        expect(progress.chapters['1'].completed).toBe(true)
        expect(progress.chapters['2'].completed).toBe(false)
      })

      it('derives chaptersRead as the count of completed chapters, worked through on three chapters', async () => {
        expect(await repo.getChaptersRead('book-1')).toBe(0)

        await repo.saveChapterProgress('book-1', 1, makeChapterProgress({ completed: true }))
        await repo.saveChapterProgress('book-1', 2, makeChapterProgress({ completed: false, completedAt: undefined }))
        await repo.saveChapterProgress('book-1', 3, makeChapterProgress({ completed: true }))

        expect(await repo.getChaptersRead('book-1')).toBe(2)
      })
    })

    describe('skill progress', () => {
      it('derives stats and per-skill weight from a table of contents and progress, worked through on one book', async () => {
        await repo.saveBook(makeBookMeta({ id: 'b1', title: 'Cooking 101', createdAt: '2026-01-01T00:00:00.000Z' }))
        await repo.saveToc('b1', {
          skills: [{ name: 'Cooking', weight: 3 }],
          chapters: [
            { title: 'Knife Skills', description: 'd1', skills: [{ skill: 'Cooking', subskill: 'Knife Skills', weight: 2 }] },
            { title: 'Seasoning', description: 'd2', skills: [{ skill: 'Cooking', subskill: 'Seasoning', weight: 1 }] },
          ],
        })
        // Chapter 1 completed, chapter 2 not, so the book overall is incomplete.
        await repo.saveChapterProgress('b1', 1, { scroll: 1, completed: true, completedAt: '2026-02-01T00:00:00.000Z' })
        await repo.saveChapterProgress('b1', 2, { scroll: 0.2, completed: false })

        const result = await repo.getSkillProgress()

        expect(result.stats).toEqual({ totalBooks: 1, completedBooks: 0, totalChapters: 2, completedChapters: 1 })
        expect(result.skills).toEqual([
          {
            name: 'Cooking',
            // The book-level skill weight is credited only when the whole
            // book is complete, so an incomplete book contributes zero even
            // though one of its two chapters is done.
            totalWeight: 3,
            completedWeight: 0,
            lastActivityAt: '2026-02-01T00:00:00.000Z',
            books: [{ bookId: 'b1', title: 'Cooking 101', weight: 3, completed: false, lastActivityAt: '2026-02-01T00:00:00.000Z' }],
            // Subskill weight, in contrast, is credited per chapter, so the
            // completed chapter's subskill is fully credited on its own.
            subskills: [
              { name: 'Knife Skills', totalWeight: 2, completedWeight: 2 },
              { name: 'Seasoning', totalWeight: 1, completedWeight: 0 },
            ],
          },
        ])
      })

      it('excludes a book whose table of contents declares no skills', async () => {
        await repo.saveBook(makeBookMeta({ id: 'b1' }))
        await repo.saveToc('b1', makeToc())
        await repo.saveChapterProgress('b1', 1, makeChapterProgress({ completed: true }))
        await repo.saveChapterProgress('b1', 2, makeChapterProgress({ completed: true }))

        const result = await repo.getSkillProgress()
        expect(result.stats).toEqual({ totalBooks: 0, completedBooks: 0, totalChapters: 0, completedChapters: 0 })
        expect(result.skills).toEqual([])
      })

      it('skips a book with no table of contents saved yet, rather than rejecting', async () => {
        await repo.saveBook(makeBookMeta({ id: 'b1', status: 'toc_review' }))
        await expect(repo.getSkillProgress()).resolves.toEqual({
          stats: { totalBooks: 0, completedBooks: 0, totalChapters: 0, completedChapters: 0 },
          skills: [],
        })
      })

      it('resolves to zeroed stats and no skills when no books have been saved', async () => {
        expect(await repo.getSkillProgress()).toEqual({
          stats: { totalBooks: 0, completedBooks: 0, totalChapters: 0, completedChapters: 0 },
          skills: [],
        })
      })
    })

    describe('brief', () => {
      it('rejects with a not found code when no brief has been saved', async () => {
        await expect(repo.getBrief('book-1')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved brief', async () => {
        await repo.saveBrief('book-1', 'Write a book about testing.')
        expect(await repo.getBrief('book-1')).toBe('Write a book about testing.')
      })
    })

    describe('chapter summaries', () => {
      it('rejects with a not found code for a summary that was never saved', async () => {
        await expect(repo.getSummary('book-1', 1)).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved summary', async () => {
        await repo.saveSummary('book-1', 1, makeSummary())
        const summary = await repo.getSummary('book-1', 1)
        expect(summary.keyPoints).toEqual(['point one', 'point two'])
      })

      it('lists no summaries when none has been saved', async () => {
        expect(await repo.getAllSummaries('book-1')).toEqual([])
      })

      it('lists saved summaries ordered by chapter number', async () => {
        await repo.saveSummary('book-1', 2, makeSummary({ summary: 'second' }))
        await repo.saveSummary('book-1', 1, makeSummary({ summary: 'first' }))
        const all = await repo.getAllSummaries('book-1')
        expect(all.map((s) => s.summary)).toEqual(['first', 'second'])
      })
    })

    describe('references', () => {
      it('rejects a name containing anything other than letters, digits, and hyphens', async () => {
        await expect(repo.saveReference('book-1', 'bad name!', 'content')).rejects.toThrow(/Invalid reference name/)
        await expect(repo.getReference('book-1', 'bad name!')).rejects.toThrow(/Invalid reference name/)
      })

      it('rejects with a not found code for a reference that was never saved', async () => {
        await expect(repo.getReference('book-1', 'source-a')).rejects.toMatchObject({ code: 'ENOENT' })
      })

      it('round trips a saved reference', async () => {
        await repo.saveReference('book-1', 'source-a', 'Reference body')
        expect(await repo.getReference('book-1', 'source-a')).toBe('Reference body')
      })

      it('lists no references when none has been saved', async () => {
        expect(await repo.listReferences('book-1')).toEqual([])
      })

      it('lists a saved reference by name', async () => {
        await repo.saveReference('book-1', 'source-a', 'Reference body')
        const manifest = await repo.listReferences('book-1')
        expect(manifest).toEqual([{ name: 'source-a' }])
      })
    })
  })
}
