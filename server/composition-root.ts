import { getDataDir } from '@shared/node/data-dir.js'
import { createFsBookRepository } from './adapters/fs-book-repository.js'
import { createFsArtifactStore } from './adapters/fs-artifact-store.js'
import { createFsLibraryMigrator } from './adapters/fs-library-migrator.js'
import { createFileKeyVault } from './adapters/file-key-vault.js'
import { createAiSdkTextGeneration } from './adapters/ai-sdk-text-generation.js'
import { createHttpImageGeneration } from './adapters/http-image-generation.js'
import { createKokoroSpeechSynthesis } from './adapters/kokoro-speech-synthesis.js'
import { createFfmpegAudioAssembly } from './adapters/ffmpeg-audio-assembly.js'
import { createKrokiDiagramRenderer } from './adapters/kroki-diagram-renderer.js'
import { createEpub2Import } from './adapters/epub2-import.js'
import { createEpubGenExport } from './adapters/epub-gen-export.js'
import { createInMemoryBackgroundTasks } from './adapters/in-memory-background-tasks.js'
import { createJournalledBackgroundTasks } from './adapters/journalled-background-tasks.js'
import { createFsJobJournal } from './adapters/fs-job-journal.js'
import { createSystemClock } from './adapters/system-clock.js'
import { createOsFileManager } from './adapters/os-file-manager.js'
import { createChapterGenerationStream, type ChapterGenerationStream } from './services/chapter-generation-stream.js'
import { createGenerateNextChapter } from './services/generate-next-chapter.js'

import type { BookRepository } from './ports/book-repository.js'
import type { ArtifactStore } from './ports/artifact-store.js'
import type { LibraryMigrator } from './ports/library-migrator.js'
import type { KeyVault } from './ports/key-vault.js'
import type { TextGeneration } from './ports/text-generation.js'
import type { ImageGeneration } from './ports/image-generation.js'
import type { SpeechSynthesis } from './ports/speech-synthesis.js'
import type { AudioAssembly } from './ports/audio-assembly.js'
import type { DiagramRenderer } from './ports/diagram-renderer.js'
import type { EpubImport } from './ports/epub-import.js'
import type { EpubExport } from './ports/epub-export.js'
import type { BackgroundTasks } from './ports/background-tasks.js'
import type { JobJournal } from './ports/job-journal.js'
import type { Clock } from './ports/clock.js'
import type { OsFileManager } from './ports/os-file-manager.js'

/**
 * The one place real adapters are chosen and constructed.
 *
 * Every other module in server/ depends on a port by shape and never names
 * an adapter, so this file is the only thing that knows the app talks to
 * the filesystem, to the Vercel AI SDK, to kokoro, to ffmpeg, to kroki.io,
 * and to epub-gen-memory. Swapping any of those out is a one line edit
 * here, and a test that wants a fake swaps it through the overrides
 * argument without the production wiring knowing.
 *
 * Adapters are constructed eagerly when createPorts runs rather than
 * lazily on first use. That is deliberate. Construction is cheap for all
 * fifteen, none of them opens a connection or reads a file in its
 * factory, and eager construction means a misconfigured dependency fails
 * at startup instead of on whichever request happens to reach it first.
 */

/** Every external dependency the server has, one field per port. */
export interface Ports {
  bookRepository: BookRepository
  artifactStore: ArtifactStore
  libraryMigrator: LibraryMigrator
  keyVault: KeyVault
  textGeneration: TextGeneration
  imageGeneration: ImageGeneration
  speechSynthesis: SpeechSynthesis
  audioAssembly: AudioAssembly
  diagramRenderer: DiagramRenderer
  epubImport: EpubImport
  epubExport: EpubExport
  backgroundTasks: BackgroundTasks
  jobJournal: JobJournal
  clock: Clock
  osFileManager: OsFileManager
}

/**
 * Builds the real adapter for every port, then applies overrides on top.
 *
 * Overrides exist for two callers. Tests pass fakes so `fastify.inject`
 * can drive a fully wired server with no filesystem, no network, and no
 * model. Electron passes its own DiagramRenderer, because it can render
 * mermaid with a real offscreen browser window and the kroki.io default
 * cannot match that offline.
 *
 * An override replaces its adapter outright, it is not merged into it, so
 * a caller that overrides `bookRepository` gets exactly the object it
 * passed. Ports that are not overridden are still constructed, which keeps
 * the return type a complete `Ports` rather than a partial one every
 * consumer would have to null check.
 */
export function createPorts(overrides: Partial<Ports> = {}): Ports {
  const dataDir = getDataDir()
  const keyVault = overrides.keyVault ?? createFileKeyVault({ dataDir })
  // Resolved before the object literal too, exactly like keyVault above, so
  // an override of either reaches createJournalledBackgroundTasks below
  // instead of being silently bypassed by a second, un-overridden instance
  // built inline inside it.
  const jobJournal = overrides.jobJournal ?? createFsJobJournal({ dataDir })
  const clock = overrides.clock ?? createSystemClock()

  return {
    bookRepository: createFsBookRepository({ dataDir }),
    artifactStore: createFsArtifactStore({ dataDir }),
    libraryMigrator: createFsLibraryMigrator({ dataDir }),
    keyVault,
    // These two read API keys through the vault, so they take whichever
    // vault won above rather than building a second one. Overriding the
    // key vault in a test therefore also redirects both of them.
    textGeneration: createAiSdkTextGeneration({ keyVault }),
    imageGeneration: createHttpImageGeneration({ keyVault }),
    speechSynthesis: createKokoroSpeechSynthesis(),
    audioAssembly: createFfmpegAudioAssembly(),
    diagramRenderer: createKrokiDiagramRenderer(),
    epubImport: createEpub2Import(),
    epubExport: createEpubGenExport(),
    // Decorated with journalling rather than a plain in-memory adapter, so
    // a task still running when the process dies can be found and resumed
    // at the next boot. Takes the jobJournal and clock resolved above so an
    // override of either reaches it.
    backgroundTasks: createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal: jobJournal, clock }),
    jobJournal,
    clock,
    osFileManager: createOsFileManager(),
    ...overrides,
  }
}

/**
 * In-memory application state shared across route modules within one
 * running server, built once by {@link createSharedServices} and handed to
 * every route plugin alongside Ports.
 *
 * This is deliberately not a Ports field. A port names an external
 * dependency the app can swap an adapter for, such as the filesystem, an AI
 * provider, or kroki.io. A ChapterGenerationStream is not external at all,
 * it is in-memory orchestration state that server/routes/generation.ts
 * starts and server/routes/library.ts reads (to embed generation status on
 * GET /api/books/:id), and the two route modules must observe the exact
 * same live instance rather than each holding its own, always-empty copy.
 * Building it here, once, and threading it through is what replaces the
 * module-scope registry the two route modules used to share it through.
 */
export interface SharedServices {
  chapterGenerationStream: ChapterGenerationStream
}

/**
 * Builds the in-memory services shared across route modules, once per
 * server instance, from the same resolved ports {@link createPorts}
 * returned for that instance.
 */
export function createSharedServices(ports: Ports): SharedServices {
  const generateNextChapter = createGenerateNextChapter({
    ai: ports.textGeneration,
    books: ports.bookRepository,
    clock: ports.clock,
  })

  return {
    chapterGenerationStream: createChapterGenerationStream({
      books: ports.bookRepository,
      generateNextChapter,
    }),
  }
}
