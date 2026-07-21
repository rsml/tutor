/**
 * The EPUB fixture the import journey (`e2e/journeys/epub-import.spec.ts`) drives
 * through the real epub2 parser (`server/adapters/epub2-import.ts`), unlike every
 * other journey, whose fixtures are consumed by the scripted model instead.
 *
 * These constants are the single source of truth for what
 * `scripts/build-e2e-epub-fixture.ts` bakes into the committed binary at
 * `e2e/fixtures/sample-book.epub`, and for what the journey then asserts
 * against, so the fixture's real content and the journey's expectations
 * cannot drift the way two hand-copied string literals could.
 */

export const SAMPLE_BOOK_TITLE = 'Bioluminescence in the Midnight Zone'

export interface SampleBookChapter {
  title: string
  /** Wrapped in a single <p> when the fixture script builds the EPUB. */
  body: string
}

/** The chapters the fixture EPUB contains, in spine order. The journey asserts against this title list and its length. */
export const SAMPLE_BOOK_CHAPTERS: SampleBookChapter[] = [
  {
    title: 'Light Without Heat',
    body: 'Bioluminescent light comes from a chemical reaction rather than from heat, so a deep-sea body can glow without ever warming the water around it.',
  },
  {
    title: 'Signaling in the Dark',
    body: 'Below the reach of sunlight, a flash or a glow carries the signal that color and shape would otherwise carry, from a mating display to a warning.',
  },
  {
    title: 'The Predators That Glow Back',
    body: 'Some hunters borrow the very glow their prey uses to hide, turning a warning signal into a lure that draws the next meal closer.',
  },
]
