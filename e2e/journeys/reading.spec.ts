import { chapterMarker } from '../fixtures/chapter-stream.js'
import { TOC_BOOK_TITLE } from '../fixtures/toc-stream.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { reader } from '../support/journeys/reader.js'
import { seedBook } from '../support/seed.js'

/**
 * Journey (a), second half: a book on disk opens and reads.
 *
 * This starts from a seeded book rather than from the wizard, deliberately.
 * Creating a book is `create-book.spec.ts`'s subject, and making every other
 * journey drive the whole wizard first would mean one wizard regression
 * failed the entire suite instead of the one journey that is actually about
 * the wizard. Seeding also gives this journey a two-chapter book, which is
 * what it needs to page from one chapter to the next.
 *
 * Navigation here goes through the reader's own chapter tab strip rather
 * than through the end-of-chapter control, because that control opens the
 * quiz. The chapter to quiz to feedback to next chapter loop is journey (b)
 * and has its own file.
 */
test('opens a seeded book in the reader and pages from one chapter to the next', async ({ page, app }) => {
  await seedBook(app.dataDir, { generatedUpTo: 2 })

  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openBook(TOC_BOOK_TITLE)

  await reader(page).waitForChapter()
  await expect(reader(page).prose(chapterMarker(1))).toBeVisible()
  expect(await reader(page).currentChapterNumber()).toBe(1)

  await reader(page).goToChapter(2)

  await expect(reader(page).prose(chapterMarker(2))).toBeVisible()
  expect(await reader(page).currentChapterNumber()).toBe(2)
})
