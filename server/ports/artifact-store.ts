import type { AudiobookManifest } from '@shared/domain.js'

/**
 * The port that server/adapters/fs-artifact-store.ts implements today for
 * every binary artifact a book can have. Covers, the exported EPUB file,
 * audiobook audio and its manifest, plus startup crash recovery for all of
 * the above.
 *
 * Unlike BookRepository, this port is deliberately filesystem shaped. The
 * epub, audiobook, and chapter audio methods hand back real paths rather
 * than an opaque handle, because ffmpeg needs a real path to read and write
 * as it assembles an audiobook, and the audiobook streaming route needs a
 * real path to answer an HTTP Range request efficiently. Wrapping those in
 * a byte-stream abstraction would just push the same filesystem dependency
 * one level down into every caller instead of removing it, which is a false
 * abstraction rather than a real one. What this port still buys a service
 * is independence from exactly where those paths live and from the
 * mkdir and tmp file and rename mechanics of writing them safely.
 *
 * A path returned by this port is a promise about shape, not about exact
 * value. Two different adapters are free to root their books under
 * different directories, so a caller may rely on a path being stable for a
 * given book and chapter and different across books and chapters, but must
 * not depend on its exact string value.
 *
 * The in-memory fake is artifact-store.fake.ts's createFakeArtifactStore,
 * and the shared behavioural spec both it and a real adapter must satisfy
 * is artifact-store.contract.ts's describeArtifactStoreContract.
 */

/**
 * What a startup crash recovery pass changed. Mirrors the shape the
 * composed recovery pass in server/services/recover-from-crash.ts returns
 * today.
 *
 * artifactsRemoved is fully owned by this port, and lists every stray
 * artifact this pass deleted. booksReset is part of the shape for
 * compatibility with that existing report, but a book's status is
 * BookRepository data, which this port cannot see or change on its own.
 * An adapter that only implements ArtifactStore therefore always returns
 * booksReset as an empty array. Reconciling a book's status after a crash,
 * the way server/services/recover-from-crash.ts does today in one
 * combined pass, is a composition level concern that reads both ports,
 * not something either port should own alone. See the contract test for
 * the one crash recovery rule this
 * port can pin by itself, that a saved audiobook manifest without a
 * matching audiobook file is treated as a stray and removed.
 */
export interface CrashRecoveryReport {
  booksReset: Array<{ id: string; title: string; from: string; to: string; reason: string }>
  artifactsRemoved: string[]
}

/**
 * Path and existence methods that check exactly one well known file,
 * epubPath/epubExists and audiobookPath/audiobookExists, stay synchronous.
 * chapterAudioExists is the one existence check that is async, because
 * unlike those it falls back to reading the audiobook manifest when the
 * legacy per-chapter file is absent.
 */
export interface ArtifactStore {
  // --- Cover image ---

  /** Resolves to null when no cover has been saved. */
  getCoverPath(bookId: string): Promise<string | null>
  hasCover(bookId: string): Promise<boolean>
  /** Resolves to null when no cover has been saved. */
  getCoverMtime(bookId: string): Promise<Date | null>
  /** Replaces any existing cover for this book, whatever image type it was saved as. */
  saveCover(bookId: string, data: Buffer, mediaType: string): Promise<void>
  /** Resolves without error when the book had no cover to delete. */
  deleteCover(bookId: string): Promise<void>

  // --- EPUB export ---

  /** A path this port hands out, not a claim that the file exists yet. Pair with epubExists. */
  epubPath(bookId: string): string
  epubExists(bookId: string): boolean
  /**
   * Not a method the pre-port book-store.ts exported. Its callers used to
   * read epubPath() and write the file themselves with the same mkdir, tmp
   * file, and rename sequence saveCover and saveChapter already use. This
   * method exists so ArtifactStore owns that sequence once, the same way
   * it already does for every other artifact, and
   * server/services/export-epub.ts calls it directly today instead of
   * writing the file itself.
   */
  writeEpub(bookId: string, data: Buffer): Promise<void>

  // --- Audiobook ---

  /** A path this port hands out, not a claim that the file exists yet. Pair with audiobookExists. */
  audiobookPath(bookId: string): string
  audiobookExists(bookId: string): boolean
  /** The directory ffmpeg and the speech synthesis port write chapter audio into. */
  audioDir(bookId: string): string
  chapterAudioPath(bookId: string, chapterNum: number): string
  chapterWavPath(bookId: string, chapterNum: number): string
  /** True once the manifest lists this chapter, regardless of whether a legacy per-chapter file also exists. */
  chapterAudioExists(bookId: string, chapterNum: number): Promise<boolean>
  /** Resolves to null when no audiobook has been generated. */
  getAudiobookManifest(bookId: string): Promise<AudiobookManifest | null>
  saveAudiobookManifest(bookId: string, manifest: AudiobookManifest): Promise<void>
  /** Removes the audiobook file, every chapter audio file, and the manifest, so a regeneration starts clean. */
  deleteAudiobookArtifacts(bookId: string): Promise<void>

  // --- Crash recovery ---

  /** Run once at startup. See CrashRecoveryReport for what this port can and cannot report. */
  recoverFromCrash(): Promise<CrashRecoveryReport>
}
