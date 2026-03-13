import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ChatMessage } from '@src/hooks/useStreamingChat'

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

export const selectChatMessages = (bookId: string) =>
  (state: { chatHistory: ChatHistoryState }) => state.chatHistory.histories[bookId] ?? []

export default chatHistorySlice.reducer
