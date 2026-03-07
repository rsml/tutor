import { homedir } from 'node:os'
import { join } from 'node:path'

export function getDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tutor')
  }
  // XDG for Linux
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdgData, 'tutor')
}
