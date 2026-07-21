import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { chapterMarker } from '../fixtures/chapter-stream.js'
import { buildReduxState, type ReduxStateFixture } from '../fixtures/redux-state.js'
import { TOC_BOOK_TITLE } from '../fixtures/toc-stream.js'
import { bookRepository, seedBook } from '../support/seed.js'

/**
 * Journey (g): the packaged app rehydrates where the reader left off.
 *
 * This is the only journey that runs the real Electron main process, and it
 * is deliberately the smallest thing worth running there. Fakes cannot be
 * injected into a packaged main process, so anything that would call a model
 * is out of reach by construction, which is why this journey seeds its
 * library rather than generating one.
 *
 * What IS only observable here is the rehydration path. In the browser
 * redux-persist writes to localStorage, and in Electron it writes through IPC
 * to a file the main process owns, so the file is a surface the web project
 * cannot reach at all. Two runs over the same seeded library, differing only
 * in `redux-state.json`. With a saved position the reader opens where the
 * reader was, and without one it falls back to a position derived from the
 * server's own progress record. Both are correct, and getting them backwards
 * is exactly the bug a smoke test should catch.
 *
 * Tagged `@electron` so the `electron` Playwright project selects it and the
 * `web` project excludes it with one flag, which is what keeps the Electron
 * binary out of every other CI job.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** How many chapters the seeded book records as read. The fallback position is derived from this. */
const CHAPTERS_READ = 3

/** Electron has a real window to open and a real server to start, so it gets longer than a browser page load. */
const BOOT_TIMEOUT_MS = 40_000

interface LaunchedApp {
  app: ElectronApplication
  page: Page
  dataDir: string
  bookId: string
}

/**
 * Seeds a data directory with one readable book and a `redux-state.json`
 * built from `fixture`, then launches the packaged app against it.
 */
async function launchWithState(fixture: (bookId: string) => ReduxStateFixture): Promise<LaunchedApp> {
  const dataDir = mkdtempSync(join(tmpdir(), 'tutor-e2e-electron-'))
  const book = await seedBook(dataDir, {
    status: 'reading',
    totalChapters: CHAPTERS_READ,
    generatedUpTo: CHAPTERS_READ,
    chaptersOnDisk: CHAPTERS_READ,
  })

  // The server-derived fallback reads the progress record rather than
  // generatedUpTo, so the record has to exist for the second run to have
  // anything to fall back to.
  const books = bookRepository(dataDir)
  for (let num = 1; num <= CHAPTERS_READ; num++) {
    await books.saveChapterProgress(book.id, num, { scroll: 1, completed: true, completedAt: new Date().toISOString() })
  }

  writeFileSync(join(dataDir, 'redux-state.json'), JSON.stringify(buildReduxState(fixture(book.id))))

  const app = await electron.launch({
    args: [REPO_ROOT],
    // A temp data directory, so the packaged app never opens the reader's
    // real library, and no provider key exists in it, so nothing this app
    // does can reach a live provider.
    env: { ...process.env, TUTOR_DATA_DIR: dataDir },
  })

  return { app, page: await app.firstWindow(), dataDir, bookId: book.id }
}

/** The reader's own "Chapter N" label, scoped past the chapter tab strip that repeats it. */
function chapterLabel(page: Page, num: number) {
  return page.getByRole('article').getByText(`Chapter ${num}`, { exact: true })
}

async function openTheSeededBook(page: Page): Promise<void> {
  await expect(page.getByRole('banner').getByRole('button', { name: 'New Book' })).toBeVisible({ timeout: BOOT_TIMEOUT_MS })
  await page.getByText(TOC_BOOK_TITLE, { exact: true }).first().click()
}

test.describe('@electron rehydration', () => {
  test('opens the reader at the position redux-state.json remembers', async () => {
    const { app, page, dataDir, bookId } = await launchWithState(id => ({
      position: { bookId: id, chapter: 0, section: 0 },
    }))

    try {
      await openTheSeededBook(page)
      // Chapter 0 was remembered, so the reader must land there and must NOT
      // take the server-derived fallback, which would be chapter 3.
      await expect(chapterLabel(page, 1)).toBeVisible({ timeout: BOOT_TIMEOUT_MS })
      await expect(page.getByText(chapterMarker(1)).first()).toBeVisible()
      expect(bookId).toBeTruthy()
    } finally {
      await app.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  test('falls back to the server-derived position when no saved position exists', async () => {
    const { app, page, dataDir } = await launchWithState(() => ({}))

    try {
      await openTheSeededBook(page)
      // Three chapters are recorded as read and nothing was remembered, so
      // `ReaderPage.tsx` derives the position from `chaptersRead - 1`.
      await expect(chapterLabel(page, CHAPTERS_READ)).toBeVisible({ timeout: BOOT_TIMEOUT_MS })
      await expect(page.getByText(chapterMarker(CHAPTERS_READ)).first()).toBeVisible()
    } finally {
      await app.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
