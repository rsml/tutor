# 0002. Just-in-time chapter generation, quiz masks the latency

Status: Accepted
Date: 2026-07-21

## Context

A chapter takes tens of seconds to generate. Pre-generating the whole book up front wastes tokens, because feedback and quiz results from earlier chapters are meant to change how later chapters get written, and it delays the first chapter the reader actually wants.

## Decision

TOC approval triggers chapter 1's generation. Chapters then generate one at a time.

- [`generate-next-chapter.ts`](../../server/services/generate-next-chapter.ts) generates one chapter's text and quiz. Both flows below share it.
- [`chapter-generation-stream.ts`](../../server/services/chapter-generation-stream.ts) is the in-memory hub behind the single-chapter SSE routes. It streams chapter text to a subscriber as the model generates it.
- Submitting feedback through [`submit-feedback.ts`](../../server/services/submit-feedback.ts) scores the reader's quiz answers and fires the next chapter's generation.
- Meanwhile, [`generate-quiz.ts`](../../server/services/generate-quiz.ts) produces a 3-question quiz over the chapter just read, for the reader to answer while that runs.
- A separate, opt-in `generate-all` background task in [`generate-all-chapters.ts`](../../server/services/generate-all-chapters.ts) generates every remaining chapter without the per-chapter quiz pause, for a reader who wants it all at once.

Each single-chapter generation is journalled while it streams and cleared once it settles, so a process that dies mid-stream leaves a record behind. There is no way to resume a partially streamed chapter with any provider, so the next boot seeds that chapter's generation with an explicit interrupted error the reader's error panel already shows.

The opt-in `generate-all` task differs. It checkpoints progress and resumes on the next boot by re-reading how many chapters exist on disk. See [ADR 0008](0008-persisted-job-journal.md) for the persisted job journal behind both.

## Consequences

**What this buys**
- Perceived latency drops to near zero, because the reader takes a quiz while the next chapter generates instead of watching a spinner.
- Each chapter can adapt to the previous chapter's quiz results and feedback before it gets written.
- Tokens get spent only on chapters the reader actually reaches.

**What this costs**
- The single-chapter flow needs SSE plumbing on both the server and the client, plus reconnect handling.
- The quiz is now load-bearing UX rather than only a pedagogical add-on, so a reader who skips it loses the latency-masking the design depends on.

## Revisit when

Chapter generation drops to a few seconds. At that point, masking the latency with a quiz is not worth the complexity it adds.
