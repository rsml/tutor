import { afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Test environment guard, loaded as a vitest setupFile. setupFiles run per
// test file, before that file's own imports are evaluated, which matters
// here: server/services/key-store.ts reads TUTOR_DATA_DIR at module load
// time, so the env var must already be set before any test file's first
// import runs. Setting it in a beforeEach would be too late. Do not weaken
// this into a beforeEach.
//
// This file enforces two invariants for every test run:
//   1. No test ever writes to the real on-disk data directory — each test
//      file gets its own fresh, isolated temp directory.
//   2. No test can ever reach a live AI provider — provider API keys are
//      always stripped from the environment before any module loads.

const dir = mkdtempSync(join(tmpdir(), 'tutor-test-'))
process.env.TUTOR_DATA_DIR = dir

for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY']) {
  delete process.env[key]
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
