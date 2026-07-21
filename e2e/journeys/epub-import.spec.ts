import { fileURLToPath } from 'node:url'
import { SAMPLE_BOOK_CHAPTERS, SAMPLE_BOOK_TITLE } from '../fixtures/sample-book.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { bookRepository } from '../support/seed.js'

/**
 * Journey (c): importing an EPUB previews it, then lands it in the library.
 *
 * This journey never touches the scripted model. Import has no AI step at
 * all (see server/services/import-book.ts), so there is nothing to script;
 * what it exercises instead is the real epub2 parser
 * (server/adapters/epub2-import.ts) against a real file, since
 * e2e/support/app.ts deliberately never overrides `epubImport`.
 * sample-book.epub, built by scripts/build-e2e-epub-fixture.ts from the
 * constants in ../fixtures/sample-book.ts, is that real file.
 */
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/sample-book.epub', import.meta.url))

test('imports an EPUB, previews it, and lands it in the library', async ({ page, app }) => {
  await page.goto('/')
  await library(page).waitForReady()

  // The file-chooser event needs no CSS selector. The visible control is an
  // accessibly-named button whose click handler calls .click() on a hidden
  // <input type="file">, which is what actually opens the native chooser
  // Playwright intercepts here.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import', exact: true }).click(),
  ])
  await chooser.setFiles(FIXTURE_PATH)

  // The preview dialog, scoped by its own accessible name (wired up by its
  // DialogTitle) so its "Import" confirm button can never collide with the
  // toolbar's "Import" trigger, which stays mounted behind it.
  const dialog = page.getByRole('dialog', { name: 'Import EPUB' })
  await expect(dialog.getByRole('heading', { name: SAMPLE_BOOK_TITLE, exact: true })).toBeVisible()
  await expect(dialog.getByText(`${SAMPLE_BOOK_CHAPTERS.length} chapters`, { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'Import', exact: true }).click()

  // The dialog only closes once confirming has round-tripped to the server and
  // back (LibraryPage's handleImportConfirm closes it after confirmEpubImport
  // resolves, and leaves it open on failure), so waiting for it to disappear is
  // what ties the rest of this test to the import actually finishing rather than
  // to the click having merely been dispatched. It also matters for the very
  // next locator: while the dialog is still open, its own preview heading is a
  // second, exact-text match for library(page).card(), which would otherwise
  // report success on a dialog that never actually confirmed anything.
  await expect(dialog).toBeHidden()

  // Back in the library, the imported book is on screen and, independently, on disk.
  await expect(library(page).card(SAMPLE_BOOK_TITLE)).toBeVisible()

  const books = await bookRepository(app.dataDir).listBooks()
  expect(books.map(b => b.title)).toContain(SAMPLE_BOOK_TITLE)
})
