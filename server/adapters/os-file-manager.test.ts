import { describe, expect, it, vi } from 'vitest'
import { createOsFileManager } from './os-file-manager.js'
import { describeOsFileManagerContract } from '../ports/os-file-manager.contract.js'

/** A spawn double that never launches a real process. */
function fakeSpawn() {
  return vi.fn(() => ({ unref: vi.fn() }))
}

describeOsFileManagerContract('real adapter', () => createOsFileManager({ spawn: fakeSpawn(), platform: 'darwin' }))

describe('createOsFileManager (whitebox)', () => {
  it('on darwin, reveals with `open -R <path>`', async () => {
    const spawn = fakeSpawn()
    const manager = createOsFileManager({ spawn, platform: 'darwin' })

    await manager.reveal('/books/some-book/audiobook.m4b')

    expect(spawn).toHaveBeenCalledWith(
      'open',
      ['-R', '/books/some-book/audiobook.m4b'],
      { detached: true, stdio: 'ignore' },
    )
  })

  it('on win32, reveals with `explorer.exe /select,<path>`', async () => {
    const spawn = fakeSpawn()
    const manager = createOsFileManager({ spawn, platform: 'win32' })

    await manager.reveal('C:\\books\\some-book\\audiobook.m4b')

    expect(spawn).toHaveBeenCalledWith(
      'explorer.exe',
      ['/select,', 'C:\\books\\some-book\\audiobook.m4b'],
      { detached: true, stdio: 'ignore' },
    )
  })

  it('on linux, opens the parent directory with `xdg-open`', async () => {
    const spawn = fakeSpawn()
    const manager = createOsFileManager({ spawn, platform: 'linux' })

    await manager.reveal('/books/some-book/audiobook.m4b')

    expect(spawn).toHaveBeenCalledWith(
      'xdg-open',
      ['/books/some-book'],
      { detached: true, stdio: 'ignore' },
    )
  })

  it('calls unref on the spawned process so it does not keep the event loop alive', async () => {
    const unref = vi.fn()
    const spawn = vi.fn(() => ({ unref }))
    const manager = createOsFileManager({ spawn, platform: 'darwin' })

    await manager.reveal('/books/some-book/audiobook.m4b')

    expect(unref).toHaveBeenCalledTimes(1)
  })

  it('resolves rather than rejecting when spawn throws', async () => {
    const spawn = vi.fn(() => {
      throw new Error('no such command')
    })
    const manager = createOsFileManager({ spawn, platform: 'darwin' })

    await expect(manager.reveal('/books/some-book/audiobook.m4b')).resolves.toBeUndefined()
  })
})
