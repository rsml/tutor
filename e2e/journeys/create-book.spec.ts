import type { Page } from '@playwright/test'
import { chapterMarker } from '../fixtures/chapter-stream.js'
import { TOC_BOOK_TITLE, TOC_CHAPTERS, TOC_REVISED_CHAPTERS } from '../fixtures/toc-stream.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { wizard } from '../support/journeys/wizard.js'
import { bookRepository, readBook } from '../support/seed.js'

/**
 * The revise-toc panel's own input and send control, addressed locally
 * rather than added to `wizard()` because `e2e/support/journeys/wizard.ts`
 * is owned by another concurrent phase-6 agent. Promote this into that file
 * if a later journey needs it too.
 */
function reviseTocPanel(page: Page) {
  return {
    /** Types a revision instruction and submits it. */
    async submit(feedback: string): Promise<void> {
      await page.getByPlaceholder('Change chapter 1 to be simpler...').fill(feedback)
      await page.getByRole('button', { name: 'Send revision' }).click()
    },
  }
}

/**
 * Journey (a), first half: the walking skeleton.
 *
 * This one test is doing more than it looks like. Passing it proves the
 * whole harness at once, that the built client is served from the same
 * origin as the API, that `client/api/http.ts` resolves its base to empty
 * and issues relative requests, that the server-sent-event stream reaches
 * the browser and reassembles, that the scripted model answers the
 * create-book call site by intent, and that everything wrote into a
 * throwaway data directory instead of the reader's real library.
 *
 * S3 extends this file through approval, chapter 1, and the reader.
 */
test('creates a book and streams the table of contents into the wizard', async ({ page, model, app }) => {
  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openWizard()

  await wizard(page).submit({ topic: 'Tidal locking', details: 'Aim it at a physics graduate.' })

  // Web-first assertions retry to a deadline, which is how this suite waits
  // for a stream to finish without ever sleeping.
  for (const chapter of TOC_CHAPTERS) {
    await expect(wizard(page).tocEntry(chapter.title)).toBeVisible()
  }
  await wizard(page).waitForTocApproval()

  // The prompt the server actually sent, read off the same object the server
  // called. This is what an in-process fake buys over a child process.
  expect(model.requests.streamText).toHaveLength(1)
  expect(model.requests.streamText[0].prompt).toContain('Tidal locking')
  expect(model.requests.streamText[0].prompt).toContain('Aim it at a physics graduate.')

  // And the book landed on disk, in the throwaway directory, with the title
  // parsed out of the fixture rather than the topic the reader typed.
  const books = await app.fastify.inject({ method: 'GET', url: '/api/books' })
  expect(books.statusCode).toBe(200)
  const library_ = books.json() as Array<{ id: string; title: string; status: string }>
  expect(library_).toHaveLength(1)
  expect(library_[0].title).toBe(TOC_BOOK_TITLE)
  expect(library_[0].status).toBe('toc_review')
})

/**
 * Journey (a), second half: revise the table of contents, approve it, and
 * land on chapter 1.
 *
 * Revising first is what makes the approval meaningful to test here — it
 * proves the book that gets started is the one on disk after the edit, not a
 * stale in-memory copy of the original streamed TOC. `default-script.ts`
 * points the revise-toc stream at `TOC_REVISED_CHAPTERS`, a fixture with
 * visibly different titles than `TOC_CHAPTERS`, so asserting those titles
 * render and persist actually exercises the revision rather than coincidence.
 */
test('revises the table of contents, persists it, and generates chapter 1 on approval', async ({ page, model, app }) => {
  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openWizard()
  await wizard(page).submit({ topic: 'Tidal locking', details: 'Aim it at a physics graduate.' })
  await wizard(page).waitForTocApproval()

  await wizard(page).openTocEditor()
  await reviseTocPanel(page).submit('Make every chapter title a single short, punchy phrase.')

  // The revised titles rendering is the stream having reassembled the new
  // fixture, the same way TOC_CHAPTERS rendering proves it in the first test.
  for (const chapter of TOC_REVISED_CHAPTERS) {
    await expect(wizard(page).tocEntry(chapter.title)).toBeVisible()
  }

  const booksRes = await app.fastify.inject({ method: 'GET', url: '/api/books' })
  const id = (booksRes.json() as Array<{ id: string }>)[0].id

  // Persistence, checked on disk rather than on screen: the revision wrote
  // through to toc.yml, not just into the streaming buffer the page renders.
  const toc = await bookRepository(app.dataDir).getToc(id)
  expect(toc.chapters.map(chapter => chapter.title)).toEqual(TOC_REVISED_CHAPTERS.map(chapter => chapter.title))

  await wizard(page).approveToc()

  await expect(page.getByText(chapterMarker(1)).first()).toBeVisible()

  const book = await readBook(app.dataDir, id)
  expect(book.generatedUpTo).toBe(1)
  expect(book.status).toBe('reading')

  // And the model path /start actually drives: a skill classification call
  // and a chapter-1 stream, not just the revise-toc stream from earlier.
  expect(model.requests.generateObject.some(
    req => (req.prompt ?? '').includes('classifying the learning content of a book'),
  )).toBe(true)
  expect(model.requests.streamText.some(
    req => (req.prompt ?? '').includes('This is Chapter 1 of'),
  )).toBe(true)
})
