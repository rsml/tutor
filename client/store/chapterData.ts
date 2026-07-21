/**
 * Per-chapter feedback and quiz results, keyed by book and then by chapter.
 *
 * This is the record of what the reader said and scored, which the generator
 * reads back when writing the next chapter.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './index'

interface QuizResult {
  questions: Array<{
    question: string
    options: string[]
    correctIndex: number
    userAnswer?: number
    correct?: boolean
  }>
  score: number
}

interface ChapterFeedback {
  liked: string
  disliked: string
}

// bookId -> chapterNum (string) -> data
export interface ChapterDataState {
  feedback: Record<string, Record<string, ChapterFeedback>>
  quizResults: Record<string, Record<string, QuizResult>>
}

const chapterDataSlice = createSlice({
  name: 'chapterData',
  initialState: { feedback: {}, quizResults: {} } as ChapterDataState,
  reducers: {
    setChapterFeedback(state, action: PayloadAction<{ bookId: string; chapterNum: number; liked: string; disliked: string }>) {
      const { bookId, chapterNum, liked, disliked } = action.payload
      if (!state.feedback[bookId]) state.feedback[bookId] = {}
      state.feedback[bookId][String(chapterNum)] = { liked, disliked }
    },
    setChapterQuizResult(state, action: PayloadAction<{ bookId: string; chapterNum: number; result: QuizResult }>) {
      const { bookId, chapterNum, result } = action.payload
      if (!state.quizResults[bookId]) state.quizResults[bookId] = {}
      state.quizResults[bookId][String(chapterNum)] = result
    },
  },
})

export const { setChapterFeedback, setChapterQuizResult } = chapterDataSlice.actions

export const selectChapterFeedback = (bookId: string, chapterNum: number) =>
  (state: RootState) => state.chapterData.feedback[bookId]?.[String(chapterNum)] ?? null

export const selectChapterQuizResult = (bookId: string, chapterNum: number) =>
  (state: RootState) => state.chapterData.quizResults[bookId]?.[String(chapterNum)] ?? null

export const chapterDataReducer = chapterDataSlice.reducer
