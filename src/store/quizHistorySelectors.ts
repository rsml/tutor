import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@src/store'

const selectQuizHistory = (state: RootState) => state.quizHistory.quizzes

const selectBookQuizzes = (bookId: string) =>
  createSelector(selectQuizHistory, quizzes => quizzes[bookId] ?? {})

export const selectChapterQuiz = (bookId: string, chapterNum: number) =>
  createSelector(selectBookQuizzes(bookId), book => book[String(chapterNum)] ?? null)

export const selectChapterAttempts = (bookId: string, chapterNum: number) =>
  createSelector(selectChapterQuiz(bookId, chapterNum), quiz => quiz?.attempts ?? [])

export const selectOverallScore = (bookId: string) =>
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

export const selectChaptersNeedingReview = (bookId: string) =>
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

export const selectChapterSparkline = (bookId: string, chapterNum: number) =>
  createSelector(selectChapterAttempts(bookId, chapterNum), attempts =>
    attempts.map(a => a.score),
  )

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

export const selectPerQuestionCorrectRate = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const rates: Array<{
      chapterNum: number
      questionIndex: number
      question: string
      timesCorrect: number
      timesAttempted: number
      rate: number
      improving: boolean | null
    }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      ch.questions.forEach((q, qi) => {
        let timesCorrect = 0
        let timesAttempted = 0
        let lastTwo: boolean[] = []
        for (const attempt of ch.attempts) {
          if (attempt.answers[qi]) {
            timesAttempted++
            if (attempt.answers[qi].correct) timesCorrect++
            lastTwo.push(attempt.answers[qi].correct)
            if (lastTwo.length > 2) lastTwo = lastTwo.slice(-2)
          }
        }
        const improving =
          lastTwo.length < 2 ? null : !lastTwo[0] && lastTwo[1] ? true : lastTwo[0] && !lastTwo[1] ? false : null
        rates.push({
          chapterNum: parseInt(key),
          questionIndex: qi,
          question: q.question,
          timesCorrect,
          timesAttempted,
          rate: timesAttempted > 0 ? timesCorrect / timesAttempted : 0,
          improving,
        })
      })
    }
    return rates.sort((a, b) => a.rate - b.rate)
  })
