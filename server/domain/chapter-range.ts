import * as store from '../services/book-store.js'

export async function validateChapterNum(bookId: string, num: number): Promise<void> {
  const meta = await store.getBook(bookId)
  if (num < 1 || num > meta.totalChapters) {
    const err = new Error(`Chapter ${num} out of range (1-${meta.totalChapters})`)
    ;(err as Error & { statusCode?: number }).statusCode = 400
    throw err
  }
}
