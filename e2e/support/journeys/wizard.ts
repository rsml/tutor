import type { Page } from '@playwright/test'

/**
 * The create-book flow, from the New Book dialog through the streamed table
 * of contents to the approval that generates chapter 1.
 *
 * Two screens, one intent. `WizardModal` collects the topic and
 * `CreationView` shows the streaming result, but a reader experiences them as
 * one act, so they share one page object.
 *
 * The table of contents renders as markdown with no landmark role of its
 * own, so it is addressed by the text it contains rather than by the class
 * on its container. Text is what a reader sees, a class is an implementation
 * detail, and matching the class would make a purely visual refactor break
 * the suite.
 */
export function wizard(page: Page) {
  return {
    /** Fills the topic (and optional details) and submits, which opens the table-of-contents stream. */
    async submit({ topic, details }: { topic: string; details?: string }): Promise<void> {
      await page.getByLabel('Topic').fill(topic)
      if (details !== undefined) await page.getByLabel(/^Details/).fill(details)
      await page.getByRole('button', { name: 'Create' }).click()
    },

    /** Resolves once the stream has finished and the approve control is offered. */
    async waitForTocApproval(): Promise<void> {
      await page.getByRole('button', { name: /Generate Chapter 1/ }).waitFor()
    },

    /** Approves the table of contents, which starts chapter 1. */
    async approveToc(): Promise<void> {
      await page.getByRole('button', { name: /Generate Chapter 1/ }).click()
    },

    /** Opens the revision panel for editing the table of contents. */
    async openTocEditor(): Promise<void> {
      await page.getByRole('button', { name: 'Edit Table of Contents' }).click()
    },

    /** One chapter entry in the rendered table of contents, located by its title. */
    tocEntry(title: string) {
      return page.getByText(title, { exact: false }).first()
    },
  }
}
