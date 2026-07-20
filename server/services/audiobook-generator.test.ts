import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BookMeta, Toc, LearningProfile } from '../schemas.js'
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml'

// data-dir mock — every test gets its own temp dir.
let testDir: string
vi.mock('@shared/node/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

// Hoisted shared mocks — vi.hoisted runs before vi.mock factories so the same
// fn instances are available in factories AND in tests for assertions.
const mocks = vi.hoisted(() => {
  return {
    synthesizeChapter: vi.fn<
      (text: string, voiceId: string, speed: number, outPath: string, signal?: AbortSignal) => Promise<void>
    >(),
    startWorkerPool: vi.fn<(n: number) => Promise<void>>(),
    stopWorkerPool: vi.fn<() => Promise<void>>(),
    getRecommendedWorkerCount: vi.fn<(override?: number) => number>(),
    execFile: vi.fn<
      (
        file: string,
        args: string[],
        opts: { signal: AbortSignal; maxBuffer?: number },
        cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
      ) => void
    >(),
    stripMarkdownForNarration: vi.fn<(md: string) => string>(),
    updateProgress: vi.fn(),
    completeTask: vi.fn(),
  }
})

vi.mock('./kokoro-service.js', () => ({
  synthesizeChapter: mocks.synthesizeChapter,
  startWorkerPool: mocks.startWorkerPool,
  stopWorkerPool: mocks.stopWorkerPool,
  getRecommendedWorkerCount: mocks.getRecommendedWorkerCount,
}))

vi.mock('./audiobook-installer.js', () => ({
  getFfmpegPath: () => '/usr/bin/fake-ffmpeg',
}))

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    execFile: mocks.execFile as unknown as typeof actual.execFile,
  }
})

vi.mock('./markdown-to-narration.js', () => ({
  stripMarkdownForNarration: (md: string) => mocks.stripMarkdownForNarration(md),
}))

vi.mock('./task-manager.js', async () => {
  const actual = await vi.importActual<typeof import('./task-manager.js')>('./task-manager.js')
  return {
    ...actual,
    updateProgress: (...args: Parameters<typeof actual.updateProgress>) => {
      mocks.updateProgress(...args)
      return actual.updateProgress(...args)
    },
    completeTask: (...args: Parameters<typeof actual.completeTask>) => {
      mocks.completeTask(...args)
      return actual.completeTask(...args)
    },
  }
})

// Import SUT (and helpers) AFTER mocks are registered.
import * as store from './book-store.js'
import * as taskManager from './task-manager.js'
import { generateAudiobook } from './audiobook-generator.js'

// Pull the REAL strip implementation via importActual so the spy can delegate
// to it without recursing into its own mock.
const realStrip = (await vi.importActual<typeof import('./markdown-to-narration.js')>('./markdown-to-narration.js'))
  .stripMarkdownForNarration

const testProfile: LearningProfile = {
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

const testMeta: BookMeta = {
  id: 'aud-test-book',
  title: 'Test Audiobook',
  prompt: 'Teach audiobooks',
  status: 'reading',
  totalChapters: 3,
  generatedUpTo: 3,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  tags: [],
  audioGeneratedChapters: [],
}

const testToc: Toc = {
  chapters: [
    { title: 'Origins', description: 'Where it began' },
    { title: 'The Middle', description: 'Tension rises' },
    { title: 'Resolution', description: 'How it ends' },
  ],
}

async function seedBook(): Promise<void> {
  await mkdir(join(testDir, 'books'), { recursive: true })
  await writeFile(join(testDir, 'books', 'learning-profile.yml'), stringifyYaml(testProfile), 'utf-8')
  await store.saveBook(testMeta)
  await store.saveToc(testMeta.id, testToc)
  await store.saveChapter(testMeta.id, 1, '# Origins\n\nFirst chapter content.')
  await store.saveChapter(testMeta.id, 2, '# Middle\n\nSecond chapter content.')
  await store.saveChapter(testMeta.id, 3, '# Resolution\n\nThird chapter content.')
}

describe('audiobook-generator', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-audiobook-gen-test-'))

    // Reset every shared mock so prior tests don't bleed in.
    mocks.synthesizeChapter.mockReset()
    mocks.startWorkerPool.mockReset()
    mocks.stopWorkerPool.mockReset()
    mocks.getRecommendedWorkerCount.mockReset()
    mocks.execFile.mockReset()
    mocks.stripMarkdownForNarration.mockReset()
    mocks.updateProgress.mockReset()
    mocks.completeTask.mockReset()

    // Sensible defaults — most tests want a "happy path" execution.
    mocks.startWorkerPool.mockResolvedValue(undefined)
    mocks.stopWorkerPool.mockResolvedValue(undefined)
    mocks.getRecommendedWorkerCount.mockReturnValue(2)

    // Default synthesize writes a fake WAV so the next ffmpeg conversion call
    // has an input file. Tests that need to observe abort or per-chapter
    // state can override this with mockImplementation.
    mocks.synthesizeChapter.mockImplementation(async (_t, _v, _s, outPath) => {
      await writeFile(outPath, Buffer.from('fake-wav-bytes'))
    })

    // Default strip just passes through to the real implementation so generator
    // text manipulation is realistic. Tests that need assertion on raw md still
    // see all calls in mocks.stripMarkdownForNarration.mock.calls.
    mocks.stripMarkdownForNarration.mockImplementation((md) => realStrip(md))

    // Default execFile: emit a Duration line for duration probe calls and
    // create a stub output file for all other calls.
    mocks.execFile.mockImplementation((_file, args, opts, cb) => {
      if (opts.signal?.aborted) {
        const err = new Error('aborted') as NodeJS.ErrnoException
        err.code = 'ABORT_ERR'
        setImmediate(() => cb(err, '', ''))
        return
      }
      const isDurationProbe = args.includes('-f') && args.includes('null') && args[args.length - 1] === '-'
      if (isDurationProbe) {
        setImmediate(() => cb(null, '', 'Duration: 00:01:23.45, start: 0.000000, bitrate: 96 kb/s'))
        return
      }
      const outPath = args[args.length - 1]
      setImmediate(async () => {
        try {
          await writeFile(outPath, Buffer.from('fake-output'))
          cb(null, '', '')
        } catch (err) {
          cb(err as NodeJS.ErrnoException, '', '')
        }
      })
    })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('cleans up prior audiobook artifacts before regenerating', async () => {
    await seedBook()

    // Pre-seed a stale M4B and audio dir so we can confirm they get wiped.
    // The per-chapter MP3 represents a legacy audiobook from before we
    // dropped duplicate-file generation; deleteAudiobookArtifacts wipes
    // the whole audio dir so it must be gone after a fresh generation.
    await mkdir(store.audioDir(testMeta.id), { recursive: true })
    const staleMp3 = store.chapterAudioPath(testMeta.id, 1)
    const staleM4b = store.audiobookPath(testMeta.id)
    await writeFile(staleMp3, 'STALE')
    await writeFile(staleM4b, 'STALE')

    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )

    // Stale per-chapter MP3 must be gone (we don't write them anymore).
    expect(existsSync(staleMp3)).toBe(false)
    // M4B should be regenerated.
    expect(existsSync(staleM4b)).toBe(true)
    const m4bContent = await readFile(staleM4b, 'utf-8')
    expect(m4bContent).not.toBe('STALE')
  })

  it('feeds each chapter through stripMarkdownForNarration', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )

    expect(mocks.stripMarkdownForNarration).toHaveBeenCalledTimes(3)
    expect(mocks.stripMarkdownForNarration).toHaveBeenCalledWith('# Origins\n\nFirst chapter content.')
    expect(mocks.stripMarkdownForNarration).toHaveBeenCalledWith('# Middle\n\nSecond chapter content.')
    expect(mocks.stripMarkdownForNarration).toHaveBeenCalledWith('# Resolution\n\nThird chapter content.')
  })

  it('prefixes the chapter title heading into the narration text', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )

    const firstCallText = mocks.synthesizeChapter.mock.calls[0][0]
    expect(firstCallText.startsWith('Chapter 1: Origins.\n\n')).toBe(true)
    const secondCallText = mocks.synthesizeChapter.mock.calls[1][0]
    expect(secondCallText.startsWith('Chapter 2: The Middle.\n\n')).toBe(true)
  })

  it('updates audioGeneratedChapters incrementally after each chapter', async () => {
    await seedBook()
    const snapshots: number[][] = []
    // First snapshot is before chapter 1 (empty). For later chapters, this
    // observes the state after the prior chapter saved.
    mocks.synthesizeChapter.mockImplementation(async (_t, _v, _s, outPath) => {
      const meta = await store.getBook(testMeta.id)
      snapshots.push([...meta.audioGeneratedChapters])
      await writeFile(outPath, Buffer.from('fake'))
    })

    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )

    expect(snapshots).toEqual([[], [1], [1, 2]])

    const finalMeta = await store.getBook(testMeta.id)
    expect(finalMeta.audioGeneratedChapters).toEqual([1, 2, 3])
  })

  it('writes a manifest with the expected shape', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.25 },
      task.id,
      task.abortController.signal,
    )

    const manifestPath = store.audiobookManifestPath(testMeta.id)
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = parseYaml(await readFile(manifestPath, 'utf-8'))
    expect(manifest.version).toBe(1)
    expect(manifest.voice).toBe('am_michael')
    expect(manifest.speed).toBe(1.25)
    expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(manifest.m4bPath).toBe(store.audiobookPath(testMeta.id))
    expect(manifest.chapters).toHaveLength(3)
    expect(manifest.chapters[0]).toMatchObject({
      num: 1,
      title: 'Origins',
      mp3Path: store.chapterAudioPath(testMeta.id, 1),
    })
    // Each chapter's stub duration comes from the mocked "Duration: 00:01:23.45" line.
    expect(manifest.chapters[0].durationSec).toBeCloseTo(83.45, 1)
    expect(manifest.chapters[0].startSec).toBe(0)
    expect(manifest.chapters[1].startSec).toBeCloseTo(83.45, 1)
    expect(manifest.chapters[2].startSec).toBeCloseTo(166.9, 1)
  })

  it('halts subsequent chapters when the abort signal fires mid-generation', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)

    let chaptersSeen = 0
    mocks.synthesizeChapter.mockImplementation(async (_t, _v, _s, outPath, signal) => {
      if (signal?.aborted) throw new Error('Synthesis aborted')
      chaptersSeen++
      await writeFile(outPath, Buffer.from('fake'))
      if (chaptersSeen === 1) {
        // Cancel right after chapter 1 finishes synthesizing.
        task.abortController.abort()
      }
    })

    await expect(
      generateAudiobook(
        testMeta.id,
        { voiceId: 'am_michael', speed: 1.0 },
        task.id,
        task.abortController.signal,
      ),
    ).rejects.toThrow(/abort/i)

    // Only the first chapter's narration happened.
    expect(mocks.synthesizeChapter).toHaveBeenCalledTimes(1)
    // Manifest must NOT have been written.
    expect(existsSync(store.audiobookManifestPath(testMeta.id))).toBe(false)
    // Worker pool was still released.
    expect(mocks.stopWorkerPool).toHaveBeenCalled()
  })

  it('forwards voiceId and speed to synthesizeChapter on every call', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'bm_george', speed: 1.5 },
      task.id,
      task.abortController.signal,
    )

    expect(mocks.synthesizeChapter).toHaveBeenCalledTimes(3)
    for (const call of mocks.synthesizeChapter.mock.calls) {
      expect(call[1]).toBe('bm_george')
      expect(call[2]).toBe(1.5)
    }
  })

  it('starts and stops the worker pool around the run', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )
    expect(mocks.startWorkerPool).toHaveBeenCalledOnce()
    expect(mocks.stopWorkerPool).toHaveBeenCalledOnce()
    expect(mocks.getRecommendedWorkerCount).toHaveBeenCalled()
  })

  it('reports progress through narration and stitching phases', async () => {
    await seedBook()
    const task = taskManager.createTask('generate-audiobook', testMeta.id, testMeta.title, testMeta.totalChapters)
    await generateAudiobook(
      testMeta.id,
      { voiceId: 'am_michael', speed: 1.0 },
      task.id,
      task.abortController.signal,
    )
    const labels = mocks.updateProgress.mock.calls.map((c) => c[2] as string)
    expect(labels.some((l) => /Stitching/i.test(l))).toBe(true)
    expect(labels.some((l) => /Narrating chapter 1/i.test(l))).toBe(true)
    expect(mocks.completeTask).toHaveBeenCalledOnce()
    const completeCall = mocks.completeTask.mock.calls[0]
    expect((completeCall[1] as { path: string }).path).toBe(store.audiobookPath(testMeta.id))
  })
})
