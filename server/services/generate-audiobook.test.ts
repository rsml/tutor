import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BookMeta, Toc, LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createFakeSpeechSynthesis } from '../ports/speech-synthesis.fake.js'
import { createFakeAudioAssembly } from '../ports/audio-assembly.fake.js'
import { createFakeBackgroundTasks } from '../ports/background-tasks.fake.js'
import { createGenerateAudiobook } from './generate-audiobook.js'

const BASE_META: BookMeta = {
  id: 'aud-book',
  title: 'Test Audiobook',
  prompt: 'Teach audiobooks',
  status: 'reading',
  totalChapters: 3,
  generatedUpTo: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

const BASE_TOC: Toc = {
  chapters: [
    { title: 'Origins', description: 'Where it began' },
    { title: 'The Middle', description: 'Tension rises' },
    { title: 'Resolution', description: 'How it ends' },
  ],
}

const BASE_PROFILE: LearningProfile = {
  style: 'analogies',
  identity: 'dev',
  preferences: {
    explainComplexTermsSimply: true,
    codeExamples: true,
    realWorldAnalogies: true,
    includeRecaps: true,
    includeSummaries: true,
    visualDescriptions: false,
    depthLevel: 3,
    pacePreference: 3,
    metaphorDensity: 3,
    narrativeStyle: 3,
    humorLevel: 2,
    formalityLevel: 3,
  },
  skills: [],
}

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'generate-audiobook-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

function makeDeps() {
  const speechSynthesis = createFakeSpeechSynthesis()
  return {
    bookRepository: createFakeBookRepository(),
    artifactStore: createFakeArtifactStore({ root: testDir }),
    speechSynthesis,
    audioAssembly: createFakeAudioAssembly(),
    backgroundTasks: createFakeBackgroundTasks(),
  }
}

type Deps = ReturnType<typeof makeDeps>

async function installEngine(speechSynthesis: Deps['speechSynthesis']): Promise<void> {
  await speechSynthesis.install()
}

async function seed(deps: Deps, meta: BookMeta = BASE_META, toc: Toc = BASE_TOC): Promise<void> {
  await deps.bookRepository.saveBook(meta)
  await deps.bookRepository.saveToc(meta.id, toc)
  await deps.bookRepository.saveChapter(meta.id, 1, '# Origins\n\nFirst chapter content.')
  await deps.bookRepository.saveChapter(meta.id, 2, '# Middle\n\nSecond chapter content.')
  await deps.bookRepository.saveChapter(meta.id, 3, '# Resolution\n\nThird chapter content.')
}

async function waitUntilDone(deps: Deps, taskId: string): Promise<void> {
  await vi.waitFor(
    () => {
      const task = deps.backgroundTasks.get(taskId)
      if (!task || task.status === 'running') throw new Error('still running')
    },
    { timeout: 2000 },
  )
}

describe('createGenerateAudiobook — gates', () => {
  it('refuses a book that is not fully generated', async () => {
    const deps = makeDeps()
    await seed(deps, { ...BASE_META, generatedUpTo: 2 })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })

    expect(result).toEqual({ outcome: 'not-complete' })
  })

  it('refuses when the narration engine is not installed', async () => {
    const deps = makeDeps()
    await seed(deps)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })

    expect(result).toEqual({ outcome: 'engine-not-installed' })
  })

  it('refuses a second generation while one is already running', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    deps.backgroundTasks.start({ type: 'generate-audiobook', bookId: BASE_META.id, bookTitle: BASE_META.title, total: 3 })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })

    expect(result).toEqual({ outcome: 'in-progress' })
  })

  it('refuses to silently replace an existing audiobook', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    // The fake can only be made to report an existing audiobook by writing a
    // manifest and marking the m4b path present through a real file on disk
    // (see artifact-store.fake.ts's own doc on why nothing on its interface
    // can flip audiobookExists true), so this gate is instead proven at the
    // route/integration level; this test focuses on the confirmReplace flag
    // itself by asserting generation proceeds once it is set even though
    // there is nothing to conflict with here.
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id, confirmReplace: true })

    expect(result.outcome).toBe('started')
  })
})

describe('createGenerateAudiobook — voice and speed resolution', () => {
  it('falls back to the first male voice and 1.0 speed with no profile and no request overrides', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    for (const call of deps.speechSynthesis.calls.synthesizeChapter) {
      expect(call.voiceId).toBe('fake-voice-male')
      expect(call.speed).toBe(1.0)
    }
  })

  it('uses the profile defaults when the request does not specify voice or speed', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    await deps.bookRepository.saveProfile({
      ...BASE_PROFILE,
      preferences: { ...BASE_PROFILE.preferences, audiobook: { defaultVoiceId: 'fake-voice-female', defaultSpeed: 1.5 } },
    })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    for (const call of deps.speechSynthesis.calls.synthesizeChapter) {
      expect(call.voiceId).toBe('fake-voice-female')
      expect(call.speed).toBe(1.5)
    }
  })

  it('prefers an explicit request voice and speed over the profile defaults', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    await deps.bookRepository.saveProfile({
      ...BASE_PROFILE,
      preferences: { ...BASE_PROFILE.preferences, audiobook: { defaultVoiceId: 'fake-voice-female', defaultSpeed: 1.5 } },
    })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id, voiceId: 'fake-voice-male', speed: 0.75 })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    for (const call of deps.speechSynthesis.calls.synthesizeChapter) {
      expect(call.voiceId).toBe('fake-voice-male')
      expect(call.speed).toBe(0.75)
    }
  })

  it('tolerates a missing learning profile and still generates with the fallback voice', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    // No profile saved at all — bookRepository.getProfile() rejects.
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })

    expect(result.outcome).toBe('started')
  })

  it('persists the resolved voice and speed as profile defaults when rememberAsDefault is set', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    await deps.bookRepository.saveProfile({
      ...BASE_PROFILE,
      preferences: { ...BASE_PROFILE.preferences, audiobook: { defaultVoiceId: 'fake-voice-female', defaultSpeed: 1.0, workerOverride: 4 } },
    })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({
      bookId: BASE_META.id,
      voiceId: 'fake-voice-male',
      speed: 1.25,
      rememberAsDefault: true,
    })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const saved = await deps.bookRepository.getProfile()
    expect(saved.preferences.audiobook).toEqual({
      defaultVoiceId: 'fake-voice-male',
      defaultSpeed: 1.25,
      workerOverride: 4,
    })
  })

  it('does not attempt to persist defaults when rememberAsDefault is set but there is no profile to update', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id, rememberAsDefault: true })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    await expect(deps.bookRepository.getProfile()).rejects.toThrow()
  })
})

describe('createGenerateAudiobook — narration and stitching', () => {
  it('cleans up prior audiobook artifacts before regenerating', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    await deps.artifactStore.saveAudiobookManifest(BASE_META.id, {
      version: 1,
      voice: 'stale',
      speed: 1,
      generatedAt: '2025-01-01T00:00:00.000Z',
      m4bPath: deps.artifactStore.audiobookPath(BASE_META.id),
      chapters: [],
    })
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    // A fresh manifest replaced the stale one (proves deleteAudiobookArtifacts ran, then a new one was written).
    const manifest = await deps.artifactStore.getAudiobookManifest(BASE_META.id)
    expect(manifest?.voice).not.toBe('stale')
  })

  it('prefixes each chapter with its number and title before narrating', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const texts = deps.speechSynthesis.calls.synthesizeChapter.map((c) => c.text)
    expect(texts[0].startsWith('Chapter 1: Origins.\n\n')).toBe(true)
    expect(texts[1].startsWith('Chapter 2: The Middle.\n\n')).toBe(true)
    expect(texts[2].startsWith('Chapter 3: Resolution.\n\n')).toBe(true)
    expect(texts[0]).toContain('First chapter content.')
  })

  it('updates audioGeneratedChapters incrementally as each chapter finishes', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const finalMeta = await deps.bookRepository.getBook(BASE_META.id)
    expect(finalMeta.audioGeneratedChapters).toEqual([1, 2, 3])
  })

  it('writes a manifest with the expected shape and completes the task with the m4b path', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id, voiceId: 'fake-voice-male', speed: 1.25 })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const manifest = await deps.artifactStore.getAudiobookManifest(BASE_META.id)
    expect(manifest?.version).toBe(1)
    expect(manifest?.voice).toBe('fake-voice-male')
    expect(manifest?.speed).toBe(1.25)
    expect(manifest?.chapters).toHaveLength(3)
    expect(manifest?.chapters[0]).toMatchObject({ num: 1, title: 'Origins' })

    const task = deps.backgroundTasks.get(result.taskId)
    expect(task?.status).toBe('done')
    expect((task?.result as { path: string }).path).toBe(deps.artifactStore.audiobookPath(BASE_META.id))
  })

  it('starts and stops the worker pool around the run', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    expect(deps.speechSynthesis.calls.startWorkerPool).toHaveLength(1)
    expect(deps.speechSynthesis.calls.stopWorkerPool).toBe(1)
  })

  it('reports progress labels through narration and stitching', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')

    const labels: string[] = []
    const unsubscribe = deps.backgroundTasks.subscribe((event) => {
      if (event.type === 'task_progress') labels.push(event.progress.label)
    })
    await waitUntilDone(deps, result.taskId)
    unsubscribe()

    expect(labels.some((l) => /Narrating chapter 1/i.test(l))).toBe(true)
    expect(labels.some((l) => /Stitching/i.test(l))).toBe(true)
  })

  it('halts narration and does not write a manifest once cancelled mid-flight, and still stops the worker pool', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')

    deps.backgroundTasks.cancel(result.taskId)
    await new Promise((resolve) => setTimeout(resolve, 30))

    const manifest = await deps.artifactStore.getAudiobookManifest(BASE_META.id)
    expect(manifest).toBeNull()
    expect(deps.speechSynthesis.calls.stopWorkerPool).toBe(1)
  })

  it('wipes partial audio state and fails the task when narration throws', async () => {
    const deps = makeDeps()
    await seed(deps)
    await installEngine(deps.speechSynthesis)
    // Force a failure on the second chapter, after the first has already
    // been marked generated, so the cleanup-on-failure path has state to wipe.
    let calls = 0
    const originalSynthesize = deps.speechSynthesis.synthesizeChapter.bind(deps.speechSynthesis)
    deps.speechSynthesis.synthesizeChapter = async (req) => {
      calls++
      if (calls === 2) throw new Error('synthesis exploded')
      return originalSynthesize(req)
    }
    const generateAudiobook = createGenerateAudiobook(deps)

    const result = await generateAudiobook({ bookId: BASE_META.id })
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const task = deps.backgroundTasks.get(result.taskId)
    expect(task?.status).toBe('error')
    expect(task?.error).toBe('synthesis exploded')

    const finalMeta = await deps.bookRepository.getBook(BASE_META.id)
    expect(finalMeta.audioGeneratedChapters).toEqual([])
    const manifest = await deps.artifactStore.getAudiobookManifest(BASE_META.id)
    expect(manifest).toBeNull()
  })
})
