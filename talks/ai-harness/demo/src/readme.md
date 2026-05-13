---
description: TypeScript source for the VS Code live demo
depends-on:
  - config.ts
  - config-fixed.ts
  - scan-secrets.ts
if-changed: update if demo files change
---

# Demo Source

| File                 | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `config.ts`          | Config with a hardcoded API key (the bug)                 |
| `config-fixed.ts`    | Same config with the secret moved to an env var (the fix) |
| `scan-secrets.ts`    | Enforcement script that detects credential patterns       |
| `working-handler.ts` | Archived: previous Effect-services demo                   |
