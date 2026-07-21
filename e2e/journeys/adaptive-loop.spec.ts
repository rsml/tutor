import { chapterMarker } from '../fixtures/chapter-stream.js'
import { QUIZ_QUESTIONS, correctOptionFor, wrongOptionFor } from '../fixtures/quiz.js'
import { TOC_BOOK_TITLE } from '../fixtures/toc-stream.js'
import { expect, test } from '../support/app.js'
import { library } from '../support/journeys/library.js'
import { reader } from '../support/journeys/reader.js'
import { quiz, feedback } from '../support/journeys/quiz.js'
import { bookRepository, seedBook } from '../support/seed.js'

/**
 * Journey (b): the adaptive loop, split across two tests on purpose.
 *
 * Everything downstream of a chapter's quiz and feedback works. The quiz
 * renders the fixture questions, a wrong answer is recorded, submitting
 * feedback triggers chapter 2's generation, and the scripted model records a
 * chapter-2 prompt that contains both feedback markers and the wrongly
 * answered question's text. TEST 1 below proves exactly that, and it is the
 * single most important assertion in this suite, because it is what tells
 * the adaptive loop apart from a button that merely looks like it worked.
 *
 * What does not work today is the browser ever finding out. Generation is
 * server-side truth, the model is genuinely called and the chapter is
 * genuinely saved to disk, but the SSE reply meant to carry that content
 * back to the reader is closed with zero bytes almost immediately. This is a
 * real production bug in server/routes/generation.ts's pipeHubToSse, which
 * listens for the incoming request's own close event rather than the
 * response's, filed as github.com/rsml/tutor/issues/50 and out of scope for
 * this phase. TEST 1 therefore never asserts on-screen chapter 2 content and
 * never waits on it, it waits on the model's own recorded request instead.
 * TEST 2 is the on-screen assertion, quarantined with test.fixme until issue
 * 50 lands, so a reader does not mistake TEST 1's silence on rendering for
 * an oversight.
 *
 * See support/journeys/quiz.ts for why every quiz option below is located by
 * exact text rather than position. generate-quiz.ts shuffles the options
 * with Math.random() before saving, so the on-screen order is neither the
 * fixture's authored order nor stable across runs.
 */
test('quiz answers and chapter feedback shape the chapter-2 prompt the model actually receives', async ({ page, app, model }) => {
  const book = await seedBook(app.dataDir, { generatedUpTo: 1 })

  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openBook(TOC_BOOK_TITLE)

  await reader(page).waitForChapter()
  await reader(page).finishChapter()

  // The quiz, not chapter 2, is what "Next Chapter" opens at the end of a
  // chapter. Every fixture question must be visible before any is answered.
  await quiz(page).waitForQuiz()
  for (const question of QUIZ_QUESTIONS) {
    await expect(quiz(page).questionText(question)).toBeVisible()
  }

  const [wronglyAnswered, ...restAnsweredCorrectly] = QUIZ_QUESTIONS
  await quiz(page).answer(wrongOptionFor(wronglyAnswered))
  for (const question of restAnsweredCorrectly) {
    await quiz(page).answer(correctOptionFor(question))
  }
  await quiz(page).reveal()
  await quiz(page).confirm()

  const LIKED_MARKER = 'Glimmercrash pinwheel marker, the tidal bulge analogy landed instantly'
  const DISLIKED_MARKER = 'Wobbletrail marker, the angular momentum section moved too fast'

  await feedback(page).waitForForm(1)
  await feedback(page).fill(LIKED_MARKER, DISLIKED_MARKER)
  await feedback(page).submit()

  // Generation is server-side truth even though the browser never learns it
  // finished (issue 50), so the wait is on the model's own recorded request
  // rather than on anything the page renders.
  await expect.poll(() => model.requests.streamText.some(r => (r.prompt ?? '').includes('This is Chapter 2 of'))).toBe(true)

  // The wrong answer is recorded on disk against chapter 1's feedback, not
  // just reflected back in the UI.
  const savedFeedback = await bookRepository(app.dataDir).getFeedback(book.id, 1)
  expect(savedFeedback.feedback.liked).toBe(LIKED_MARKER)
  expect(savedFeedback.feedback.disliked).toBe(DISLIKED_MARKER)
  expect(savedFeedback.quiz.score).toBe(2)
  expect(savedFeedback.quiz.questions[0].correct).toBe(false)
  expect(savedFeedback.quiz.questions[1].correct).toBe(true)
  expect(savedFeedback.quiz.questions[2].correct).toBe(true)

  // THE KEY ASSERTION. generate-next-chapter.ts builds chapter 2's prompt
  // from getAllFeedback(), wrapping liked/disliked text in <reader_liked>/
  // <reader_disliked> tags and, when a quiz answer was wrong, adding a
  // "Struggled with: <question>" line. Finding this exact request and
  // checking its prompt is what proves the feedback loop feeds the next
  // chapter, rather than merely that a button was clicked.
  expect(model.requests.streamText).toHaveLength(1)
  const chapterTwo = model.requests.streamText.find(r => (r.prompt ?? '').includes('This is Chapter 2 of'))
  expect(chapterTwo?.prompt).toContain(LIKED_MARKER)
  expect(chapterTwo?.prompt).toContain(DISLIKED_MARKER)
  expect(chapterTwo?.prompt).toContain(wronglyAnswered.question)
})

test.fixme('renders chapter 2 in the reader once generation finishes', async ({ page, app }) => {
  // Quarantined by github.com/rsml/tutor/issues/50. pipeHubToSse closes the
  // SSE reply with zero bytes before the browser ever hears "done", so
  // chapter 2 never reaches the screen today. Flip back to test() once that
  // lands, nothing else here should need to change.
  await seedBook(app.dataDir, { generatedUpTo: 1 })

  await page.goto('/')
  await library(page).waitForReady()
  await library(page).openBook(TOC_BOOK_TITLE)

  await reader(page).waitForChapter()
  await reader(page).finishChapter()

  await quiz(page).waitForQuiz()
  for (const question of QUIZ_QUESTIONS) {
    await quiz(page).answer(correctOptionFor(question))
  }
  await quiz(page).reveal()
  await quiz(page).confirm()

  await feedback(page).waitForForm(1)
  await feedback(page).fill('liked', 'disliked')
  await feedback(page).submit()

  await expect(reader(page).prose(chapterMarker(2))).toBeVisible()
})
