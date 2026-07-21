import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { seedBook } from '../support/seed.js'

/**
 * Journey (d): exporting a finished book to EPUB from the library.
 *
 * The book is seeded complete, three chapters written against a
 * three-chapter table of contents, so the context menu's Export EPUB entry
 * is enabled immediately. Getting a book to that state through the UI is
 * the generation journeys' subject, not this one's.
 *
 * The export itself is deliberately not faked. Every other journey stubs its
 * AI port with the scripted model, but an EPUB export makes no AI call at
 * all, only markdown-to-HTML conversion and the real epub-gen-memory library
 * assembling a zip. Faking that library would only prove this test calls a
 * fake correctly. Running it for real is what proves the double-default
 * handling in server/adapters/epub-gen-export.ts, which exists specifically
 * for the Electron production build, still works end to end.
 *
 * The flow this journey rides: the click starts a background task (see
 * createExportEpub in server/services/export-epub.ts), the task's
 * `task_done` SSE event tells useBackgroundTaskEffects.ts to fetch the EPUB
 * and click a hidden anchor carrying a `download` attribute, and that
 * anchor click is what Playwright surfaces as a `download` event on the
 * page.
 */
test('exports a finished book to EPUB from the library context menu', async ({ page, app }) => {
  const book = await seedBook(app.dataDir, { generatedUpTo: 3, totalChapters: 3 })

  await page.goto('/')
  await library(page).waitForReady()

  // The card is a plain div with an onContextMenu handler and no role or
  // accessible name (see card()'s doc comment in library.ts), so
  // right-clicking its title is how a reader opens this menu too.
  await library(page).card(book.title).click({ button: 'right' })

  // The context menu is a plain div of buttons, not an ARIA menu, confirmed
  // against test-results/*/error-context.md on a real run: "Export EPUB"'s
  // accessible role is "button", never "menuitem".
  const exportItem = page.getByRole('button', { name: 'Export EPUB' })
  await expect(exportItem).toBeVisible()

  // The download only fires once the background task finishes, well after
  // this click resolves, but Promise.all still guards against a
  // pathological fast path firing it before the listener attaches.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportItem.click(),
  ])

  expect(download.suggestedFilename()).toMatch(/\.epub$/)

  const savedPath = join(app.dataDir, 'downloaded-book.epub')
  await download.saveAs(savedPath)
  const savedBytes = await readFile(savedPath)
  expect(savedBytes.length).toBeGreaterThan(0)
  // A real EPUB is a zip archive, so its first two bytes are the local file
  // header signature "PK". A stubbed or truncated export would still pass a
  // bare non-empty check, so this is the one that actually proves a real
  // archive came back.
  expect(savedBytes.subarray(0, 2).toString('latin1')).toBe('PK')

  // createExportEpub writes book.epub to disk (artifactStore.writeEpub)
  // before it ever calls backgroundTasks.succeed(), and succeed() is what
  // the client waits on before it fetches the file for download, so this
  // on-disk copy is guaranteed to already exist by the time the download
  // above resolved.
  const onDiskBytes = await readFile(join(app.bookDir(book.id), 'book.epub'))
  expect(onDiskBytes.length).toBeGreaterThan(0)

  // And the background task the export ran as reached done, the same
  // status the client's own auto-download waited on.
  const tasksResponse = await app.fastify.inject({ method: 'GET', url: '/api/tasks' })
  expect(tasksResponse.statusCode).toBe(200)
  const task = (tasksResponse.json() as Array<{ bookId: string; type: string; status: string }>)
    .find(t => t.bookId === book.id && t.type === 'generate-epub')
  expect(task?.status).toBe('done')
})
