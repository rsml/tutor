import { TOC_CHAPTERS } from './toc-stream.js'

/**
 * The skill classification `server/services/start-book.ts` asks for right
 * before it streams chapter 1. Its schema is declared inline in that service,
 * so this fixture is validated against it at run time by the scripted
 * adapter's `schema.parse`, which is what catches drift if that schema
 * changes.
 *
 * Classification failure is non-fatal in the service, so a drifted fixture
 * would not fail the journey, it would silently skip the skills. The
 * `skills_classified` assertion in journey (a) is what keeps that honest.
 */
export const SKILL_CLASSIFICATION = {
  skills: [
    { name: 'Orbital Mechanics', weight: 5 },
    { name: 'Classical Dynamics', weight: 3 },
  ],
  chapters: TOC_CHAPTERS.map((_chapter, index) => ({
    chapterIndex: index,
    skills: [
      { skill: 'Orbital Mechanics', subskill: `Concept ${index + 1}`, weight: 2 },
    ],
  })),
}
