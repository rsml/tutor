import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base } from '@playwright/test'
import type { FastifyInstance } from 'fastify'
import { applyDefaultScript } from './default-script.js'
import { createScriptedTextGeneration, type ScriptedTextGeneration } from './scripted-text-generation.js'

/**
 * The Playwright fixture that boots the real app for one test.
 *
 * The server runs in-process, not as a child process, and that is the whole
 * design. A journey needs to reach into the fake model mid-flight, to add a
 * failure rule or to read back the prompt the server actually sent, and a
 * child process would put a serialisation boundary in the way of both. In
 * process, `model` is the same object the running server is calling.
 *
 * Three properties fall out of the shape below.
 *
 * Single origin. `client/api/http.ts` leaves its base empty when
 * `window.electronAPI` is absent, so the built client issues relative
 * `/api/...` requests. Serving `dist/` from the same Fastify instance that
 * answers those requests means no proxy, no CORS, and no Electron stub. The
 * client under test is the real production bundle, unmodified.
 *
 * Isolation. `TUTOR_DATA_DIR` points at a temp directory created once per
 * worker, and the books directory inside it is removed before every test, so
 * a journey always starts from an empty library and never sees the real one.
 *
 * Zero live-provider traffic, structurally. The real key vault is never
 * built, because `keyVault` is overridden with an in-memory fake before
 * `createPorts` runs, and the two ports that read keys through the vault
 * take whichever vault won. The scripted model has no SDK import and throws
 * on any call nobody wrote a fixture for.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DIST_DIR = join(REPO_ROOT, 'dist')

export interface TutorApp {
  /** `http://127.0.0.1:<port>` for the instance serving this test. */
  origin: string
  /** The temp data directory this worker's books are written under. */
  dataDir: string
  /** Absolute path to one book's directory on disk, for filesystem assertions. */
  bookDir(bookId: string): string
  /** The running instance, for the rare journey that needs to close or inspect it. */
  fastify: FastifyInstance
}

interface WorkerFixtures {
  /** One temp data directory per worker, created before any server module is imported. */
  dataDir: string
}

interface TestFixtures {
  /** The scripted model this test's server is wired to. Add rules to it before the action that triggers a call. */
  model: ScriptedTextGeneration
  /** The booted app. Depend on this (or on `page`, which does) to get a server. */
  app: TutorApp
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  dataDir: [async ({}, use, workerInfo) => {
    const dir = mkdtempSync(join(tmpdir(), `tutor-e2e-w${workerInfo.workerIndex}-`))
    // Set before any server module is imported. Every adapter resolves the
    // directory through getDataDir() on each call, so this is belt and
    // braces rather than load bearing, but server/test/setup-env.ts makes
    // the same guarantee for the same reason and consistency is cheap.
    process.env.TUTOR_DATA_DIR = dir
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  }, { scope: 'worker' }],

  model: async ({}, use) => {
    const model = createScriptedTextGeneration()
    applyDefaultScript(model)
    await use(model)
  },

  app: async ({ dataDir, model }, use) => {
    if (!existsSync(join(DIST_DIR, 'index.html'))) {
      throw new Error(
        `No client build at ${DIST_DIR}. The e2e run builds it in e2e/global-setup.ts, so seeing this means that step was skipped or failed.`,
      )
    }

    // Every test starts from an empty library. Removing only books/ rather
    // than the whole worker directory leaves anything else the run wrote,
    // which matters for the audiobook journey's seeded binaries.
    await rm(join(dataDir, 'books'), { recursive: true, force: true })

    // Imported after TUTOR_DATA_DIR is set, and after the check above, so a
    // missing build fails with the message rather than with a static-plugin
    // error from deep inside Fastify.
    const [{ buildServer }, { createFakeKeyVault }, { createFakeSpeechSynthesis }, { createFakeAudioAssembly }, { createFakeImageGeneration }, fastifyStatic] = await Promise.all([
      import('@server/index.js'),
      import('@server/ports/key-vault.fake.js'),
      import('@server/ports/speech-synthesis.fake.js'),
      import('@server/ports/audio-assembly.fake.js'),
      import('@server/ports/image-generation.fake.js'),
      import('@fastify/static'),
    ])

    const fastify = await buildServer({
      textGeneration: model,
      // A key so the client's provider gate opens, on a vault that only
      // exists in memory. The real file vault is never constructed.
      keyVault: createFakeKeyVault({ anthropic: 'e2e-key' }),
      speechSynthesis: createFakeSpeechSynthesis(),
      audioAssembly: createFakeAudioAssembly(),
      imageGeneration: createFakeImageGeneration(),
    })

    // Test-only, and registered here rather than in the app because the app
    // is served by Electron from a file:// URL in production and has no use
    // for a static route. `buildServer` is used rather than `startServer`
    // because Fastify forbids registering a plugin after listen().
    await fastify.register(fastifyStatic.default, { root: DIST_DIR })
    await fastify.listen({ port: 0, host: '127.0.0.1' })

    const address = fastify.server.address()
    if (!address || typeof address === 'string') throw new Error('e2e server did not bind a TCP port')

    await use({
      origin: `http://127.0.0.1:${address.port}`,
      dataDir,
      bookDir: (bookId: string) => join(dataDir, 'books', bookId),
      fastify,
    })

    await fastify.close()
  },

  // Points every page in this test at the instance the fixture just booted.
  baseURL: async ({ app }, use) => {
    await use(app.origin)
  },
})

export const expect = test.expect
