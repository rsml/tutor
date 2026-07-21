import { describe, it, expect } from 'vitest'
import type { LibraryBook } from '@shared/responses'
import { dialogReducer, emptyDialogState, isOpen, payloadOf } from './dialog-machine'

/**
 * The library shows sixteen dialogs and two context menus, and it used to
 * track them in twenty one separate pieces of component state. Most of the
 * bugs that shape lets through are the ones where two dialogs are open at
 * once, or where a dialog is open with the payload of the previous one.
 * Making the state one value at a time is what removes both.
 *
 * The exiting field is the part worth reading carefully. Several of these
 * dialogs are always mounted and fade out over a hundred milliseconds, so
 * clearing the payload the instant they close would make them flash empty on
 * the way out. That is a visual regression, and these tests are what stop it.
 */

const book = { id: 'ada', title: 'Ada' } as LibraryBook
const other = { id: 'grace', title: 'Grace' } as LibraryBook

describe('opening a dialog', () => {
  it('starts with nothing open', () => {
    expect(emptyDialogState.dialog).toBeNull()
    expect(emptyDialogState.exiting).toBeNull()
    expect(emptyDialogState.menu).toBeNull()
  })

  it('carries the payload the dialog needs', () => {
    const state = dialogReducer(emptyDialogState, {
      type: 'open',
      dialog: { kind: 'rename', book, title: 'Ada', subtitle: '' },
    })

    expect(isOpen(state, 'rename')).toBe(true)
    expect(payloadOf(state, 'rename')?.book.id).toBe('ada')
  })

  it('replaces whatever was open rather than stacking on it', () => {
    // Twenty one independent booleans allowed two dialogs to be open at once.
    // One slot makes that unrepresentable.
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'delete', book, input: '' } })
    state = dialogReducer(state, { type: 'open', dialog: { kind: 'reset', book: other, input: '' } })

    expect(isOpen(state, 'reset')).toBe(true)
    expect(isOpen(state, 'delete')).toBe(false)
  })

  it('dismisses an open context menu, since a dialog is always opened from one', () => {
    let state = dialogReducer(emptyDialogState, {
      type: 'openMenu',
      menu: { kind: 'book', book, x: 10, y: 20 },
    })
    state = dialogReducer(state, { type: 'open', dialog: { kind: 'editTags', book } })

    expect(state.menu).toBeNull()
  })

  it('clears any previously exiting dialog so a stale payload cannot resurface', () => {
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'overview', book } })
    state = dialogReducer(state, { type: 'close' })
    state = dialogReducer(state, { type: 'open', dialog: { kind: 'cover', book: other } })

    expect(state.exiting).toBeNull()
    expect(payloadOf(state, 'overview')).toBeNull()
  })
})

describe('editing a draft field', () => {
  it('updates the field being typed into', () => {
    let state = dialogReducer(emptyDialogState, {
      type: 'open',
      dialog: { kind: 'rename', book, title: 'Ada', subtitle: '' },
    })
    state = dialogReducer(state, { type: 'edit', patch: { title: 'Ada Lovelace' } })

    expect(payloadOf(state, 'rename')?.title).toBe('Ada Lovelace')
    expect(payloadOf(state, 'rename')?.subtitle).toBe('')
  })

  it('leaves the rest of the payload alone', () => {
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'rate', book, rating: 0 } })
    state = dialogReducer(state, { type: 'edit', patch: { rating: 4 } })

    expect(payloadOf(state, 'rate')?.book.id).toBe('ada')
    expect(payloadOf(state, 'rate')?.rating).toBe(4)
  })

  it('does nothing when no dialog is open', () => {
    const state = dialogReducer(emptyDialogState, { type: 'edit', patch: { title: 'ignored' } })

    expect(state.dialog).toBeNull()
  })

  it('never edits a dialog that is on its way out', () => {
    // A keystroke landing during the fade must not revive the closing dialog.
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'delete', book, input: 'Ad' } })
    state = dialogReducer(state, { type: 'close' })
    state = dialogReducer(state, { type: 'edit', patch: { input: 'Ada' } })

    expect(state.dialog).toBeNull()
    expect(payloadOf(state, 'delete')?.input).toBe('Ad')
  })
})

describe('closing a dialog', () => {
  it('reports the dialog as closed immediately', () => {
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'overview', book } })
    state = dialogReducer(state, { type: 'close' })

    expect(isOpen(state, 'overview')).toBe(false)
  })

  it('keeps the payload readable while the dialog fades out', () => {
    // Without this the always-mounted dialogs render empty for the hundred
    // milliseconds of their exit animation, which reads as a flicker.
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'overview', book } })
    state = dialogReducer(state, { type: 'close' })

    expect(payloadOf(state, 'overview')?.book.id).toBe('ada')
  })

  it('survives being closed twice, which a dialog does on escape and on overlay click', () => {
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'setSeries', book } })
    state = dialogReducer(state, { type: 'close' })
    state = dialogReducer(state, { type: 'close' })

    expect(payloadOf(state, 'setSeries')?.book.id).toBe('ada')
  })

  it('leaves an open context menu alone, since the two close independently', () => {
    let state = dialogReducer(emptyDialogState, { type: 'openMenu', menu: { kind: 'book', book, x: 1, y: 2 } })
    state = dialogReducer(state, { type: 'close' })

    expect(state.menu).not.toBeNull()
  })
})

describe('context menus', () => {
  it('remembers where a book menu was opened', () => {
    const state = dialogReducer(emptyDialogState, {
      type: 'openMenu',
      menu: { kind: 'book', book, x: 120, y: 340 },
    })

    expect(state.menu).toEqual({ kind: 'book', book, x: 120, y: 340 })
  })

  it('replaces a book menu with a series menu rather than showing both', () => {
    let state = dialogReducer(emptyDialogState, { type: 'openMenu', menu: { kind: 'book', book, x: 1, y: 2 } })
    state = dialogReducer(state, {
      type: 'openMenu',
      menu: { kind: 'series', seriesName: 'Pioneers', books: [book, other], x: 3, y: 4 },
    })

    expect(state.menu?.kind).toBe('series')
  })

  it('closes on request', () => {
    let state = dialogReducer(emptyDialogState, { type: 'openMenu', menu: { kind: 'book', book, x: 1, y: 2 } })
    state = dialogReducer(state, { type: 'closeMenu' })

    expect(state.menu).toBeNull()
  })
})

describe('payloadOf', () => {
  it('answers null for a dialog that was never opened', () => {
    expect(payloadOf(emptyDialogState, 'wizard')).toBeNull()
  })

  it('answers null for a different dialog than the one that is open', () => {
    const state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'cover', book } })

    expect(payloadOf(state, 'rename')).toBeNull()
  })

  it('prefers the open dialog over one still fading out', () => {
    let state = dialogReducer(emptyDialogState, { type: 'open', dialog: { kind: 'cover', book } })
    state = dialogReducer(state, { type: 'close' })
    state = dialogReducer(state, { type: 'open', dialog: { kind: 'cover', book: other } })

    expect(payloadOf(state, 'cover')?.book.id).toBe('grace')
  })
})
