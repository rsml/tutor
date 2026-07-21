Up: [ARCHITECTURE.md](../../ARCHITECTURE.md)

# server/adapters/

Adapters are the only place real I/O happens, one file per port per technology, named `<technology>-<port>.ts`.

| Adapter | Port |
|---|---|
| `ai-sdk-text-generation.ts` | `text-generation` |
| `file-key-vault.ts` | `key-vault` |
| `http-image-generation.ts` | `image-generation` |
| `fs-book-repository.ts` | `book-repository` |
| `fs-artifact-store.ts` | `artifact-store` |
| `kokoro-speech-synthesis.ts` | `speech-synthesis` |
| `ffmpeg-audio-assembly.ts` | `audio-assembly` |
| `kroki-diagram-renderer.ts` | `diagram-renderer` |
| `electron-diagram-renderer.ts` | `diagram-renderer` |
| `epub2-import.ts` | `epub-import` |
| `epub-gen-export.ts` | `epub-export` |
| `in-memory-background-tasks.ts` | `background-tasks` |
| `journalled-background-tasks.ts` | `background-tasks` |
| `fs-job-journal.ts` | `job-journal` |
| `fs-library-migrator.ts` | `library-migrator` |
| `system-clock.ts` | `clock` |
| `os-file-manager.ts` | `os-file-manager` |

`journalled-background-tasks.ts` decorates `in-memory-background-tasks.ts` so that adding persistence did not force the port async. `retry-policy.ts` and `fs-paths.ts` are shared helpers rather than adapters. Neither implements a port of its own.

Some adapters carry an external constraint worth knowing up front. `fs-paths.ts` writes YAML atomically, a temp file, then a rename. `kokoro-speech-synthesis.ts` needs the Kokoro model downloaded. `ffmpeg-audio-assembly.ts` needs ffmpeg present. `file-key-vault.ts` needs the OS keychain, or falls back to a plaintext key file outside Electron. `kroki-diagram-renderer.ts` calls the kroki.io HTTP service.

Every adapter is covered by its port's shared contract test, plus its own integration tests for anything the contract does not reach.

Electron packaging bites adapters specifically. The native dependencies behind narration and audio (kokoro-js, onnxruntime, fluent-ffmpeg, phonemizer) stay external to the bundle rather than being rolled in, and `onnxruntime-node`, the one with a native binary, is also asarUnpacked. A dynamic import of a CJS package can come back wrapped an extra level under Node's ESM loader. `epub-gen-export.ts` and `epub2-import.ts` each unwrap whichever shape actually shows up rather than assuming one.

Importing the narration path pulls in an espeak WASM bundle, through `kokoro-js`, that installs a process-level `unhandledRejection` handler which rethrows. While narration is loaded, any unrelated unhandled rejection anywhere in the process becomes fatal. Do not remove or wrap another package's handler. The hazard is documented at the import that causes it, in `kokoro-speech-synthesis.ts`.

Related: [../README.md](../README.md), [../ports/README.md](../ports/README.md), [../services/README.md](../services/README.md), [../migrations/README.md](../migrations/README.md), [ADR 0006](../../docs/adr/0006-electron-packaging-constraints.md), [ADR 0003](../../docs/adr/0003-local-kokoro-tts.md)
