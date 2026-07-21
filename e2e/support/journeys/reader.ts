import { expect, type Page } from '@playwright/test'

/**
 * The chapter reader.
 *
 * A chapter is shown one section at a time rather than as one scroll, and
 * `client/lib/split-sections.ts` guarantees at least two sections per
 * chapter, so "finish this chapter" means paging to the last section and
 * then taking the control that appears there. `finishChapter` does that
 * paging, which is why no journey should ever click Next in a loop itself.
 *
 * The section controls are named Previous and Next, and the control at the
 * end of a chapter is named Next Chapter or Finish Book. Every locator below
 * matches exactly, because a loose match on "Next" would also match "Next
 * Chapter" and page one section too far.
 */
export function reader(page: Page) {
  const nextSection = () => page.getByRole('button', { name: 'Next section', exact: true })
  const nextChapter = () => page.getByRole('button', { name: 'Next Chapter', exact: true })
  const finishBook = () => page.getByRole('button', { name: 'Finish Book', exact: true })

  // Scoped to the article, because the chapter tab strip above it holds a
  // "Chapter N" button per chapter and an unscoped match would find those
  // too. The article's own label is the one that says what is being read.
  const chapterLabel = () => page.getByRole('article').getByText(/^Chapter \d+$/)

  return {
    /** Resolves once a chapter is on screen. */
    async waitForChapter(): Promise<void> {
      await expect(chapterLabel()).toBeVisible()
    },

    /** The "Chapter N" indicator's number, which is what the reader believes it is showing. */
    async currentChapterNumber(): Promise<number> {
      return Number((await chapterLabel().innerText()).replace(/\D+/g, ''))
    },

    /** Pages forward through the chapter's sections until the end-of-chapter control appears. */
    async readToEndOfChapter(): Promise<void> {
      // Bounded rather than while(true), so a UI that stops advancing fails
      // as a clear assertion instead of hanging until the test timeout.
      for (let step = 0; step < 20; step++) {
        if (await nextChapter().isVisible() || await finishBook().isVisible()) return
        await nextSection().click()
      }
      throw new Error('reader: paged 20 sections without reaching the end of the chapter')
    },

    /**
     * Pages to the end of the chapter and takes the control that continues
     * past it, which opens the quiz rather than the next chapter. The quiz
     * and the feedback form stand between one chapter and the next by
     * design, and `quiz.ts` drives them.
     */
    async finishChapter(): Promise<void> {
      await this.readToEndOfChapter()
      if (await finishBook().isVisible()) {
        await finishBook().click()
        return
      }
      await nextChapter().click()
    },

    /**
     * Jumps straight to a chapter through the tab strip above the prose.
     * This is the reader's own navigation and skips the quiz, so it is what a
     * journey uses when the subject is reading rather than the adaptive loop.
     */
    async goToChapter(num: number): Promise<void> {
      await page.getByRole('button', { name: `Chapter ${num}`, exact: true }).click()
    },

    /** Returns to the library. */
    async backToLibrary(): Promise<void> {
      await page.getByRole('button', { name: 'Back to library' }).click()
    },

    /** Chapter prose, addressed by the text it contains rather than by its container's class. */
    prose(text: string | RegExp) {
      return page.getByText(text).first()
    },
  }
}
