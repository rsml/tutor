import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { bookRepository, readBook, seedBook } from '../support/seed.js'

/**
 * Journey (e): library CRUD and search.
 *
 * Every mutation here asserts twice, once on what the reader sees and once
 * on the YAML the fixture wrote. The two can drift apart in either
 * direction: a card can show a change that a failed request never actually
 * persisted, or the server can write a change the grid fails to re-render
 * because `fetchBooks()` didn't run. Checking only the screen would miss the
 * first, checking only disk would miss the second, so both are asserted for
 * every operation below.
 *
 * Split into one `test` per operation rather than one long scenario, so a
 * failure names the operation that broke rather than an assertion three
 * steps into an unrelated one.
 */

test('rename persists across reload', async ({ page, app }) => {
  const book = await seedBook(app.dataDir, { title: 'Rename Me' })

  await page.goto('/')
  await library(page).waitForReady()

  await library(page).card('Rename Me').click({ button: 'right' })
  await page.getByRole('button', { name: 'Rename' }).click()

  const dialog = page.getByRole('dialog', { name: 'Rename Book' })
  // The Title field's <label> is plain text, not associated with its <input>
  // via htmlFor/id, so the input has no accessible name and getByLabel
  // cannot find it. Title is the first of the dialog's two textboxes and
  // Subtitle the second, so position is the only way in until that gap is
  // fixed on the component.
  await dialog.getByRole('textbox').first().fill('Renamed Title Sticks')
  await dialog.getByRole('button', { name: 'OK' }).click()

  await expect(library(page).card('Renamed Title Sticks')).toBeVisible()

  await page.reload()
  await library(page).waitForReady()
  await expect(library(page).card('Renamed Title Sticks')).toBeVisible()

  const onDisk = await readBook(app.dataDir, book.id)
  expect(onDisk.title).toBe('Renamed Title Sticks')
})

test('tag add shows in the filter surface', async ({ page, app }) => {
  const book = await seedBook(app.dataDir, { title: 'Tag Book' })

  await page.goto('/')
  await library(page).waitForReady()

  await library(page).card('Tag Book').click({ button: 'right' })
  await page.getByRole('button', { name: 'Edit Tags' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edit Tags' })
  const tagInput = dialog.getByPlaceholder('Type a tag and press Enter')
  await tagInput.fill('astrophysics')
  await tagInput.press('Enter')
  await dialog.getByRole('button', { name: 'Save' }).click()

  // The filter popover is the library's one surface for browsing tags across
  // the whole shelf, as opposed to the active-filter chips row, which only
  // shows a tag once it has been picked as a filter.
  await page.getByRole('button', { name: 'Filter' }).click()
  await expect(page.getByRole('button', { name: 'astrophysics', exact: true })).toBeVisible()

  const onDisk = await readBook(app.dataDir, book.id)
  expect(onDisk.tags).toContain('astrophysics')
})

test('search filters the grid by title', async ({ page, app }) => {
  await seedBook(app.dataDir, { title: 'Quantum Tunneling' })
  await seedBook(app.dataDir, { title: 'Renaissance Painting' })

  await page.goto('/')
  await library(page).waitForReady()

  await expect(library(page).card('Quantum Tunneling')).toBeVisible()
  await expect(library(page).card('Renaissance Painting')).toBeVisible()

  // The search box only mounts once expanded, and its own toggle is an
  // icon-only button with no aria-label (see report), so this reaches it
  // through the documented Cmd/Ctrl+F shortcut instead of that gap.
  await page.keyboard.press('ControlOrMeta+f')
  await page.getByPlaceholder('Search books...').fill('Quantum')

  await expect(library(page).card('Quantum Tunneling')).toBeVisible()
  await expect(library(page).card('Renaissance Painting')).not.toBeVisible()
})

test('delete removes the book from disk', async ({ page, app }) => {
  const book = await seedBook(app.dataDir, { title: 'Doomed Book' })

  await page.goto('/')
  await library(page).waitForReady()

  await library(page).card('Doomed Book').click({ button: 'right' })
  await page.getByRole('button', { name: 'Delete' }).click()

  // Delete opens an in-app confirmation dialog that requires typing "delete",
  // not a native window.confirm, so no dialog auto-accept handler is needed.
  const dialog = page.getByRole('dialog', { name: 'Delete Book' })
  await dialog.getByRole('textbox').fill('delete')
  await dialog.getByRole('button', { name: 'OK' }).click()

  await expect(library(page).card('Doomed Book')).not.toBeVisible()

  const remaining = await bookRepository(app.dataDir).listBooks()
  expect(remaining.map(b => b.id)).not.toContain(book.id)
})
