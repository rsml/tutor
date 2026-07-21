import type { Page } from '@playwright/test'
import { library } from './library.js'

/**
 * This covers the audiobook install gate and generation flow, journey (f)'s subject.
 *
 * "Generate audiobook" lives only on the library's book context menu
 * (right-click a card, see client/features/library/dialogs/BookContextMenu.tsx).
 * It never appears inside the reader. ReaderPage's ChapterListenButton only
 * ever shows a Listen control once a chapter's audio already exists, and it
 * has no control that starts generation. The menu item itself is disabled
 * until a book is fully generated (generatedUpTo === totalChapters), so
 * every journey using this file seeds a complete book.
 *
 * Every locator here is role- or text-based, matching the rest of this
 * suite (see library.ts's own doc for why).
 */
export function audiobook(page: Page) {
  return {
    /** Right-clicks a book card by title to open its context menu. */
    async openBookMenu(title: string): Promise<void> {
      await library(page).card(title).click({ button: 'right' })
    },

    /**
     * The context menu's "Generate audiobook" item. It is only rendered
     * enabled once the book is fully generated. A partially generated book
     * renders a disabled button with the same visible words plus a second
     * line ("Finish generating chapters first"), so callers that seed a
     * complete book never see that variant.
     */
    generateAudiobookMenuItem() {
      return page.getByRole('button', { name: 'Generate audiobook', exact: true })
    },

    /**
     * The missing-components install gate (AudiobookDownloadModal). Scoped
     * as a dialog by its accessible name, which base-ui/react's Dialog wires
     * from DialogTitle via aria-labelledby.
     */
    downloadGateDialog() {
      return page.getByRole('dialog', { name: 'Download Missing Components' })
    },

    /**
     * The gate's own "Download (N MB)" button. This locator exists only so
     * a test can assert the button is present and named correctly, never so
     * a test can press it. See audiobook.spec.ts for why nothing here ever
     * calls `.click()` on it.
     */
    downloadGateButton() {
      return this.downloadGateDialog().getByRole('button', { name: /^Download \(\d+ MB\)$/ })
    },

    /**
     * The per-book voice + speed picker (AudiobookVoiceModal), opened once
     * the engine already reports installed. Its "Start generation" button
     * starts disabled until the fake voice catalogue loads, so `.click()`
     * naturally waits that out via Playwright's own actionability checks.
     */
    startGenerationButton() {
      return page.getByRole('button', { name: 'Start generation' })
    },

    /**
     * The reader's per-chapter Listen control (ChapterListenButton). Renders
     * only once that chapter's narration has actually completed, so waiting
     * on this is itself the proof the fake synthesis pipeline ran.
     */
    listenButton() {
      return page.getByRole('button', { name: 'Listen to this chapter' })
    },

    /** Only present once the slide-out player panel (with its <audio> element) has rendered. */
    closePlayerButton() {
      return page.getByRole('button', { name: 'Close player' })
    },
  }
}
