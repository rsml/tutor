/**
 * Throws a 400 when num is outside 1..totalChapters, with the same message
 * and statusCode shape server/services/validate-chapter-num.ts's I/O wrapper
 * throws.
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
