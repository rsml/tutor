import type { AudiobookChapterEntry } from '@shared/domain.js'

/**
 * ffmpeg backed audio assembly, probing a media file's duration and
 * concatenating narrated chapter audio into one M4B audiobook with chapter
 * markers. Extracted from the ffmpeg internals of
 * server/services/audiobook-generator.ts, specifically runFfmpeg,
 * getAudioDurationSec, and the M4B stitch step inside generateAudiobook.
 *
 * This is deliberately split from SpeechSynthesis because ffmpeg is a
 * completely separate external binary dependency from the Kokoro model. It
 * is downloaded and located independently, see
 * audiobook-installer.ts's getFfmpegPath, so a caller that only needs to
 * stitch already narrated audio has no reason to depend on kokoro-js at
 * all.
 *
 * File paths appear directly in this interface, in probeDurationSec's path
 * and in concatToM4b's inputs and out. That is a deliberate, accepted
 * exception to keeping filesystem details out of a port. Audio assembly is
 * genuinely filesystem bound, ffmpeg only knows how to read and write real
 * files, so hiding that behind an in-memory buffer API would force every
 * adapter to stage buffers to a temp file anyway, adding indirection
 * without removing the real dependency. The adapter still owns every other
 * filesystem detail seen in the source, atomic tmp then rename writes, the
 * concat list and FFMETADATA1 files ffmpeg reads, and locating the ffmpeg
 * binary itself.
 *
 * One real behaviour this first cut does not carry through. The current
 * M4B stitch in audiobook-generator.ts also embeds a cover image when one
 * is available, and retries the stitch without a cover if embedding fails.
 * ConcatToM4bRequest has no coverPath field, matching the interface this
 * port was specified against, so that behaviour is a known gap rather than
 * a silent omission. Adding an optional coverPath, or deciding cover
 * embedding belongs somewhere else entirely, is a design call for whoever
 * builds the real adapter in a later task.
 */

export interface ConcatToM4bRequest {
  /** Chapter audio files to concatenate in order, typically WAV files written by SpeechSynthesis.synthesizeChapter. */
  inputs: string[]
  /** Chapter titles and timing, embedded as chapter markers in the resulting M4B. */
  chapters: AudiobookChapterEntry[]
  /** Destination path for the finished M4B. */
  out: string
  /** ffmpeg audio bitrate, for example '64k'. */
  bitrate: string
  signal: AbortSignal
}

export interface AudioAssembly {
  /** Duration of the audio file at path, in seconds. Rejects if signal is already aborted or the file cannot be probed. */
  probeDurationSec(path: string, signal: AbortSignal): Promise<number>

  /** Concatenates inputs in order into a single M4B at out, embedding chapters as chapter markers. Rejects if signal is already aborted or becomes aborted before the work finishes. */
  concatToM4b(req: ConcatToM4bRequest): Promise<void>
}
