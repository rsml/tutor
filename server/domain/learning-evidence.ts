import type { BookMeta, Feedback, Toc } from '@shared/domain.js'
import { sanitizeFeedback } from './sanitize.js'

/**
 * Pure assembly of the reader-evidence text blocks fed into AI prompts:
 * one per-book summary for the next-book suggestion (summarizeBookEvidence)
 * and one per-chapter feedback description for the profile-update
 * suggestion (describeChapterFeedback). Both are pure formatting over data
 * a service already loaded — no storage access, no AI call — so both are
 * unit tested directly with plain inputs and no fakes.
 */

/**
 * One chapter's client-side quiz history, as reported by the browser, which
 * tracks its own quiz attempts independently of the server-recorded
 * feedback. Keyed by chapter number (as a string) at the call site.
 */
export interface ClientChapterQuizHistory {
  questions: Array<{ question: string; options: string[]; correctIndex: number }>
  attempts: Array<{
    score: number
    timestamp?: string
    answers: Array<{ selectedAnswer: number; correct: boolean }>
  }>
}

/** The subset of BookMeta the next-book suggestion's evidence summary reads. */
export type SuggestionBook = Pick<
  BookMeta,
  'title' | 'prompt' | 'status' | 'generatedUpTo' | 'totalChapters' | 'createdAt' | 'updatedAt' | 'rating'
>

/**
 * Assembles one book's block of the evidence hierarchy fed into the
 * next-book suggestion prompt: status, feedback-derived quiz performance
 * (which names the questions, and by extension the chapters, the reader
 * did worst on), client-reported quiz history, and the table of contents.
 * All I/O — loading feedback, the TOC, and client quiz history — happens
 * before this is called; this only formats what it is given.
 */
export function summarizeBookEvidence(
  book: SuggestionBook,
  feedback: Feedback[],
  toc: Toc | undefined,
  clientQuizData: Record<string, ClientChapterQuizHistory> | undefined,
): string {
  const parts = [`"${book.title}" — Topic: ${book.prompt.slice(0, 200)}`]
  parts.push(`Status: ${book.status}, Chapters: ${book.generatedUpTo}/${book.totalChapters}`)
  parts.push(`Started: ${book.createdAt}, Last activity: ${book.updatedAt}`)

  if (book.rating) parts.push(`Rating: ${book.rating}/5`)

  if (feedback.length > 0) {
    const avgScore = feedback.reduce((sum, fb) => sum + (fb.quiz.score ?? 0), 0) / feedback.length
    const totalQs = feedback.reduce((sum, fb) => sum + fb.quiz.questions.length, 0)
    parts.push(`Avg quiz score: ${avgScore.toFixed(1)}/${totalQs > 0 ? (totalQs / feedback.length).toFixed(0) : '?'}`)

    const wrongTopics = feedback.flatMap(fb =>
      fb.quiz.questions.filter(q => q.correct === false).map(q => q.question),
    )
    if (wrongTopics.length > 0) {
      parts.push(`Struggled with: ${wrongTopics.slice(0, 5).join('; ')}`)
    }
  }

  if (clientQuizData) {
    const chapters = Object.entries(clientQuizData)
    let totalCorrect = 0
    let totalQuestions = 0
    const weakAreas: string[] = []

    let latestTimestamp: string | undefined
    for (const [, ch] of chapters) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (!latest) continue
      totalCorrect += latest.score
      totalQuestions += ch.questions.length
      if (latest.timestamp && (!latestTimestamp || latest.timestamp > latestTimestamp)) {
        latestTimestamp = latest.timestamp
      }
      latest.answers.forEach((a, i) => {
        if (!a.correct) weakAreas.push(ch.questions[i].question)
      })
    }
    if (totalQuestions > 0) {
      parts.push(`Client quiz: ${totalCorrect}/${totalQuestions}${latestTimestamp ? ` (latest: ${latestTimestamp.split('T')[0]})` : ''}`)
    }
    if (weakAreas.length > 0) {
      parts.push(`Weak areas (client): ${weakAreas.slice(0, 5).join('; ')}`)
    }
  }

  if (toc) {
    parts.push(`Chapters: ${toc.chapters.map(c => c.title).join(', ')}`)
  }

  return parts.join('\n  ')
}

/**
 * One line per chapter, naming what the reader liked, disliked, and which
 * quiz questions they got wrong — feeding the profile-update suggestion
 * prompt so the model can see exactly which chapters the reader struggled
 * with and why. Order matches `allFeedback`'s order.
 */
export function describeChapterFeedback(allFeedback: Feedback[]): string {
  return allFeedback.map(fb => {
    const parts: string[] = []
    if (fb.feedback.liked) parts.push(`Liked: ${sanitizeFeedback(fb.feedback.liked)}`)
    if (fb.feedback.disliked) parts.push(`Disliked: ${sanitizeFeedback(fb.feedback.disliked)}`)
    if (fb.quiz.score !== undefined) {
      parts.push(`Quiz score: ${fb.quiz.score}/${fb.quiz.questions.length}`)
      const wrong = fb.quiz.questions.filter(q => q.correct === false)
      if (wrong.length > 0) {
        parts.push(`Struggled with: ${wrong.map(q => q.question).join('; ')}`)
      }
    }
    return `Chapter ${fb.chapter}: ${parts.join('. ')}`
  }).join('\n')
}
