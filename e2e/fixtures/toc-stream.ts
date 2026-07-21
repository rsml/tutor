/**
 * The table of contents the scripted model streams back for every journey
 * that creates a book.
 *
 * It is a TS module rather than JSON so `tsc` sees it, and it is split into
 * chunks rather than one string so the journey exercises the real SSE path,
 * many `toc` events accumulating in the client, rather than a single write
 * that would hide a reassembly bug.
 *
 * The markdown shape is the one `server/services/toc-parser.ts` accepts, a
 * `#` title, an italic subtitle, then numbered `**bold** — description`
 * lines. Changing the shape here without checking that parser is the fastest
 * way to make every creation journey fail at once.
 */

export const TOC_BOOK_TITLE = 'Tidal Locking'
export const TOC_BOOK_SUBTITLE = 'How Worlds Stop Spinning'

export interface TocFixtureChapter {
  title: string
  description: string
}

/** The chapters the fixture TOC parses into, in order. Journeys assert against these. */
export const TOC_CHAPTERS: TocFixtureChapter[] = [
  { title: 'Angular Momentum', description: 'Why a spinning body keeps spinning until something takes the spin away.' },
  { title: 'Raising the Bulge', description: 'The tidal force that deforms a body and drags its own rotation backwards.' },
  { title: 'The Slow Brake', description: 'Working out how long a world takes to fall into a locked rotation.' },
]

/**
 * The fixture streamed as the model would produce it, one chunk per line, so
 * the client accumulates the same partial markdown a real run would.
 */
export const TOC_STREAM_CHUNKS: string[] = [
  `# ${TOC_BOOK_TITLE}\n`,
  `*${TOC_BOOK_SUBTITLE}*\n`,
  '\n',
  ...TOC_CHAPTERS.map((chapter, index) => `${index + 1}. **${chapter.title}** — ${chapter.description}\n`),
]

/** The whole fixture as one string, for assertions that want the parsed result rather than the stream. */
export const TOC_MARKDOWN = TOC_STREAM_CHUNKS.join('')

/**
 * A revised table of contents, with visibly different chapter titles than
 * `TOC_CHAPTERS` but the same descriptions, title, and subtitle, standing in
 * for a reader who asked to simplify the chapter titles without touching
 * their content. `default-script.ts` wires the `revise-toc` stream to this
 * fixture rather than to `TOC_STREAM_CHUNKS`, so a revision journey can
 * assert that revising actually changed something instead of the stream
 * just replaying the original TOC back.
 */
export const TOC_REVISED_CHAPTERS: TocFixtureChapter[] = [
  { title: 'Why It Keeps Turning', description: 'Why a spinning body keeps spinning until something takes the spin away.' },
  { title: 'The Bulge Explained', description: 'The tidal force that deforms a body and drags its own rotation backwards.' },
  { title: 'Braking To Zero', description: 'Working out how long a world takes to fall into a locked rotation.' },
]

/** `TOC_REVISED_CHAPTERS`, streamed the same way `TOC_STREAM_CHUNKS` streams `TOC_CHAPTERS`. */
export const TOC_REVISED_STREAM_CHUNKS: string[] = [
  `# ${TOC_BOOK_TITLE}\n`,
  `*${TOC_BOOK_SUBTITLE}*\n`,
  '\n',
  ...TOC_REVISED_CHAPTERS.map((chapter, index) => `${index + 1}. **${chapter.title}** — ${chapter.description}\n`),
]
