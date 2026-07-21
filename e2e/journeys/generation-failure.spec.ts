import {
  runGenerationFailureCase,
  runWizardChapterOneFailureCase,
  type GenerationFailureCase,
} from '../support/journeys/generation-failure.js'
import { test } from '../support/app.js'

/**
 * Journey (h) locks in that a scripted provider failure reaches the reader
 * with its own message intact, not flattened into either surface's generic
 * fallback.
 *
 * See e2e/support/journeys/generation-failure.ts for what each runner
 * drives and why the wizard case is not folded into the same table. Phase 7
 * extends this suite with per-error-class cases by adding an object literal
 * to CASES below. The navigation and assertions in the support module do
 * not change.
 *
 * The reader-path cases below are `test.fixme`, not `test`, because issue
 * #50 means `POST /api/books/:id/generate-next` never delivers an SSE event
 * to a real browser at all, success or failure, so no assertion against
 * GenerationPanel can pass yet. The wizard case is unaffected and carries
 * journey (h)'s claim today. Flip `test.fixme` back to `test` once #50
 * lands.
 */

/**
 * A stand-in for whatever typed error class Phase 7's AI error taxonomy
 * introduces. The point of this case is only that a subclass survives
 * `throws` all the way to the screen, not this particular shape.
 */
class ScriptedProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptedProviderError'
  }
}

const CASES: GenerationFailureCase[] = [
  {
    name: 'a plain error with a distinctive message',
    thrown: new Error('the provider said something very specific'),
    expected: 'the provider said something very specific',
  },
  {
    name: 'a typed error subclass',
    thrown: new ScriptedProviderError('rate limited after 3 retries, provider returned HTTP 529'),
    expected: /rate limited after 3 retries, provider returned HTTP 529/,
  },
]

for (const failureCase of CASES) {
  // Quarantined behind issue #50 (pipeHubToSse ends /generate-next's SSE
  // reply before any event is delivered). Not run until that lands.
  test.fixme(`chapter generation failure reaches the reader intact: ${failureCase.name}`, async ({ page, app, model }) => {
    await runGenerationFailureCase({ page, app, model }, failureCase)
  })
}

// Every case runs through the wizard, the typed subclass included. That case
// is the one Phase 7 cares about most, because its error taxonomy is exactly
// a set of typed subclasses, and leaving it to run only on the quarantined
// reader path would have meant this phase never actually demonstrated that a
// subclass reaches the screen with its message intact.
for (const failureCase of CASES) {
  test(`chapter 1 generation failure reaches the creation wizard intact: ${failureCase.name}`, async ({ page, app, model }) => {
    await runWizardChapterOneFailureCase({ page, app, model }, failureCase)
  })
}
