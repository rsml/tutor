# 0003. Local Kokoro TTS over cloud TTS

Status: Accepted
Date: 2026-07-21

## Context

Audiobooks need narration for an entire book, chapter by chapter. Cloud text-to-speech is metered per character and would dominate the cost of narrating a whole book, and bring-your-own-key users have no billing relationship with Tutor to route that cost through.

## Decision

Narration runs locally through [`kokoro-speech-synthesis.ts`](../../server/adapters/kokoro-speech-synthesis.ts), which loads the `onnx-community/Kokoro-82M-v1.0-ONNX` model at `q8` quantization using `kokoro-js` and `onnxruntime-node`. [`audiobook-installer.ts`](../../server/services/audiobook-installer.ts) downloads the model and a separate ffmpeg binary on first use, and it reports progress as a background task. Together those downloads total approximately 195 MB, 115 MB for the model and 80 MB for ffmpeg. [`ffmpeg-audio-assembly.ts`](../../server/adapters/ffmpeg-audio-assembly.ts) muxes the per-chapter WAV files into a single M4B with chapter markers once [`generate-audiobook.ts`](../../server/services/generate-audiobook.ts) has narrated every chapter. The voice list orders male voices first, and within Kokoro's American-male group, `am_michael` is pinned ahead of every other voice regardless of its position in Kokoro's own catalogue.

## Consequences

**What this buys**
- Narrating a book costs nothing beyond the one-time download, no matter how many books get narrated or how long they run.
- Narration runs fully offline, and no book content ever reaches a third party.

**What this costs**
- The first use of the audiobook feature pays for a large one-time download of the model and ffmpeg.
- The native ONNX binaries must stay unpacked from the asar archive and external in the Vite build. [ADR 0006](0006-electron-packaging-constraints.md) covers that constraint in full.
- Kokoro's voice quality sits below premium cloud voices.

## Revisit when

A cloud voice is clearly better and users ask for it as an opt-in alongside the local engine, not as a replacement for it.
