import { useEffect, useState } from 'react'
import { checkHealth } from '@client/api'
import { HEALTH_POLL_MS } from '@client/lib/constants'

/**
 * Polls server reachability so the toolbar can disable New Book and Import
 * while the server is unreachable. checkHealth() already swallows a failed
 * request into `false`, so nothing here needs its own try/catch.
 */
export function useHealthCheck(): boolean {
  const [serverAvailable, setServerAvailable] = useState(true)

  useEffect(() => {
    const check = async () => {
      setServerAvailable(await checkHealth())
    }
    check()
    const interval = setInterval(check, HEALTH_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  return serverAvailable
}
