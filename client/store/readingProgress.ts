/**
 * Where the reader is in each book, and how far they have ever reached.
 *
 * Position is what the reader returns to. Furthest never moves backwards, so
 * re-reading an earlier chapter cannot make the library think progress was
 * lost.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface ReadingPosition {
  chapter: number
  section: number
  lastReadAt: string
}

export interface ReadingProgressState {
  positions: Record<string, ReadingPosition>
  furthest: Record<string, number>
}

/** Normalize legacy number positions to { chapter, section, lastReadAt } */
function migratePosition(value: unknown): ReadingPosition {
  if (typeof value === 'number') return { chapter: value, section: 0, lastReadAt: new Date().toISOString() }
  if (value && typeof value === 'object' && 'chapter' in value) {
    const pos = value as Record<string, unknown>
    return {
      chapter: pos.chapter as number,
      section: (pos.section as number) ?? 0,
      lastReadAt: (pos.lastReadAt as string) ?? new Date().toISOString(),
    }
  }
  return { chapter: 0, section: 0, lastReadAt: new Date().toISOString() }
}

const readingProgressSlice = createSlice({
  name: 'readingProgress',
  initialState: { positions: {}, furthest: {} } as ReadingProgressState,
  reducers: {
    setPosition(state, action: PayloadAction<{ bookId: string; chapter: number; section: number }>) {
      const { bookId, chapter, section } = action.payload
      state.positions[bookId] = { chapter, section, lastReadAt: new Date().toISOString() }
      const prev = state.furthest[bookId] ?? -1
      if (chapter > prev) {
        state.furthest[bookId] = chapter
      }
    },
  },
})

export const { setPosition } = readingProgressSlice.actions

/** @deprecated Use setPosition instead */
export function setChapterPosition(payload: { bookId: string; chapterIndex: number }) {
  return setPosition({ bookId: payload.bookId, chapter: payload.chapterIndex, section: 0 })
}

export { migratePosition }

export const readingProgressReducer = readingProgressSlice.reducer
