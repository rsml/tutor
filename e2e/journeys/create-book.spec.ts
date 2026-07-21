import { TOC_BOOK_TITLE, TOC_CHAPTERS } from '../fixtures/toc-stream.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { wizard } from '../support/journeys/wizard.js'

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
