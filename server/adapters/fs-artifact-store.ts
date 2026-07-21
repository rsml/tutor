import { writeFile, mkdir, readdir, rm, rename, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AudiobookManifestSchema, type AudiobookManifest } from '@shared/domain.js'
import type { ArtifactStore, CrashRecoveryReport } from '../ports/artifact-store.js'
import { booksDir, bookDir, padChapter, readYaml, writeYaml } from './fs-paths.js'

/**
 * The real ArtifactStore adapter: covers, EPUB exports, and audiobook audio
 * on the filesystem, rooted at {dataDir}/books/. Every method here is the
 * same logic server/services/book-store.ts used to run at module scope,
 * moved behind a factory so the data directory is a constructor argument
 * instead of a fresh getDataDir() call baked into every helper.
 *
 * recoverFromCrash() only ever touches artifacts: stray .tmp files left by
 * an interrupted write, and an audio directory left behind with no m4b to
 * show for it. It walks the books directory itself rather than going
 * through BookRepository, so it can find and clean these up even for a
 * book whose meta.yml is missing or unparseable, exactly like the fixture
 * artifact-store.contract.ts uses (a saved audiobook manifest with no
 * BookMeta behind it at all). It never changes a book's status, and always
 * reports booksReset as empty, because that is BookRepository data this
 * adapter cannot see. See server/services/book-store.ts for the
 * composition that reconciles status on top of this report.
 */

const COVER_EXTENSIONS = ['png', 'jpg', 'webp']

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  return 'png'
}

export function createFsArtifactStore(opts: { dataDir: string }): ArtifactStore {
  const { dataDir } = opts

  const audioDir = (bookId: string): string => join(bookDir(dataDir, bookId), 'audio')
  const audiobookPath = (bookId: string): string => join(bookDir(dataDir, bookId), 'book.m4b')
  const audiobookManifestPath = (bookId: string): string => join(audioDir(bookId), 'manifest.yml')
  const epubPath = (bookId: string): string => join(bookDir(dataDir, bookId), 'book.epub')
  const chapterAudioPath = (bookId: string, chapterNum: number): string =>
    join(audioDir(bookId), `${padChapter(chapterNum)}.mp3`)
  const chapterWavPath = (bookId: string, chapterNum: number): string =>
    join(audioDir(bookId), `${padChapter(chapterNum)}.wav`)

  async function cleanPartialBookArtifacts(bookId: string, report: CrashRecoveryReport): Promise<void> {
    const dir = bookDir(dataDir, bookId)
    if (!existsSync(dir)) return

    // book.epub.tmp
    const epubTmp = join(dir, 'book.epub.tmp')
    if (existsSync(epubTmp)) {
      await rm(epubTmp)
      report.artifactsRemoved.push(epubTmp)
    }

    // cover.*.tmp
    for (const ext of COVER_EXTENSIONS) {
      const coverTmp = join(dir, `cover.${ext}.tmp`)
      if (existsSync(coverTmp)) {
        await rm(coverTmp)
        report.artifactsRemoved.push(coverTmp)
      }
    }
  }

  async function cleanPartialInstallArtifacts(report: CrashRecoveryReport): Promise<void> {
    const binDir = join(dataDir, 'bin')
    if (!existsSync(binDir)) return

    // ffmpeg downloader leaves these on crash mid-download or mid-unzip.
    for (const name of ['ffmpeg.partial', 'ffmpeg.zip.tmp']) {
      const p = join(binDir, name)
      if (existsSync(p)) {
        await rm(p)
        report.artifactsRemoved.push(p)
      }
    }
    const extractDir = join(binDir, '.ffmpeg-extract.tmp')
    if (existsSync(extractDir)) {
      await rm(extractDir, { recursive: true })
      report.artifactsRemoved.push(extractDir)
    }
  }

  const store: ArtifactStore = {
    // --- Cover image ---

    async getCoverPath(bookId: string): Promise<string | null> {
      const dir = bookDir(dataDir, bookId)
      for (const ext of COVER_EXTENSIONS) {
        const p = join(dir, `cover.${ext}`)
        if (existsSync(p)) return p
      }
      return null
    },

    async hasCover(bookId: string): Promise<boolean> {
      return (await store.getCoverPath(bookId)) !== null
    },

    async getCoverMtime(bookId: string): Promise<Date | null> {
      const coverPath = await store.getCoverPath(bookId)
      if (!coverPath) return null
      const s = await stat(coverPath)
      return s.mtime
    },

    async saveCover(bookId: string, data: Buffer, mediaType: string): Promise<void> {
      const dir = bookDir(dataDir, bookId)
      await mkdir(dir, { recursive: true })

      // Delete any existing cover first
      await store.deleteCover(bookId)

      const ext = extensionFor(mediaType)
      const dest = join(dir, `cover.${ext}`)
      const tmp = dest + '.tmp'
      await writeFile(tmp, data)
      await rename(tmp, dest)
    },

    async deleteCover(bookId: string): Promise<void> {
      const dir = bookDir(dataDir, bookId)
      for (const ext of COVER_EXTENSIONS) {
        const p = join(dir, `cover.${ext}`)
        if (existsSync(p)) {
          await rm(p)
        }
      }
    },

    // --- EPUB export ---

    epubPath,

    epubExists(bookId: string): boolean {
      return existsSync(epubPath(bookId))
    },

    async writeEpub(bookId: string, data: Buffer): Promise<void> {
      const dir = bookDir(dataDir, bookId)
      await mkdir(dir, { recursive: true })
      const dest = epubPath(bookId)
      const tmp = dest + '.tmp'
      await writeFile(tmp, data)
      await rename(tmp, dest)
    },

    // --- Audiobook ---

    audiobookPath,

    audiobookExists(bookId: string): boolean {
      return existsSync(audiobookPath(bookId))
    },

    audioDir,
    chapterAudioPath,
    chapterWavPath,

    async chapterAudioExists(bookId: string, chapterNum: number): Promise<boolean> {
      if (existsSync(chapterAudioPath(bookId, chapterNum))) return true
      const manifest = await store.getAudiobookManifest(bookId)
      return !!manifest?.chapters.some((c) => c.num === chapterNum)
    },

    async getAudiobookManifest(bookId: string): Promise<AudiobookManifest | null> {
      const path = audiobookManifestPath(bookId)
      if (!existsSync(path)) return null
      return readYaml(path, AudiobookManifestSchema)
    },

    async saveAudiobookManifest(bookId: string, manifest: AudiobookManifest): Promise<void> {
      AudiobookManifestSchema.parse(manifest)
      await writeYaml(audiobookManifestPath(bookId), manifest)
    },

    async deleteAudiobookArtifacts(bookId: string): Promise<void> {
      const m4b = audiobookPath(bookId)
      if (existsSync(m4b)) {
        await rm(m4b)
      }
      const dir = audioDir(bookId)
      if (existsSync(dir)) {
        await rm(dir, { recursive: true })
      }
    },

    // --- Crash recovery ---

    async recoverFromCrash(): Promise<CrashRecoveryReport> {
      const report: CrashRecoveryReport = { booksReset: [], artifactsRemoved: [] }
      const dir = booksDir(dataDir)

      if (existsSync(dir)) {
        const entries = await readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const bookId = entry.name

          await cleanPartialBookArtifacts(bookId, report)

          const m4bExists = existsSync(audiobookPath(bookId))
          const audioDirExists = existsSync(audioDir(bookId))
          if (!m4bExists && audioDirExists) {
            await rm(audioDir(bookId), { recursive: true })
            report.artifactsRemoved.push(audioDir(bookId))
          }
        }
      }

      await cleanPartialInstallArtifacts(report)

      return report
    },
  }

  return store
}
