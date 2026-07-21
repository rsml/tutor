import { expect, type Page } from '@playwright/test'
import type { TutorApp } from '../app.js'
import { isChapterStreamFor } from '../default-script.js'
import type { ScriptedTextGeneration } from '../scripted-text-generation.js'
import { readBook, seedBook } from '../seed.js'
import { library } from './library.js'
import { reader } from './reader.js'
import { wizard } from './wizard.js'

/**
 * Journey (h) locks in that a scripted provider failure reaches the screen
 * intact.
 *
 * The regression this guards against is flattening, where a thrown error's
 * real message gets swallowed and replaced with generic boilerplate
 * somewhere between the AI port and the screen. A test that only checks
 * "some error appeared" cannot tell a real message from a fallback, so
 * every case here asserts the distinctive text is visible AND that the
 * surface's own generic fallback text is not. The negative half is the one
 * that actually catches the regression, since the positive half alone would
 * still pass if the app printed nothing but boilerplate.
 *
 * Two runners share one case shape. `runGenerationFailureCase` drives the
 * reader. It seeds a book that already has chapters and fails the next
 * one, landing on `GenerationPanel` (client/features/reader/components/GenerationPanel.tsx).
 * This is the surface Phase 7's per-error-class cases should extend once it
 * is reachable again, because it is the cleaner assertion. GenerationPanel
 * names its own fallback string verbatim, so the negative assertion has an
 * exact, quotable target, and useChapterGeneration.ts documents that the
 * message it receives is shown as-is with no fallback of its own in the
 * way.
 *
 * It is quarantined for now. `POST /api/books/:id/generate-next` never
 * delivers any SSE event to a real browser, success or failure, because
 * `pipeHubToSse` in server/routes/generation.ts attaches
 * `request.raw.on('close', ...)` and ends the reply from that handler. On
 * Node 16+, an IncomingMessage's `close` fires once the request stream
 * finishes reading, not only on client disconnect, so for a POST whose body
 * Fastify already consumed, `close` fires immediately and ends the reply
 * before generation writes a byte. Filed as issue #50. The
 * generation-failure.spec.ts test for this runner is `test.fixme` until
 * that lands. The runner itself stays intact and correct, so flipping it
 * back to `test` once fixed is a one-line change.
 *
 * `runWizardChapterOneFailureCase` drives the creation wizard instead,
 * failing chapter 1 so it lands on CreationView. It stays a second,
 * hand-written runner rather than a row in the same table, because it
 * drives an entirely different screen with entirely different navigation,
 * and the table's promise, that a new case is one object literal and no new
 * plumbing, only holds while every case in it shares one navigation path.
 * CreationView also has no dedicated fallback constant the way
 * GenerationPanel does. The message is interpolated directly (see
 * useChapterOneStream.ts), so the closest equivalent flattening for that
 * surface is the 'Unknown error' text both start-book.ts and
 * useChapterOneStream.ts fall back to when a thrown value is not an
 * `Error`, and that is what its negative assertion targets instead. This
 * runner is unaffected by issue #50, because `POST /api/books/:id/start`
 * answers through `openSseStream`, which writes and awaits inline in one
 * async handler and never attaches a close listener, so it is the surface
 * that proves journey (h)'s claim today.
 *
 * Both runners add their rule with `model.onStreamText`, which shadows the
 * default chapter-stream rule from `applyDefaultScript` without deleting
 * it, exactly as `e2e/support/default-script.ts` documents.
 */

export interface GenerationFailureCase {
  name: string
  /**
   * The value the scripted model throws when the chapter stream is pulled.
   * Any type survives to the caller unchanged, a typed error class
   * included, see `throwOnly` in `scripted-text-generation.ts`.
   */
  thrown: unknown
  /** What the reader must see on screen, checked as a visible substring (or pattern). */
  expected: string | RegExp
}

interface JourneyContext {
  page: Page
  app: TutorApp
  model: ScriptedTextGeneration
}

/** GenerationPanel's own words for "no message came through." A case fails here if the real message got lost and this boilerplate took its place. */
const GENERATION_PANEL_FALLBACK = 'An unexpected error occurred while generating this chapter.'

/** start-book.ts's and useChapterOneStream.ts's shared fallback for a thrown value that is not an `Error`. CreationView has no fallback string of its own to quote, so this is the nearest equivalent "the message got flattened" boilerplate for that surface. */
const WIZARD_UNKNOWN_ERROR_FALLBACK = 'Unknown error'

/**
 * Reader path. A book that already has two of its three fixture chapters
 * fails to generate the third, surfacing through GenerationPanel.
 *
 * Pages chapter 2 to its end and skips its quiz (not this journey's
 * subject), then submits feedback, the one reader control that calls
 * startGenerationStream and so the only path that reaches chapter 3's
 * stream. This is the surface Phase 7's per-error-class cases should
 * extend. Add an object to the CASES array in generation-failure.spec.ts,
 * and nothing here needs to change. Currently quarantined behind issue
 * #50, see the module doc above.
 */
export async function runGenerationFailureCase(
  { page, app, model }: JourneyContext,
  { name, thrown, expected }: GenerationFailureCase,
): Promise<void> {
  const book = await seedBook(app.dataDir, { generatedUpTo: 2 })

  model.onStreamText({
    name: `generation-failure (reader): ${name}`,
    match: isChapterStreamFor(3),
    respond: { throws: thrown },
  })

  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openBook(book.title)
  await reader(page).waitForChapter()
  await reader(page).goToChapter(2)
  await reader(page).finishChapter()

  // The chapter-2 quiz loads fine from the default script's own fixture and
  // is not this journey's subject, so skip it rather than answer it.
  await page.getByRole('button', { name: 'Skip' }).click()

  // Submitting feedback is the one control that calls startGenerationStream,
  // the only path in the reader that reaches chapter 3's stream.
  await page.getByRole('button', { name: 'Generate Next Chapter' }).click()

  await expect(page.getByRole('heading', { name: 'Generation failed' })).toBeVisible()
  await expect(page.getByText(expected)).toBeVisible()
  await expect(page.getByText(GENERATION_PANEL_FALLBACK)).not.toBeVisible()

  // The failed generation must not silently advance the book.
  // chapter-generation-stream.ts's catch block only ever updates its
  // in-memory GenerationState, never the persisted book (see runGeneration
  // there), so a failure here must leave generatedUpTo and status exactly
  // where seedBook put them.
  const persisted = await readBook(app.dataDir, book.id)
  expect(persisted.generatedUpTo).toBe(2)
  expect(persisted.status).toBe('reading')
}

/**
 * Wizard path. Chapter 1 fails during book creation, surfacing through
 * CreationView instead of GenerationPanel. See the module doc for why this
 * is a separate runner rather than a second row through the same table,
 * and for why it is the surface that proves journey (h)'s claim today.
 */
export async function runWizardChapterOneFailureCase(
  { page, app, model }: JourneyContext,
  { name, thrown, expected }: GenerationFailureCase,
): Promise<void> {
  model.onStreamText({
    name: `generation-failure (wizard): ${name}`,
    match: isChapterStreamFor(1),
    respond: { throws: thrown },
  })

  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openWizard()
  await wizard(page).submit({ topic: 'Tidal locking', details: 'Aim it at a physics graduate.' })
  await wizard(page).waitForTocApproval()
  await wizard(page).approveToc()

  await expect(page.getByText(expected)).toBeVisible()
  await expect(page.getByText(WIZARD_UNKNOWN_ERROR_FALLBACK)).not.toBeVisible()

  // start-book.ts sets status 'generating' before it streams chapter 1, and
  // its catch block only sends the error event. It never revisits that
  // status and never reaches the finalize step that would set status to
  // 'reading' and generatedUpTo to 1. So the book must be stuck exactly at
  // 'generating' with generatedUpTo still 0, not silently advanced as if
  // chapter 1 had succeeded, and not reverted to toc_review either.
  const books = (await app.fastify.inject({ method: 'GET', url: '/api/books' })).json() as Array<{ id: string }>
  expect(books).toHaveLength(1)
  const persisted = await readBook(app.dataDir, books[0].id)
  expect(persisted.generatedUpTo).toBe(0)
  expect(persisted.status).toBe('generating')
}
