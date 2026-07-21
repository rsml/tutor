/**
 * Builds the `redux-state.json` file the Electron main process reads on
 * behalf of redux-persist.
 *
 * The nesting is redux-persist's, not this project's, and it is worth
 * spelling out because it is easy to get wrong from the outside. The file is
 * an object keyed by storage key. Under `persist:tutor` sits a JSON STRING
 * whose parsed value is an object with one entry per persisted slice, and
 * each of THOSE values is itself a JSON string. Two levels of stringification,
 * because redux-persist serialises each slice independently so that one
 * corrupt slice cannot take the rest down with it.
 *
 * `client/store/persist.ts` sets `key: 'tutor'` and swaps its storage for
 * Electron IPC when `window.electronAPI.storageGet` exists, and
 * `electron/main.ts` answers that IPC out of this file.
 *
 * Only the reading position is written here, deliberately. redux-persist's
 * default reconciler merges one level deep, meaning a persisted slice
 * REPLACES that slice's initial state wholesale rather than being merged into
 * it. Writing a partial `settings` slice therefore deletes the provider
 * configuration the client reads on its first render, and the renderer dies
 * with "Cannot read properties of undefined". Found the hard way. Persist a
 * slice here only if the fixture supplies every field that slice's initial
 * state declares.
 */

export interface ReduxStateFixture {
  /** Where the reader resumes. Omit it to make the reader fall back to the server-derived position. */
  position?: { bookId: string; chapter: number; section: number }
}

/** The parsed contents of `redux-state.json` for the given fixture. */
export function buildReduxState(fixture: ReduxStateFixture): Record<string, string> {
  const slices: Record<string, string> = {
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  }

  if (fixture.position) {
    const { bookId, chapter, section } = fixture.position
    slices.readingProgress = JSON.stringify({
      positions: { [bookId]: { chapter, section, lastReadAt: new Date().toISOString() } },
      furthest: { [bookId]: chapter },
    })
  }

  return { 'persist:tutor': JSON.stringify(slices) }
}
