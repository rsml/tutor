import { expect, it } from 'vitest'
import type { AiErrorKind } from '@shared/responses.js'
import type { TextGenerationErrorKind } from './text-generation.js'

/**
 * This file pins `AiErrorKind` in shared/responses.ts and
 * `TextGenerationErrorKind` in server/ports/text-generation.ts to the same
 * set of members. Neither type imports the other, since the client depends
 * on `AiErrorKind` without pulling in anything under server/, so nothing
 * else stops the two unions from drifting apart. Editing one union without
 * the other fails `pnpm typecheck` on the two assignments below, not this
 * file's runtime assertion. That assertion exists only so vitest has a
 * test to run in this file.
 */

const _a: AiErrorKind = null as unknown as TextGenerationErrorKind
const _b: TextGenerationErrorKind = null as unknown as AiErrorKind
void _a
void _b

it('is a compile-time-only guard, see the file header comment', () => {
  expect(true).toBe(true)
})
