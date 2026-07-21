import type { AudiobookManifest } from '@shared/domain.js'
import { type ArtifactStore, type CrashRecoveryReport } from './artifact-store.js'

/**
 * An in-memory ArtifactStore for unit tests and for the contract test
 * itself. Path-returning methods build plausible strings under a fake
 * root rather than touching the filesystem, so the contract can assert
 * that paths are stable and distinct without ever asserting an exact
 * string, which is what lets a real adapter rooted somewhere else satisfy
 * the same contract.
 *
 * This fake cannot make audiobookExists or the legacy branch of
 * chapterAudioExists true, because nothing on the ArtifactStore interface
 * writes the audiobook file itself. Real audio bytes come from ffmpeg,
 * writing straight to the path this port hands out, which is exactly the
 * filesystem dependency the header comment on artifact-store.ts explains.
 * A contract that only exercises this port's own methods can only ever
 * observe that file as absent, and that is a faithful reflection of the
 * real adapter's behaviour too, for as long as a test never reaches around
 * the port to create the file directly.
 */

const FAKE_MTIME_EPOCH_MS = Date.UTC(2100, 0, 1)

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  return 'png'
}

function pad(chapterNum: number): string {
  return String(chapterNum).padStart(2, '0')
}

export function createFakeArtifactStore(options: { root?: string } = {}): ArtifactStore {
  const root = options.root ?? '/fake-artifacts'

  const covers = new Map<string, { ext: string; mtime: Date }>()
  const epubs = new Set<string>()
  // Never populated through this port's own interface. See the header
  // comment on this file for why, and the crash recovery test in
  // artifact-store.contract.ts for the one behaviour that follows from it.
  const audiobooksPresent = new Set<string>()
  const manifests = new Map<string, AudiobookManifest>()

  let tick = 0
  const nextMtime = (): Date => new Date(FAKE_MTIME_EPOCH_MS + ++tick * 1000)

  const audioDir = (bookId: string): string => `${root}/${bookId}/audio`
  const audiobookPath = (bookId: string): string => `${root}/${bookId}/book.m4b`
  const epubPath = (bookId: string): string => `${root}/${bookId}/book.epub`
  const chapterAudioPath = (bookId: string, chapterNum: number): string =>
    `${audioDir(bookId)}/${pad(chapterNum)}.mp3`
  const chapterWavPath = (bookId: string, chapterNum: number): string =>
    `${audioDir(bookId)}/${pad(chapterNum)}.wav`

  return {
    // --- Cover image ---

    async getCoverPath(bookId: string): Promise<string | null> {
      const cover = covers.get(bookId)
      return cover ? `${root}/${bookId}/cover.${cover.ext}` : null
    },

    async hasCover(bookId: string): Promise<boolean> {
      return covers.has(bookId)
    },

    async getCoverMtime(bookId: string): Promise<Date | null> {
      return covers.get(bookId)?.mtime ?? null
    },

    async saveCover(bookId: string, _data: Buffer, mediaType: string): Promise<void> {
      covers.set(bookId, { ext: extensionFor(mediaType), mtime: nextMtime() })
    },

    async deleteCover(bookId: string): Promise<void> {
      covers.delete(bookId)
    },

    // --- EPUB export ---

    epubPath,

    epubExists(bookId: string): boolean {
      return epubs.has(bookId)
    },

    async writeEpub(bookId: string, _data: Buffer): Promise<void> {
      epubs.add(bookId)
    },

    // --- Audiobook ---

    audiobookPath,

    audiobookExists(bookId: string): boolean {
      return audiobooksPresent.has(bookId)
    },

    audioDir,
    chapterAudioPath,
    chapterWavPath,

    async chapterAudioExists(bookId: string, chapterNum: number): Promise<boolean> {
      const manifest = manifests.get(bookId)
      return !!manifest?.chapters.some((c) => c.num === chapterNum)
    },

    async getAudiobookManifest(bookId: string): Promise<AudiobookManifest | null> {
      const manifest = manifests.get(bookId)
      return manifest ? structuredClone(manifest) : null
    },

    async saveAudiobookManifest(bookId: string, manifest: AudiobookManifest): Promise<void> {
      manifests.set(bookId, structuredClone(manifest))
    },

    async deleteAudiobookArtifacts(bookId: string): Promise<void> {
      audiobooksPresent.delete(bookId)
      manifests.delete(bookId)
    },

    // --- Crash recovery ---

    async recoverFromCrash(): Promise<CrashRecoveryReport> {
      const report: CrashRecoveryReport = { booksReset: [], artifactsRemoved: [] }
      for (const bookId of manifests.keys()) {
        // Mirrors book-store.ts: a saved manifest with no matching
        // audiobook file is a stray left by an interrupted generation, so
        // recovery clears it. audiobooksPresent can never hold this id
        // through this port alone, which is the point explained above.
        if (audiobooksPresent.has(bookId)) continue
        manifests.delete(bookId)
        report.artifactsRemoved.push(audioDir(bookId))
      }
      return report
    },
  }
}
