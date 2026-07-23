import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@client/store'

const selectQuizHistory = (state: RootState) => state.quizHistory.quizzes

const selectBookQuizzes = (bookId: string) =>
  createSelector(selectQuizHistory, quizzes => quizzes[bookId] ?? {})

const selectOverallScore = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const entries = Object.values(chapters)
    if (entries.length === 0) return { correct: 0, total: 0 }
    let correct = 0
    let total = 0
    for (const ch of entries) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (!latest) continue
      correct += latest.score
      total += ch.questions.length
    }
    return { correct, total }
  })

const selectChaptersNeedingReview = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const result: Array<{ chapterNum: number; latestScore: number; totalQuestions: number }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (latest && latest.score < ch.questions.length) {
        result.push({
          chapterNum: parseInt(key),
          latestScore: latest.score,
          totalQuestions: ch.questions.length,
        })
      }
    }
    return result.sort((a, b) => a.latestScore - b.latestScore)
  })

export const selectSmartReviewQueue = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const queue: Array<{
      bookId: string
      chapterNum: number
      questionIndex: number
      question: string
      options: string[]
      correctIndex: number
    }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (!latest) continue
      latest.answers.forEach((a, qi) => {
        if (!a.correct) {
          queue.push({
            bookId,
            chapterNum: parseInt(key),
            questionIndex: qi,
            ...ch.questions[qi],
          })
        }
      })
    }
    return queue.sort((a, b) => a.chapterNum - b.chapterNum)
  })

export const selectBookQuizSummary = (bookId: string) =>
  createSelector(
    [selectOverallScore(bookId), selectChaptersNeedingReview(bookId), selectBookQuizzes(bookId)],
    (overall, needsReview, chapters) => ({
      ...overall,
      chaptersToReview: needsReview.length,
      totalChaptersWithQuizzes: Object.keys(chapters).length,
      hasAnyData: Object.keys(chapters).length > 0,
    }),
  )
