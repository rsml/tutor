import type {
  BookMeta,
  Toc,
  Progress,
  ChapterProgress,
  Feedback,
  Quiz,
  LearningProfile,
  ChapterSummary,
  ReferenceManifest,
} from '@shared/domain.js'
import type { SkillProgress } from '@shared/responses.js'

/**
 * The port that server/services/book-store.ts stands in front of today for
 * every structured piece of a book, meaning YAML metadata and Markdown text
 * rather than binary files. Books, tables of contents, chapters, per
 * chapter and final quizzes, feedback, reading progress, the global
 * learning profile, generation briefs, chapter summaries, and reference
 * manifests all live behind this one interface.
 *
 * A service depends on this shape instead of importing Node's filesystem
 * module, the yaml package, or a path helper directly, so it can be unit
 * tested against createFakeBookRepository() and later pointed at a real
 * filesystem, or a database, without changing a single call site.
 *
 * Binary artifacts such as covers, EPUB files, and audiobook audio are
 * deliberately out of scope here. See artifact-store.ts for those, and for
 * why they get a separate, filesystem shaped port instead of living here.
 */

/**
 * Thrown by a get method when the entity it asked for was never saved. The
 * code property is set to ENOENT on purpose, matching the property Node
 * puts on the filesystem errors the real store throws today, so the
 * server's error handler can turn either one into the same 404 response
 * without knowing whether it is talking to the fake or the real adapter. A
 * future real adapter satisfies this contract by rejecting with anything
 * that carries that same code, its own Node fs error included, rather than
 * by throwing this exact class.
 */
export class NotFoundError extends Error {
  readonly code = 'ENOENT'

  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export interface BookRepository {
  // --- Learning profile, global rather than per book ---

  /** Rejects with NotFoundError when no profile has been saved yet. */
  getProfile(): Promise<LearningProfile>
  saveProfile(profile: LearningProfile): Promise<void>
  /** Resolves to null when no profile has been saved yet, rather than rejecting. */
  getProfileUpdatedAt(): Promise<string | null>

  // --- Book CRUD ---

  /** Resolves to an empty array when no book has been saved. Sorted by createdAt, newest first. */
  listBooks(): Promise<BookMeta[]>
  /** Rejects with NotFoundError when no book has been saved under this id. */
  getBook(bookId: string): Promise<BookMeta>
  saveBook(meta: BookMeta): Promise<void>
  /** Resolves without error when the book was never saved, the same as a plain no-op. */
  deleteBook(bookId: string): Promise<void>
  /**
   * Clears reading interaction, meaning progress, feedback, and quiz
   * answers, while keeping generated content such as chapters and the
   * table of contents. Rejects while the book's status is generating or
   * generating_toc, and rejects with NotFoundError when the book itself
   * has not been saved.
   */
  resetBook(bookId: string): Promise<void>

  // --- Table of contents ---

  /** Rejects with NotFoundError when the table of contents has not been saved yet. */
  getToc(bookId: string): Promise<Toc>
  saveToc(bookId: string, toc: Toc): Promise<void>

  // --- Chapters ---

  /** Rejects with NotFoundError when this chapter has not been saved yet. */
  getChapter(bookId: string, chapterNum: number): Promise<string>
  saveChapter(bookId: string, chapterNum: number, content: string): Promise<void>
  chapterExists(bookId: string, chapterNum: number): Promise<boolean>

  // --- Per chapter quiz ---

  /** Rejects with NotFoundError when this chapter has no quiz saved yet. */
  getQuiz(bookId: string, chapterNum: number): Promise<Quiz>
  saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void>
  quizExists(bookId: string, chapterNum: number): Promise<boolean>

  // --- Final quiz ---

  /** Rejects with NotFoundError when the final quiz has not been saved yet. */
  getFinalQuiz(bookId: string): Promise<Quiz>
  saveFinalQuiz(bookId: string, quiz: Quiz): Promise<void>
  /**
   * The one existence check the real store answers synchronously rather
   * than through a promise. This port preserves that instead of smoothing
   * every method into a uniform async shape.
   */
  finalQuizExists(bookId: string): boolean

  // --- Feedback ---

  /** Rejects with NotFoundError when this chapter has no feedback saved yet. */
  getFeedback(bookId: string, chapterNum: number): Promise<Feedback>
  saveFeedback(bookId: string, chapterNum: number, feedback: Feedback): Promise<void>
  /** Resolves to an empty array when the book has no feedback at all, rather than rejecting. */
  getAllFeedback(bookId: string): Promise<Feedback[]>

  // --- Progress ---

  /**
   * Resolves to an empty progress record when nothing has been saved yet,
   * rather than rejecting. This is the one get method on the whole port
   * that always succeeds.
   */
  getProgress(bookId: string): Promise<Progress>
  saveChapterProgress(bookId: string, chapterNum: number, progress: ChapterProgress): Promise<void>
  /** Derived from progress rather than stored on its own, counting the chapters marked completed. */
  getChaptersRead(bookId: string): Promise<number>
  /**
   * Skill mastery rolled up across every saved book, derived from each
   * book's table of contents and progress rather than stored on its own.
   * A book contributes nothing unless its table of contents declares
   * skills. See the contract test for the exact aggregation rules, worked
   * through on a small example.
   */
  getSkillProgress(): Promise<SkillProgress>

  // --- Brief, the generation input a book was built from ---

  saveBrief(bookId: string, content: string): Promise<void>
  /** Rejects with NotFoundError when no brief has been saved for this book. */
  getBrief(bookId: string): Promise<string>

  // --- Chapter summaries ---

  saveSummary(bookId: string, chapterNum: number, summary: ChapterSummary): Promise<void>
  /** Rejects with NotFoundError when this chapter has no summary saved yet. */
  getSummary(bookId: string, chapterNum: number): Promise<ChapterSummary>
  /** Resolves to an empty array when the book has no summaries at all. */
  getAllSummaries(bookId: string): Promise<ChapterSummary[]>

  // --- References, source material a book was grounded in ---

  /** Rejects when name contains anything other than letters, digits, and hyphens. */
  saveReference(bookId: string, name: string, content: string): Promise<void>
  /** Rejects when name is malformed, or with NotFoundError when no reference of this name has been saved. */
  getReference(bookId: string, name: string): Promise<string>
  /** Resolves to an empty array when the book has no references at all. */
  listReferences(bookId: string): Promise<ReferenceManifest>
}
