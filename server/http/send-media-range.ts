import type { FastifyReply } from 'fastify'
import { STATUS_NOT_FOUND, STATUS_RANGE_NOT_SATISFIABLE } from './status.js'

/**
 * Serve a media file with HTTP Range support. Writes via reply.raw so
 * Fastify doesn't re-derive Content-Length from a stream (it ends up
 * at 0 for streams, breaking <audio> playback). Sets CORS expose
 * headers so cross-origin <audio> elements can read media metadata.
 *
 * Used by the audiobook routes in server/routes/books.ts to serve the
 * M4B file and legacy per-chapter MP3s with seek support.
 */
export async function sendMediaWithRange(
  reply: FastifyReply,
  rangeHeader: string | undefined,
  filePath: string,
  contentType: string,
  opts: { disposition?: string } = {},
): Promise<void> {
  const { existsSync, createReadStream } = await import('node:fs')
  const { stat: fsStat } = await import('node:fs/promises')

  if (!existsSync(filePath)) {
    reply.status(STATUS_NOT_FOUND).send({ error: 'File not found' })
    return
  }
  const fileStat = await fsStat(filePath)
  const etag = `"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(36)}"`

  let start = 0
  let end = fileStat.size - 1
  let status = 200
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader)
    if (!match) {
      reply.status(STATUS_RANGE_NOT_SATISFIABLE).send({ error: 'Invalid Range header' })
      return
    }
    start = parseInt(match[1], 10)
    end = match[2] ? parseInt(match[2], 10) : fileStat.size - 1
    if (start >= fileStat.size || end >= fileStat.size || start > end) {
      reply.raw.setHeader('Content-Range', `bytes */${fileStat.size}`)
      reply.status(STATUS_RANGE_NOT_SATISFIABLE).send({ error: 'Range not satisfiable' })
      return
    }
    status = 206
  }

  const length = end - start + 1
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  }
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${fileStat.size}`
  }
  if (opts.disposition) {
    headers['Content-Disposition'] = opts.disposition
  }

  // reply.hijack() prevents Fastify from touching the response further;
  // we own writeHead + pipe ourselves so the body actually flows.
  reply.hijack()
  reply.raw.writeHead(status, headers)
  const stream = createReadStream(filePath, { start, end })
  stream.on('error', () => { reply.raw.destroy() })
  stream.pipe(reply.raw)
}
