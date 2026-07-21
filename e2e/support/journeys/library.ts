import type { Page } from '@playwright/test'

/**
 * The library screen, expressed as intent rather than as selectors.
 *
 * Every locator here is role- or text-based. None is a CSS class and none is
 * a `data-testid`, because Phase 3 gave every icon-only control an accessible
 * name and addressing the UI the way a screen reader does makes this suite
 * double as an accessibility net. If a journey cannot reach a control this
 * way, the finding is that the control has no accessible name, and the fix
 * belongs in the component rather than here.
 */
export function library(page: Page) {
  // Two controls open the wizard, one in the header and one in the empty
  // state. The header one is always present, so it is the one journeys use
  // and the empty-state duplicate never makes a locator ambiguous.
  const newBook = () => page.getByRole('banner').getByRole('button', { name: 'New Book' })

  return {
    /** Waits for the library to be interactive, which is when the New Book control exists. */
    async waitForReady(): Promise<void> {
      await newBook().waitFor()
    },

    /** Opens the create-book wizard. */
    async openWizard(): Promise<void> {
      await newBook().click()
    },

    /**
     * The card for one book, located by its title.
     *
     * Located by text and not by role, because a book card is a `div` with an
     * `onClick` and carries no role and no accessible name. That is a real
     * accessibility gap, reported to the architect rather than patched here,
     * since this phase changes no production file. Clicking the title works
     * because the click bubbles to the card that handles it.
     */
    card(title: string) {
      return page.getByText(title, { exact: true }).first()
    },

    /** Opens a book in the reader. */
    async openBook(title: string): Promise<void> {
      await this.card(title).click()
    },
  }
}
