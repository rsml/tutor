import { afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Test environment guard, loaded as a vitest setupFile. setupFiles run per
// test file, before that file's own imports are evaluated. The pre-port
// server/services/key-store.ts used to read TUTOR_DATA_DIR at module load
// time, which is why this file sets the env var at its own module scope
// instead of in a beforeEach. Every current adapter resolves its data
// directory through shared/node/data-dir.ts's getDataDir() instead, called
// while server/composition-root.ts builds Ports, but setting the env var
// this early still guarantees it is correct before the first test in the
// file ever builds a server. Do not weaken this into a beforeEach.
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
