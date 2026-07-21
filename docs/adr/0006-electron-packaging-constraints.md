# 0006. Electron packaging constraints

Status: Accepted
Date: 2026-07-21

## Context

Electron packaging breaks in several independent ways. pnpm's symlinked store confuses electron-builder's dependency resolution. The unified and remark ecosystem ships ESM-only with deep transitive dependencies electron-builder cannot follow. The audiobook feature's ONNX runtime is a native addon, and `kokoro-js` pulls in a phonemizer that bundles the espeak-ng WASM build, neither of which bundles like ordinary JavaScript. On top of that, the three run modes, dev, preview, and a packaged build, load the renderer from three different origins.

## Decision

[`../../.npmrc`](../../.npmrc) sets `node-linker=hoisted` so electron-builder sees a flat `node_modules` instead of pnpm's symlinks. In [`../../vite.config.ts`](../../vite.config.ts), the Electron main process build's `external()` function bundles the unified, remark, rehype, mdast, and hast packages straight into `dist-electron/`, while CJS packages and the native audiobook dependencies (`kokoro-js`, `onnxruntime-node`, `onnxruntime-common`, `fluent-ffmpeg`, `phonemizer`, and the Hugging Face packages) stay external. [`../../package.json`](../../package.json)'s `build.files` lists those same native packages so electron-builder copies them into the packaged app, and `build.asarUnpack` unpacks `onnxruntime-node` from the asar archive. The embedded server always binds `127.0.0.1` on a free port, chosen by passing port `0` to `startServer` in [`../../electron/main.ts`](../../electron/main.ts). CORS in [`../../server/index.ts`](../../server/index.ts)'s `isAllowedOrigin` accepts a `null` origin and any `localhost` or `127.0.0.1` origin. `connect-src` in both [`../../index.html`](../../index.html) and `electron/main.ts` lists `http://127.0.0.1:*` and `http://localhost:*`. The source `index.html` always points at its source entry, never at build output. A dynamically imported CJS module, `epub-gen-memory` in [`../../server/adapters/epub-gen-export.ts`](../../server/adapters/epub-gen-export.ts), handles being double-wrapped under Node's ESM loader. [`../../scripts/bundle-fingerprint.sh`](../../scripts/bundle-fingerprint.sh) prints every bare specifier that survives into the built main bundle, run as a no-op check that a change to the bundle list has not let a new specifier leak through unbundled.

## Consequences

**What this buys**

- All three run modes load the renderer correctly, and audiobook generation works in the packaged DMG, not only in dev.

**What this costs**

- The bundle list in `vite.config.ts` is manual and grows whenever a new ESM-only markdown dependency is added.
- Hoisting the pnpm store weakens the isolation pnpm otherwise gives each dependency.
- A packaging change has to be checked in all three modes, not only `electron:dev`, since dev never loads from `dist-electron/` or an asar archive at all.

## Revisit when

electron-builder resolves pnpm's symlinked store natively.
