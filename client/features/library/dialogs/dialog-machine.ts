import type { EpubPreview, LibraryBook } from '@shared/responses'

/**
 * One slot for whichever library dialog is showing, and one for whichever
 * context menu is showing.
 *
 * The library can show sixteen dialogs. Tracking them as sixteen independent
 * pieces of state made "two dialogs open at once" and "dialog open with the
 * previous dialog's payload" both representable, and neither is a state the
 * UI has any meaning for. A single tagged union removes them.
 */

/** Every dialog the library can show, each carrying exactly what it needs. */
export type LibraryDialog =
  | { kind: 'wizard' }
  | { kind: 'apiKey' }
  | { kind: 'rename'; book: LibraryBook; title: string; subtitle: string }
  | { kind: 'renameSeries'; seriesName: string; books: LibraryBook[]; newName: string }
  | { kind: 'delete'; book: LibraryBook; input: string }
  | { kind: 'reset'; book: LibraryBook; input: string }
  | { kind: 'rate'; book: LibraryBook; rating: number }
  | { kind: 'overview'; book: LibraryBook }
  | { kind: 'cover'; book: LibraryBook }
  | { kind: 'editTags'; book: LibraryBook }
  | { kind: 'setSeries'; book: LibraryBook }
  | { kind: 'generateAll'; book: LibraryBook; taskId: string }
  | { kind: 'audiobookDownload'; missingBytes: number; missing: { model: boolean; ffmpeg: boolean } }
  | { kind: 'audiobookVoice'; book: LibraryBook; mode: 'firstTime' | 'normal' | 'regenerate' }
  | { kind: 'audiobookRegenerate'; book: LibraryBook }
  | { kind: 'import'; preview: EpubPreview; fileBase64: string; filename: string }

/** A right-click menu, positioned where the click happened. */
export type LibraryMenu =
  | { kind: 'book'; book: LibraryBook; x: number; y: number }
  | { kind: 'series'; seriesName: string; books: LibraryBook[]; x: number; y: number }

/**
 * The fields a dialog lets the user type into before confirming. Only these
 * can be edited in place, which is why the patch names them rather than being
 * a partial of the whole union.
 */
interface DialogDraft {
  title?: string
  subtitle?: string
  input?: string
  rating?: number
  newName?: string
}

export type DialogAction =
  | { type: 'open'; dialog: LibraryDialog }
  | { type: 'edit'; patch: DialogDraft }
  | { type: 'close' }
  | { type: 'openMenu'; menu: LibraryMenu }
  | { type: 'closeMenu' }

export interface DialogState {
  /** The dialog currently showing. */
  dialog: LibraryDialog | null
  /**
   * The dialog that was just dismissed, kept only until it finishes fading.
   *
   * Several of these dialogs are always mounted and animate out over a
   * hundred milliseconds. Dropping the payload the moment they close would
   * make them render empty for the length of that animation, which reads as a
   * flicker rather than a fade.
   */
  exiting: LibraryDialog | null
  /** The context menu currently showing, which opens and closes independently of dialogs. */
  menu: LibraryMenu | null
}

export const emptyDialogState: DialogState = { dialog: null, exiting: null, menu: null }

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'open':
      // A dialog is always reached through a context menu or a toolbar
      // button, so opening one dismisses the menu. Clearing exiting too stops
      // a payload from a previous dialog resurfacing behind this one.
      return { dialog: action.dialog, exiting: null, menu: null }

    case 'edit':
      // Deliberately ignores a dialog that is already closing, so a keystroke
      // landing during the fade cannot revive it.
      return state.dialog ? { ...state, dialog: { ...state.dialog, ...action.patch } } : state

    case 'close':
      return { ...state, dialog: null, exiting: state.dialog ?? state.exiting }

    case 'openMenu':
      return { ...state, menu: action.menu }

    case 'closeMenu':
      return { ...state, menu: null }
  }
}

/** Whether a given dialog is the one currently showing. */
export function isOpen(state: DialogState, kind: LibraryDialog['kind']): boolean {
  return state.dialog?.kind === kind
}

/**
 * The payload for a given dialog, including while it fades out.
 *
 * Reading the exiting slot as a fallback is what lets an always-mounted
 * dialog keep rendering its content through the exit animation.
 */
export function payloadOf<TKind extends LibraryDialog['kind']>(
  state: DialogState,
  kind: TKind,
): Extract<LibraryDialog, { kind: TKind }> | null {
  const candidate = state.dialog ?? state.exiting
  return candidate?.kind === kind ? (candidate as Extract<LibraryDialog, { kind: TKind }>) : null
}
