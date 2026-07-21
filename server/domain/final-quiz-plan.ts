/**
 * Pure planning for the final, whole-book quiz: how much of each chapter's
 * content fits in the prompt budget, how many questions to ask, and what
 * the model should focus on. Every function here depends only on how many
 * chapters the book has generated so far, never on chapter content, feedback,
 * or any I/O, so this module has no fakes and is tested directly with plain
 * numbers in and plain values out.
 */

export interface FinalQuizPlan {
  charsPerChapter: number
  questionCount: number
  focusInstructions: string
}

/**
 * Characters kept from each chapter's content when assembling the final-quiz
 * prompt. Smaller books get a larger per-chapter budget since there are fewer
 * chapters competing for the prompt's context window.
 */
export function charsPerChapterFor(totalChapters: number): number {
  if (totalChapters <= 2) return 8000
  if (totalChapters <= 5) return 3000
  return 1500
}

/**
 * Question count for a single-chapter book's final quiz. One chapter cannot
 * support the cross-chapter synthesis questions a longer book gets, so asking
 * the full ten would pad the quiz with restatements of the same material.
 */
export const SINGLE_CHAPTER_QUESTION_COUNT = 5

/** Question count for every book with more than one chapter. */
export const FINAL_QUIZ_QUESTION_COUNT = 10

/** Question count for the final quiz. A single-chapter book gets a shorter quiz. */
export function questionCountFor(totalChapters: number): number {
  return totalChapters === 1 ? SINGLE_CHAPTER_QUESTION_COUNT : FINAL_QUIZ_QUESTION_COUNT
}

/**
 * Instructions telling the model what kind of questions to write, tiered by
 * how much cross-chapter synthesis a book of this size supports.
 */
export function focusInstructionsFor(totalChapters: number, questionCount: number): string {
  if (totalChapters === 1) {
    return `Generate exactly ${questionCount} multiple-choice questions that test DEEP COMPREHENSION of the single chapter. Each question should:
- Test understanding, application, or nuance of concepts from the chapter
- Go beyond surface recall — ask about implications, relationships between ideas, or how concepts apply
- Have 4 options with exactly one correct answer`
  }

  if (totalChapters <= 3) {
    return `Generate exactly ${questionCount} multiple-choice questions. Each question should:
- Where possible, test connections between concepts from different chapters
- Also include single-chapter comprehension questions that test deeper understanding
- Have 4 options with exactly one correct answer`
  }

  return `Generate exactly ${questionCount} multiple-choice questions that test SYNTHESIS and CROSS-CHAPTER understanding. Each question should:
- Require knowledge from 2+ chapters to answer correctly
- Test connections between concepts, not just recall
- Have 4 options with exactly one correct answer`
}

/** Assembles the full plan for a book with this many generated chapters. */
export function planFinalQuiz(totalChapters: number): FinalQuizPlan {
  const questionCount = questionCountFor(totalChapters)
  return {
    charsPerChapter: charsPerChapterFor(totalChapters),
    questionCount,
    focusInstructions: focusInstructionsFor(totalChapters, questionCount),
  }
}
