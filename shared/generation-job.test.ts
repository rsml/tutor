import { describe, expect, it } from 'vitest'
import type { TaskType } from './responses.js'
import {
  GENERATION_JOB_TYPES,
  GenerationJobTypeSchema,
  type GenerationJobType,
  GenerationJobCheckpointSchema,
  GenerationJobParamsSchema,
  GenerationJobSchema,
  type GenerationJob,
} from './domain.js'

/**
 * Pins the on-disk shape of an in-flight background job: the type union
 * that widens TaskType, the checkpoint a job can resume from, the request
 * parameters it can carry, and the record those combine into. These types
 * do not exist in shared/domain.ts yet, this file is written against the
 * shape server/ports/job-journal.ts is about to persist.
 */

describe('GENERATION_JOB_TYPES / GenerationJobTypeSchema', () => {
  it('has exactly six members, the five TaskTypes plus generate-chapter', () => {
    const taskTypes: TaskType[] = [
      'generate-all',
      'generate-epub',
      'generate-cover',
      'install-audiobook',
      'generate-audiobook',
    ]
    expect(GENERATION_JOB_TYPES).toHaveLength(6)
    expect([...GENERATION_JOB_TYPES].sort()).toEqual([...taskTypes, 'generate-chapter'].sort())
  })

  it('parses every one of its own members', () => {
    for (const type of GENERATION_JOB_TYPES) {
      expect(GenerationJobTypeSchema.safeParse(type).success).toBe(true)
    }
    expect(GenerationJobTypeSchema.safeParse('not-a-real-type').success).toBe(false)
  })

  // Compile-time-only guard: every TaskType (shared/responses.ts) must widen
  // to a GenerationJobType (shared/domain.ts), so the background-task tray's
  // type union and this journal's job-type union can never silently drift
  // apart, a type added to one without the other fails this assignment. It
  // lives here, in a test, rather than beside either type, because
  // shared/domain.ts cannot import shared/responses.ts without creating a
  // cycle, responses.ts already imports from domain.ts. Editing one union
  // without the other fails `pnpm typecheck` on the line below, not this
  // file's runtime assertion, which exists only so vitest has something to
  // run in this block.
  const _widens: GenerationJobType = null as unknown as TaskType
  void _widens

  it('is a compile-time-only guard pinning TaskType as a subset of GenerationJobType, see the comment above', () => {
    expect(true).toBe(true)
  })
})

describe('GenerationJobCheckpointSchema', () => {
  it('parses none, chapters with a through count, and narration-complete', () => {
    expect(GenerationJobCheckpointSchema.safeParse({ kind: 'none' }).success).toBe(true)
    expect(GenerationJobCheckpointSchema.safeParse({ kind: 'chapters', through: 3 }).success).toBe(true)
    expect(GenerationJobCheckpointSchema.safeParse({ kind: 'narration-complete' }).success).toBe(true)
  })

  it('rejects chapters with no through, and an unknown kind', () => {
    expect(GenerationJobCheckpointSchema.safeParse({ kind: 'chapters' }).success).toBe(false)
    expect(GenerationJobCheckpointSchema.safeParse({ kind: 'not-a-real-kind' }).success).toBe(false)
  })
})

describe('GenerationJobParamsSchema', () => {
  it('accepts the real restart parameters, all optional, and an empty object', () => {
    expect(GenerationJobParamsSchema.safeParse({}).success).toBe(true)
    expect(
      GenerationJobParamsSchema.safeParse({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        quizProvider: 'openai',
        quizModel: 'gpt-4o',
        quizLength: 3,
        voiceId: 'onyx',
        speed: 1.0,
        targetChapterNum: 5,
      }).success,
    ).toBe(true)
  })

  // The guard that keeps a provider credential out of a file on disk. The
  // journal this schema backs is written unencrypted, unlike KeyVault, so
  // an API key must never be a field a job's params can carry, no matter
  // how convenient it would be for restarting a job without re-prompting.
  it('rejects an object containing apiKey, and any other unknown key, so the guard is general rather than a blocklist of one', () => {
    expect(GenerationJobParamsSchema.safeParse({ provider: 'anthropic', apiKey: 'sk-should-not-be-here' }).success).toBe(false)
    expect(GenerationJobParamsSchema.safeParse({ someUnrelatedField: 'nope' }).success).toBe(false)
  })
})

describe('GenerationJobSchema', () => {
  const FULL_JOB: GenerationJob = {
    id: 'job-1',
    type: 'generate-chapter',
    bookId: 'book-1',
    bookTitle: 'Test Book',
    status: 'running',
    checkpoint: { kind: 'chapters', through: 2 },
    params: { provider: 'anthropic', targetChapterNum: 3, voiceId: 'onyx' },
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:05:00.000Z',
  }

  it('round trips a full record', () => {
    const result = GenerationJobSchema.safeParse(FULL_JOB)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(FULL_JOB)
    }
  })

  it('rejects a record missing checkpoint', () => {
    const { checkpoint: _checkpoint, ...withoutCheckpoint } = FULL_JOB
    expect(GenerationJobSchema.safeParse(withoutCheckpoint).success).toBe(false)
  })
})
