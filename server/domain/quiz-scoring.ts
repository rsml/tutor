/**
 * Pure scoring and shuffling for multiple-choice quizzes. Neither function
 * touches storage or an AI provider — a service supplies the quiz and the
 * reader's answers it already loaded, and gets back exactly the derived
 * data a reader is shown. No fakes needed; both are tested directly with
 * plain quizzes in and plain results out.
 */

/** The fields a question needs to be scored or shuffled — no id, no I/O. */
export interface ScorableQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export interface ScoredQuiz {
  questions: Array<ScorableQuestion & { userAnswer?: number; correct: boolean }>
  score: number
}

/**
 * Grades a reader's quiz answers against each question's correct index, in
 * question order. `quizAnswers[i]` is the reader's chosen option index for
 * question i; a missing answer scores as wrong rather than throwing. This is
 * the feedback route's inline scoring, extracted verbatim, so moving it here
 * changes nothing a reader can observe.
 */
export function scoreQuizAnswers(questions: ScorableQuestion[], quizAnswers?: number[]): ScoredQuiz {
  let score = 0
  const scored = questions.map((q, i) => {
    const userAnswer = quizAnswers?.[i]
    const correct = userAnswer === q.correctIndex
    if (correct) score++
    return { ...q, userAnswer, correct }
  })
  return { questions: scored, score }
}

/**
 * Shuffles each question's options with a Fisher-Yates shuffle and updates
 * correctIndex so it still points at the same option text after the reorder.
 * `random` defaults to Math.random, exactly matching production behaviour;
 * it exists as a parameter so a test can supply a deterministic source
 * instead of asserting only loose statistical properties.
 */
export function shuffleQuizOptions<T extends { questions: ScorableQuestion[] }>(quiz: T, random: () => number = Math.random): T {
  return {
    ...quiz,
    questions: quiz.questions.map(q => {
      const correctOption = q.options[q.correctIndex]
      const shuffled = [...q.options]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return { ...q, options: shuffled, correctIndex: shuffled.indexOf(correctOption) }
    }),
  }
}
