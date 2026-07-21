import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { BookMeta, Toc } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createFakeBackgroundTasks } from '../ports/background-tasks.fake.js'
import { createFakeDiagramRenderer } from '../ports/diagram-renderer.fake.js'
import { createFakeEpubExport } from '../ports/epub-export.fake.js'
import { createExportEpub, getEpubFile } from './export-epub.js'

const BASE_META: BookMeta = {
  id: 'book-1',
  title: 'Test Book',
  prompt: 'Learn things',
  status: 'reading',
  totalChapters: 2,
  generatedUpTo: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

const BASE_TOC: Toc = {
  chapters: [
    { title: 'Chapter One', description: 'The first chapter.' },
    { title: 'Chapter Two', description: 'The second chapter.' },
  ],
}

/** Decodes the fake EpubExport's JSON-encoded output back into the request it was built from. */
interface DecodedFakeEpub {
  title: string
  author: string
  css: string | null
  coverPath: string | null
  chapters: Array<{ title: string; html: string }>
}

function decodeFakeEpub(buffer: Buffer): DecodedFakeEpub {
  return JSON.parse(buffer.toString('utf-8'))
}

function makeDeps(root?: string) {
  const artifactStore = createFakeArtifactStore(root ? { root } : {})
  const writeEpubCalls: Array<{ bookId: string; data: Buffer }> = []
  const realWriteEpub = artifactStore.writeEpub.bind(artifactStore)
  artifactStore.writeEpub = async (bookId: string, data: Buffer) => {
    writeEpubCalls.push({ bookId, data })
    await realWriteEpub(bookId, data)
  }

  return {
    bookRepository: createFakeBookRepository(),
    artifactStore,
    backgroundTasks: createFakeBackgroundTasks(),
    diagramRenderer: createFakeDiagramRenderer(),
    epubExport: createFakeEpubExport(),
    writeEpubCalls,
  }
}

type Deps = ReturnType<typeof makeDeps>

async function seed(deps: Deps, meta: BookMeta, toc: Toc, chapters: string[]): Promise<void> {
  await deps.bookRepository.saveBook(meta)
  await deps.bookRepository.saveToc(meta.id, toc)
  for (let i = 0; i < chapters.length; i++) {
    await deps.bookRepository.saveChapter(meta.id, i + 1, chapters[i])
  }
}

async function waitUntilDone(deps: Deps, taskId: string): Promise<void> {
  await vi.waitFor(() => {
    const task = deps.backgroundTasks.get(taskId)
    if (!task || task.status === 'running') throw new Error('still running')
  })
}

describe('createExportEpub', () => {
  it('refuses a book that is not fully generated', async () => {
    const deps = makeDeps()
    await seed(deps, { ...BASE_META, generatedUpTo: 1 }, BASE_TOC, ['# Chapter One\n\nBody.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)

    expect(result).toEqual({ outcome: 'not-complete' })
    expect(deps.backgroundTasks.list()).toHaveLength(0)
  })

  it('returns cached when an EPUB was already generated', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
    await deps.artifactStore.writeEpub(BASE_META.id, Buffer.from('already built'))
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)

    expect(result).toEqual({ outcome: 'cached', path: `/api/books/${BASE_META.id}/export-epub` })
  })

  it('refuses a second export while one is already running', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
    deps.backgroundTasks.start({ type: 'generate-epub', bookId: BASE_META.id, bookTitle: BASE_META.title, total: 2 })
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)

    expect(result).toEqual({ outcome: 'in-progress' })
  })

  it('starts a task, writes the EPUB through the port, and completes it', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nFirst body.', '# Two\n\nSecond body.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)
    expect(result.outcome).toBe('started')
    if (result.outcome !== 'started') throw new Error('unreachable')

    await waitUntilDone(deps, result.taskId)

    expect(deps.backgroundTasks.get(result.taskId)?.status).toBe('done')
    expect(deps.artifactStore.epubExists(BASE_META.id)).toBe(true)
    expect(deps.writeEpubCalls).toHaveLength(1)

    const decoded = decodeFakeEpub(deps.writeEpubCalls[0].data)
    expect(decoded.title).toBe('Test Book')
    expect(decoded.author).toBe('Tutor')
    expect(decoded.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(decoded.chapters[0].html).toContain('First body.')
  })

  it('embeds mermaid sources and chapter descriptions for round trip, and renders diagrams through the port', async () => {
    const deps = makeDeps()
    const chapterOneMd = [
      '# One',
      '',
      'Some intro text.',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
    ].join('\n')
    await seed(deps, BASE_META, BASE_TOC, [chapterOneMd, '# Two\n\nSecond body.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    // The diagram renderer saw the extracted mermaid source.
    expect(deps.diagramRenderer.calls).toHaveLength(1)
    expect(deps.diagramRenderer.calls[0][0]).toContain('graph TD\n  A --> B')

    const decoded = decodeFakeEpub(deps.writeEpubCalls[0].data)

    // Chapter one: the fake renderer succeeds (non-empty, non-`<pre>`
    // markup), so the rendered branch is used, and the hidden mermaid
    // source plus the chapter description are both embedded.
    expect(decoded.chapters[0].html).toContain('tutor-mermaid-rendered')
    expect(decoded.chapters[0].html).toContain('tutor-mermaid-source')
    expect(decoded.chapters[0].html).toContain('graph TD')
    expect(decoded.chapters[0].html).toContain('tutor-chapter-description')
    expect(decoded.chapters[0].html).toContain('The first chapter.')

    // Book-level meta embeds into the first chapter only.
    expect(decoded.chapters[1].html).not.toContain('tutor-book-meta')
  })

  it('falls back to an escaped code block when a chart fails to render', async () => {
    const deps = makeDeps()
    // The fake DiagramRenderer treats a blank chart source as a failure and
    // returns diagramSourceFallback(source) for it (see diagram-renderer.fake.ts).
    const chapterOneMd = ['# One', '', '```mermaid', '   ', '```', ''].join('\n')
    await seed(deps, BASE_META, BASE_TOC, [chapterOneMd, '# Two\n\nSecond body.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const decoded = decodeFakeEpub(deps.writeEpubCalls[0].data)
    expect(decoded.chapters[0].html).not.toContain('tutor-mermaid-rendered')
    expect(decoded.chapters[0].html).toContain('<pre><code class="language-mermaid">')
    // The source is still recoverable by the importer even though rendering failed.
    expect(decoded.chapters[0].html).toContain('tutor-mermaid-source')
  })

  it('embeds book-level meta (subtitle, showTitleOnCover) into the first chapter only', async () => {
    const deps = makeDeps()
    const meta: BookMeta = { ...BASE_META, subtitle: 'A Subtitle', showTitleOnCover: true }
    await seed(deps, meta, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(meta.id)
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const decoded = decodeFakeEpub(deps.writeEpubCalls[0].data)
    expect(decoded.title).toBe('Test Book: A Subtitle')
    expect(decoded.chapters[0].html).toContain('tutor-book-meta')
    expect(decoded.chapters[0].html).toContain('showTitleOnCover')
    expect(decoded.chapters[0].html).toContain('A Subtitle')
  })

  it('passes the cover path through when the book has a cover', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
    await deps.artifactStore.saveCover(BASE_META.id, Buffer.from('fake-cover'), 'image/png')
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)
    if (result.outcome !== 'started') throw new Error('expected started')
    await waitUntilDone(deps, result.taskId)

    const decoded = decodeFakeEpub(deps.writeEpubCalls[0].data)
    expect(decoded.coverPath).not.toBeNull()
  })

  it('stops before writing anything once the task is cancelled mid-flight', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
    const exportEpub = createExportEpub(deps)

    const result = await exportEpub(BASE_META.id)
    if (result.outcome !== 'started') throw new Error('expected started')

    // Cancel immediately, before the background IIFE's first await settles.
    deps.backgroundTasks.cancel(result.taskId)

    // Every port in play here is a fake with no real timers of its own, so
    // a couple of event-loop turns is enough for the in-flight background
    // work to observe the abort and return early.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(deps.artifactStore.epubExists(BASE_META.id)).toBe(false)
    expect(deps.writeEpubCalls).toHaveLength(0)
  })
})

describe('getEpubFile', () => {
  it('resolves to null when no EPUB has been generated', async () => {
    const deps = makeDeps()
    await seed(deps, BASE_META, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])

    const file = await getEpubFile(BASE_META.id, deps)

    expect(file).toBeNull()
  })

  it('returns the bytes and a sanitized filename once an EPUB exists', async () => {
    // getEpubFile reads real bytes from the path ArtifactStore hands back
    // (see artifact-store.ts's own doc on why that method is path-returning
    // rather than byte-returning), so this one case needs a real, writable
    // root rather than the fake's default in-memory-only "/fake-artifacts"
    // root, which never has real bytes behind its paths.
    const root = await mkdtemp(join(tmpdir(), 'export-epub-test-'))
    try {
      const deps = makeDeps(root)
      await seed(deps, { ...BASE_META, title: 'My Book: Weird / Title?' }, BASE_TOC, ['# One\n\nBody.', '# Two\n\nBody.'])
      await deps.artifactStore.writeEpub(BASE_META.id, Buffer.from('unused'))
      const realPath = deps.artifactStore.epubPath(BASE_META.id)
      await mkdir(dirname(realPath), { recursive: true })
      await writeFile(realPath, Buffer.from('epub-bytes'))

      const file = await getEpubFile(BASE_META.id, deps)

      expect(file).not.toBeNull()
      expect(file?.filename).toBe('My Book Weird  Title.epub')
      expect(file?.data.toString('utf-8')).toBe('epub-bytes')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
