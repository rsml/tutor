---
description: VS Code live demo rehearsal guide for AI Harness meetup talk
depends-on:
  - src/config.ts
  - src/config-fixed.ts
  - src/scan-secrets.ts
  - tsconfig.json
if-changed: update demo steps or timing
---

# AI Harness Demo — Rehearsal Guide

## What the demo shows

An enforcement script catches a hardcoded API key that TypeScript, the linter,
and tests all miss. The point: enforcement scripts catch what compilers can't.

## Before the talk (3 min)

1. Open this directory in VS Code
2. Set font size to 20pt+ (Cmd+= until readable from back of room)
3. Close all other tabs, terminal panel, minimap
4. Open `src/config.ts` — verify TypeScript shows **0 errors** (green status bar)
5. Have terminal ready but hidden (Cmd+J to toggle)

## The demo (3 min)

1. **Show `config.ts`** — point out the hardcoded API key on line 10.
   "TypeScript compiles fine. Linter is quiet. Tests pass. Ship it?" (20s)
2. **Open terminal, run `npx tsx src/scan-secrets.ts`** — the enforcement script
   scans every .ts file for credential patterns. Watch it fail:
   `ERROR config.ts:10 Stripe key detected → "sk-live-abc123…"` (30s)
3. **Explain:** "This script runs on every commit, every PR. The compiler can't see
   secrets — but the enforcement script can." (20s)
4. **Fix it live:** copy `config-fixed.ts` over `config.ts`
   (or live-edit: replace the key with `process.env.API_KEY ?? ""`) (20s)
5. **Re-run `npx tsx src/scan-secrets.ts`** — watch it pass:
   `PASSED: no hardcoded credentials detected.` (15s)
6. **Punchline:** "One of 101. Each one born from a real failure.
   The wall keeps growing." (15s)

## If something breaks

Switch back to the slide deck — hidden fallback slides show each state.

## Old demo (archived)

`src/working-handler.ts` is the previous Effect-services demo. Kept for reference.
