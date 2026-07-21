import { TOC_CHAPTERS } from './toc-stream.js'

/**
 * The chapter prose the scripted model streams back.
 *
 * Every chapter carries a distinctive marker sentence, so a journey can
 * assert it is looking at chapter 2 and not a stale chapter 1 without
 * matching on a heading the UI might also render in a sidebar.
 */

/** The sentence that appears only in chapter `num`. Journeys locate on this. */
export function chapterMarker(num: number): string {
  return `This is the seeded prose for chapter ${num}.`
}

/** The full markdown for chapter `num`, matching the shape the reader renders. */
export function chapterMarkdown(num: number): string {
  const chapter = TOC_CHAPTERS[num - 1]
  const title = chapter ? chapter.title : `Chapter ${num}`
  return [
    `# ${title}\n\n`,
    `${chapterMarker(num)}\n\n`,
    '## Why it matters\n\n',
    'A body that spins loses energy to the tide it raises on its partner, and it keeps losing energy until the spin and the orbit agree.\n\n',
    '> The brake never releases, it only runs out of spin to remove.\n',
  ].join('')
}

/** The same markdown split into stream chunks, so the journey exercises the real SSE reassembly. */
export function chapterStreamChunks(num: number): string[] {
  return chapterMarkdown(num).split(/(?<=\n\n)/)
}
