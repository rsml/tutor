import { expect, type Locator, type Page } from '@playwright/test'
import type { QuizFixtureQuestion } from '../../fixtures/quiz.js'

/**
 * The end-of-chapter quiz and the feedback form that follows it, the two
 * screens standing between one chapter and the next in the adaptive loop.
 * `reader.ts`'s `finishChapter()` is what lands here instead of on the next
 * chapter's prose, see its own doc comment for why.
 *
 * CRITICAL: `server/services/generate-quiz.ts` shuffles every question's
 * options with `Math.random()` before saving, so the on-screen A/B/C/D order
 * is neither the fixture's authored order nor stable across runs. Every
 * locator below addresses an option by its exact text, never by its letter
 * or its position, and a journey must reach for `correctOptionFor`/
 * `wrongOptionFor` in `e2e/fixtures/quiz.ts` to decide which text to click.
 * Reintroducing a positional locator (the first option, "the A choice", the
 * nth `.option` row) will pass locally and flake in CI the moment
 * `Math.random()` happens to pick a different order.
 */
export function quiz(page: Page) {
  return {
    /** Resolves once the quiz panel is on screen. */
    async waitForQuiz(): Promise<void> {
      await expect(page.getByRole('heading', { level: 2, name: 'Quick Quiz' })).toBeVisible()
    },

    /** A question's prompt, located by the fixture's own wording rather than its "1. " index prefix. */
    questionText(question: QuizFixtureQuestion): Locator {
      return page.getByText(question.question, { exact: false })
    },

    /**
     * One option row, located by its exact option text. The visible
     * A/B/C/D badge and the option text are separate sibling `<span>`s with
     * no shared accessible container, but Playwright's text engine matches
     * the innermost element whose own text equals the query, which is the
     * option-text span itself. Clicking it still selects the option because
     * the click bubbles up to the row's `onClick`, the same reasoning
     * `library.ts`'s `card()` documents for a title click landing on a card.
     */
    option(text: string): Locator {
      return page.getByText(text, { exact: true })
    },

    /** Selects an answer for one question by the option's exact text (see `option` above). */
    async answer(optionText: string): Promise<void> {
      await this.option(optionText).click()
    },

    /** Reveals correctness. Playwright's actionability check waits out the button's own disabled-until-all-answered state. */
    async reveal(): Promise<void> {
      await page.getByRole('button', { name: 'Reveal', exact: true }).click()
    },

    /** Dismisses the quiz unanswered, going straight to feedback. */
    async skip(): Promise<void> {
      await page.getByRole('button', { name: 'Skip', exact: true }).click()
    },

    /** Confirms the reveal and moves on to the feedback form. */
    async confirm(): Promise<void> {
      await page.getByRole('button', { name: 'OK', exact: true }).click()
    },
  }
}

/**
 * The feedback form shown after the quiz.
 *
 * Its two textareas are unlabelled in the accessible sense:
 * `FeedbackForm.tsx` puts each `<label>` as a plain sibling of its
 * `<textarea>` rather than wrapping it, and neither element carries a
 * `for`/`id` pair or an `aria-label`, so `getByLabel` cannot resolve either
 * field. That is a real accessibility gap, reported rather than patched here
 * since this phase changes no production file. This page object locates
 * each textarea by its placeholder instead, which is still a text-based,
 * non-CSS locator.
 */
export function feedback(page: Page) {
  return {
    /** Resolves once the feedback form for this chapter is on screen. */
    async waitForForm(chapterNum: number): Promise<void> {
      await expect(page.getByRole('heading', { name: `Chapter ${chapterNum} Feedback` })).toBeVisible()
    },

    /** Types distinctive text into both fields, so a journey can find it again in a saved Feedback record or a generation prompt. */
    async fill(liked: string, disliked: string): Promise<void> {
      await page.getByPlaceholder('Examples, tone, depth, analogies...').fill(liked)
      await page.getByPlaceholder('Too fast, too slow, confusing section...').fill(disliked)
    },

    /** Submits the form, which triggers the next chapter's generation. */
    async submit(label = 'Generate Next Chapter'): Promise<void> {
      await page.getByRole('button', { name: label }).click()
    },
  }
}
