import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { BookMeta, Toc } from '../schemas.js'
import { buildServer } from '../index.js'
import * as store from '../services/book-store.js'

// Shared harness for the route characterization suite (server/routes/*.characterization.test.ts).
//
// Every test builds a real, fully-wired Fastify instance via buildServer()
// (see its JSDoc in server/index.ts) and drives it with fastify.inject, so
// characterization tests exercise actual route registration, hooks, and
// error handling without ever binding a port. server/test/setup-env.ts
// (a vitest setupFile) has already pointed TUTOR_DATA_DIR at a fresh temp
// directory and stripped every AI provider key before this module loads.

/** A fresh, fully-wired instance that has not listened and has not run crash recovery. */
export async function createTestServer(): Promise<FastifyInstance> {
  return await buildServer()
}

/** The per-test-file temp data directory set up by setup-env.ts. */
export function dataDir(): string {
  return process.env.TUTOR_DATA_DIR!
}

const DEFAULT_TOC: Toc = {
  chapters: [
    { title: 'Chapter One', description: 'The first chapter.' },
    { title: 'Chapter Two', description: 'The second chapter.' },
  ],
}

const DEFAULT_CHAPTER_ONE = '# Chapter One\n\nThis is the seeded content for chapter one.\n'

/**
 * Seeds a book — meta.yml, toc.yml, and chapters/01.md — entirely through
 * book-store.js (never raw fs), so fixtures always go through the same
 * validation and atomic-write path as production code. Returns the saved
 * meta so callers can read back the generated id. Pass a partial BookMeta
 * to override any default field, e.g. seedBook({ status: 'generating' }).
 */
export async function seedBook(partial: Partial<BookMeta> = {}): Promise<BookMeta> {
  const id = partial.id ?? `seed-${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const meta: BookMeta = {
    id,
    title: 'Seeded Test Book',
    prompt: 'Learn something for the purposes of a test.',
    status: 'reading',
    totalChapters: 2,
    generatedUpTo: 1,
    createdAt: now,
    updatedAt: now,
    tags: [],
    audioGeneratedChapters: [],
    ...partial,
  }
  await store.saveBook(meta)
  await store.saveToc(id, DEFAULT_TOC)
  await store.saveChapter(id, 1, DEFAULT_CHAPTER_ONE)
  return meta
}
