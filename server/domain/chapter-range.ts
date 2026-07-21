import * as store from '../services/book-store.js'

/**
 * Throws a 400 when num is outside 1..totalChapters, with the same message
 * and statusCode shape validateChapterNum below has always thrown.
 *
 * Pure and synchronous on purpose, no I/O, so there is no port to inject and
 * no fake or fs needed to test it. A caller fetches the book itself, through
 * ports.bookRepository, and passes totalChapters in here, rather than
 * handing this function a bookId to resolve on its own.
 */
export function assertChapterInRange(totalChapters: number, num: number): void {
  if (num < 1 || num > totalChapters) {
    const err = new Error(`Chapter ${num} out of range (1-${totalChapters})`)
    ;(err as Error & { statusCode?: number }).statusCode = 400
    throw err
  }
}

/**
 * The old shim-backed form. Kept only until server/routes/assessment.ts
 * moves onto assertChapterInRange above and reads the book through
 * ports.bookRepository itself, at which point this goes away together with
 * the book-store.js shim it depends on. Do not add new callers of this one;
 * use assertChapterInRange instead.
 */
export async function validateChapterNum(bookId: string, num: number): Promise<void> {
  const meta = await store.getBook(bookId)
  if (num < 1 || num > meta.totalChapters) {
    const err = new Error(`Chapter ${num} out of range (1-${meta.totalChapters})`)
    ;(err as Error & { statusCode?: number }).statusCode = 400
    throw err
  }
}
