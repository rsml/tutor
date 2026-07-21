/**
 * The quiz the scripted model returns after each chapter.
 *
 * Note for journeys: `server/services/generate-quiz.ts` shuffles the options
 * with `Math.random()` before saving, so the stored `correctIndex` is not the
 * one written here and the on-screen option order is not this order. A
 * journey must therefore locate an option by its TEXT, never by its position,
 * and must decide right from wrong by comparing against these strings.
 */

export interface QuizFixtureQuestion {
  question: string
  options: string[]
  /** Index into `options` as written here, before the service shuffles them. */
  correctIndex: number
}

export const QUIZ_QUESTIONS: QuizFixtureQuestion[] = [
  {
    question: 'What removes a body\'s rotational energy during tidal locking?',
    options: [
      'The tidal bulge dragging against the body\'s own rotation',
      'The solar wind stripping momentum from the upper atmosphere',
      'Magnetic coupling between the two bodies\' iron cores',
      'Radioactive decay slowly redistributing mass in the mantle',
    ],
    correctIndex: 0,
  },
  {
    question: 'What state does a tidally locked body settle into?',
    options: [
      'Its rotation period matches its orbital period around the partner',
      'Its rotation stops entirely relative to the background stars',
      'Its orbit becomes perfectly circular and stops precessing',
      'Its axis of rotation aligns exactly with the orbital plane normal',
    ],
    correctIndex: 0,
  },
  {
    question: 'What mainly sets how long locking takes?',
    options: [
      'The separation between the bodies, which the tidal force depends on steeply',
      'The absolute temperature of the smaller body at the time of formation',
      'The total number of other satellites sharing the same orbital resonance',
      'The chemical composition of the atmosphere retained by the larger body',
    ],
    correctIndex: 0,
  },
]

/** The value the scripted adapter returns for a quiz generateObject call. */
export const QUIZ_FIXTURE = { questions: QUIZ_QUESTIONS }

/** The correct option text for a question, located by its text rather than its shuffled position. */
export function correctOptionFor(question: QuizFixtureQuestion): string {
  return question.options[question.correctIndex]
}

/** Any option that is not the correct one, for journeys that need to answer wrongly on purpose. */
export function wrongOptionFor(question: QuizFixtureQuestion): string {
  const wrong = question.options.find((_option, index) => index !== question.correctIndex)
  if (!wrong) throw new Error('quiz fixture: every option is the correct one, so there is no wrong answer to pick')
  return wrong
}
