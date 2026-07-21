import {
  runGenerationFailureCase,
  runWizardChapterOneFailureCase,
  type GenerationFailureCase,
} from '../support/journeys/generation-failure.js'
import { test } from '../support/app.js'
import { TextGenerationError } from '@server/ports/text-generation.js'

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
 * The reader-path cases below were quarantined with `test.fixme` while
 * issue #50 meant `POST /api/books/:id/generate-next` never delivered an SSE
 * event to a real browser at all, success or failure, so no assertion
 * against GenerationPanel could pass. Phase 7 fixed that, the listener now
 * watches the response rather than the request, so they run.
 */

/**
 * A stand-in kept from before Phase 7's taxonomy existed. It still earns its
 * place: it proves an arbitrary subclass survives `throws` all the way to
 * the screen, which is a weaker and more general claim than the
 * TextGenerationError cases below make.
 */
class ScriptedProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptedProviderError'
  }
}

/**
 * One case per error class Phase 7's taxonomy can produce, built with the
 * real `TextGenerationError` rather than a stand-in. `reason` is the
 * class's `message`, and the SSE error event carries exactly that, so what
 * the user reads is what the adapter decided.
 *
 * The three chosen are the ones whose handling genuinely differs.
 * `auth-failed` never retries and routes the reader to the missing-key
 * dialog, `rate-limited` retries up to four times, and `content-refused`
 * never retries because retrying a refusal just earns another refusal.
 */
const TAXONOMY_CASES: GenerationFailureCase[] = [
  {
    name: 'an auth-failed TextGenerationError',
    thrown: new TextGenerationError('auth-failed', 'No API key configured for provider: anthropic', false),
    expected: /No API key configured for provider: anthropic/,
  },
  {
    name: 'a rate-limited TextGenerationError',
    thrown: new TextGenerationError('rate-limited', 'The provider is rate limiting this key. Try again shortly.', true),
    expected: /rate limiting this key/,
  },
  {
    name: 'a content-refused TextGenerationError',
    thrown: new TextGenerationError('content-refused', 'The provider declined to generate this content.', false),
    expected: /declined to generate this content/,
  },
]

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
  ...TAXONOMY_CASES,
]

for (const failureCase of CASES) {
  test(`chapter generation failure reaches the reader intact: ${failureCase.name}`, async ({ page, app, model }) => {
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
