import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export interface QuizAttempt {
  attemptNumber: number
  timestamp: string
  answers: Array<{ selectedAnswer: number; correct: boolean }>
  score: number
}

export interface ChapterQuiz {
  questions: QuizQuestion[]
  attempts: QuizAttempt[]
}

export interface QuizHistoryState {
  quizzes: Record<string, Record<string, ChapterQuiz>>
}

const initialState: QuizHistoryState = { quizzes: {} }

const quizHistorySlice = createSlice({
  name: 'quizHistory',
  initialState,
  reducers: {
    recordQuizAttempt(
      state,
      action: PayloadAction<{
        bookId: string
        chapterNum: number
        questions: QuizQuestion[]
        answers: number[]
      }>,
    ) {
      const { bookId, chapterNum, questions, answers } = action.payload
      const key = String(chapterNum)
      if (!state.quizzes[bookId]) state.quizzes[bookId] = {}

      const existing = state.quizzes[bookId][key]
      const attemptNumber = existing ? existing.attempts.length + 1 : 1

      const attemptAnswers = answers.map((selectedAnswer, i) => ({
        selectedAnswer,
        correct: selectedAnswer === questions[i].correctIndex,
      }))
      const score = attemptAnswers.filter(a => a.correct).length

      const attempt: QuizAttempt = {
        attemptNumber,
        timestamp: new Date().toISOString(),
        answers: attemptAnswers,
        score,
      }

      if (existing) {
        existing.attempts.push(attempt)
      } else {
        state.quizzes[bookId][key] = {
          questions,
          attempts: [attempt],
        }
      }
    },
  },
})

export const { recordQuizAttempt } = quizHistorySlice.actions
export default quizHistorySlice.reducer
