/**
 * Reveals a file on disk in the OS's native file manager.
 *
 * Abstracts the platform switch server/adapters/os-file-manager.ts runs for
 * the POST /api/books/:id/audiobook/reveal route in
 * server/routes/audiobook-generation.ts, which spawns `open -R` on
 * macOS, `explorer.exe /select,` on Windows, or `xdg-open` on the parent
 * directory on Linux, depending on process.platform. That route runs the
 * reveal on the server, which for this single-user app is the user's own
 * machine, so it does not depend on Electron IPC reaching the renderer.
 *
 * Today's implementation is best-effort: it wraps the spawn call in a
 * try/catch, and on failure it swallows the error rather than throwing,
 * leaving the caller to fall back (clipboard, IPC, or just showing the
 * path). This port keeps that contract. reveal() resolves once the OS has
 * been asked, regardless of whether the OS-side command actually
 * succeeded.
 */
export interface OsFileManager {
  reveal(path: string): Promise<void>
}
