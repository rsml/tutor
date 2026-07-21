import { TOC_BOOK_TITLE, TOC_CHAPTERS } from '../fixtures/toc-stream.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { reader } from '../support/journeys/reader.js'
import { audiobook } from '../support/journeys/audiobook.js'
import { seedBook } from '../support/seed.js'

/**
 * This is journey (f). It covers the audiobook narration engine's install
 * gate, and the happy path once that engine is already installed.
 *
 * Both halves seed a fully generated book, because "Generate audiobook" (the
 * library's book context menu, see support/journeys/audiobook.ts) renders
 * disabled until generatedUpTo === totalChapters.
 *
 * Neither half ever performs a real install. The first half never installs
 * anything at all, and asserts the gate that appears in its absence. The
 * second half flips the fake speechSynthesis port's installed state through
 * the server's own route, not through the UI's Download button, for reasons
 * explained on that test.
 */

test('blocks audiobook generation behind a missing-components install gate', async ({ page, app }) => {
  await seedBook(app.dataDir, { generatedUpTo: TOC_CHAPTERS.length })

  await page.goto('/')
  await library(page).waitForReady()
  await audiobook(page).openBookMenu(TOC_BOOK_TITLE)
  await audiobook(page).generateAudiobookMenuItem().click()

  // Nothing in this process has installed the model or ffmpeg (the fixture
  // wipes books/ per test and never seeds either), so the fake
  // speechSynthesis port reports both missing and the gate opens instead of
  // starting generation.
  const gate = audiobook(page).downloadGateDialog()
  await expect(gate).toBeVisible()
  await expect(gate.getByText('Kokoro')).toBeVisible()
  await expect(gate.getByText('FFmpeg')).toBeVisible()

  // The button itself reports a size, which is the proof components are
  // actually reported missing rather than the dialog just opening with
  // placeholder copy.
  await expect(audiobook(page).downloadGateButton()).toBeVisible()

  // NEVER CLICK THIS BUTTON, and never add a `.click()` on downloadGateButton
  // anywhere in this file. In the real app this button downloads the Kokoro
  // model and an ffmpeg binary, on the order of 195 MB combined, from
  // huggingface and evermeet.cx over the public internet (see
  // server/services/audiobook-installer.ts, KOKORO_MODEL_SIZE_BYTES and
  // FFMPEG_SIZE_BYTES). This suite's fixture fakes out speechSynthesis
  // (e2e/support/app.ts), so this test process would not actually reach the
  // network, but the rule holds regardless of what happens to back the
  // button today. This test's job is to prove the gate appears, never to
  // press the control that starts a real installation.
})

test('generates chapter audio through the fake engine once installed and shows the listen control', async ({ page, app }) => {
  // Flips the fake speechSynthesis port's installed state directly through
  // the server, the same operation server/services/generate-audiobook.test.ts
  // performs by calling speechSynthesis.install() on the fake object
  // directly (see installEngine() in that file). fastify.inject() runs the
  // real route handler in-process with no socket involved, the same
  // technique create-book.spec.ts already uses to read /api/books directly.
  //
  // Filesystem seeding does not work for this. server/composition-root.ts's
  // createPorts() spreads its `overrides` object after building every
  // default adapter, so the override e2e/support/app.ts passes,
  // createFakeSpeechSynthesis(), replaces ports.speechSynthesis outright.
  // Every audiobook route calls only ports.speechSynthesis, never
  // server/services/audiobook-installer.ts directly (routes/audiobook.ts's
  // /api/audiobook/status handler, for one, calls
  // ports.speechSynthesis.isInstalled() and .missingComponents()). The
  // fake's isInstalled() is two in-memory booleans that only flip inside its
  // own install() (server/ports/speech-synthesis.fake.ts), and that file's
  // own doc comment says it "never touches the real filesystem". So writing
  // bin/ffmpeg or a models/kokoro/**.onnx file under app.dataDir, the paths
  // server/services/audiobook-installer.ts checks, would be inert here. No
  // code path in this process ever reads them.
  //
  // This is not the gate's Download button from the test above. It is an
  // in-process request the test driver makes before any page exists, so
  // there is no download control on screen for it to stand in for. The
  // fake's install() only flips those two booleans in memory. It does not
  // write to the filesystem, spawn a child process, or make a network call.
  await app.fastify.inject({ method: 'POST', url: '/api/audiobook/install' })
  await expect.poll(async () => {
    const status = await app.fastify.inject({ method: 'GET', url: '/api/audiobook/status' })
    return (status.json() as { installed: boolean }).installed
  }).toBe(true)

  await seedBook(app.dataDir, { generatedUpTo: TOC_CHAPTERS.length })

  await page.goto('/')
  await library(page).waitForReady()
  await audiobook(page).openBookMenu(TOC_BOOK_TITLE)
  await audiobook(page).generateAudiobookMenuItem().click()

  // Engine already installed, so the library goes straight to the voice
  // picker instead of the download gate.
  await audiobook(page).startGenerationButton().click()

  await library(page).openBook(TOC_BOOK_TITLE)
  await reader(page).waitForChapter()

  // The fake speechSynthesis and fake audioAssembly (both wired in
  // e2e/support/app.ts) narrate and stitch in memory with no real timers, so
  // generation has typically already finished by the time the reader mounts.
  // This is still a web-first assertion rather than an assumption. It
  // retries regardless, covering the rare case where it is still catching
  // up.
  await expect(audiobook(page).listenButton()).toBeVisible()
  await audiobook(page).listenButton().click()
  await expect(audiobook(page).closePlayerButton()).toBeVisible()
})
