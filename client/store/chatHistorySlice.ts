import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ChatMessage } from '@client/features/chat/hooks/useStreamingChat'

export interface ChatHistoryState {
  histories: Record<string, ChatMessage[]>
}

const initialState: ChatHistoryState = { histories: {} }

const chatHistorySlice = createSlice({
  name: 'chatHistory',
  initialState,
  reducers: {
    setChatMessages(state, action: PayloadAction<{ bookId: string; messages: ChatMessage[] }>) {
      state.histories[action.payload.bookId] = action.payload.messages
    },
    clearChatHistory(state, action: PayloadAction<{ bookId: string }>) {
      delete state.histories[action.payload.bookId]
    },
  },
})

export const { setChatMessages, clearChatHistory } = chatHistorySlice.actions

const EMPTY_MESSAGES: ChatMessage[] = []

export const selectChatMessages = (bookId: string) =>
  createSelector(
    (state: { chatHistory: ChatHistoryState }) => state.chatHistory.histories[bookId],
    (messages): ChatMessage[] => messages ?? EMPTY_MESSAGES,
  )

export default chatHistorySlice.reducer
