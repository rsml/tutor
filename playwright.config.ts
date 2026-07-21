import { defineConfig, devices } from '@playwright/test'

/**
 * The end-to-end journey suite. See `e2e/README.md` for how to run it and
 * how to add a journey.
 *
 * `retries: 0` is deliberate and is the most load-bearing line in this file.
 * The server runs in-process against fake adapters, the model is a scripted
 * object, and nothing in the suite touches a network, so there is no
 * legitimate source of nondeterminism left for a retry to paper over. A
 * retry here would convert a real bug into a green run. A journey that
 * flakes twice gets quarantined with `test.fixme` and an issue, never a
 * blanket retry.
 */
export default defineConfig({
  testDir: './e2e/journeys',

  // Builds the client bundle the fixture serves. Always, rather than only
  // when dist/ is missing, because a stale bundle would silently test
  // yesterday's client. Skippable with E2E_SKIP_BUILD for a fast re-run.
  globalSetup: './e2e/global-setup.ts',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,

  timeout: 60_000,
  expect: { timeout: 15_000 },

  // Each test boots a Fastify instance whose logger writes a JSON line per
  // request, which drowns the reporter. The trace holds the browser side of
  // a failure; set E2E_VERBOSE=1 to see the server side too.
  quiet: !process.env.E2E_VERBOSE,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list']],

  use: {
    trace: 'retain-on-failure',
    // baseURL is supplied per test by the `app` fixture in e2e/support/app.ts,
    // because each test binds its own ephemeral port.
  },

  projects: [
    {
      name: 'web',
      grepInvert: /@electron/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Launches the packaged main process, so it needs the Electron binary
      // and gets its own CI job. One flag excludes it everywhere else.
      name: 'electron',
      grep: /@electron/,
      // Serial. Two Electron apps launching at once each start their own
      // Fastify server and load the audiobook stack, and on a loaded machine
      // that turned a 6 second test into a 34 second one. There are two tests
      // here and there is nothing to gain from overlapping them.
      fullyParallel: false,
    },
  ],
})
