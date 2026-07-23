Up: [ARCHITECTURE.md](../../ARCHITECTURE.md)

# server/services/

Services hold application logic and orchestrate ports. They never import an AI SDK, and they never touch a Fastify request or reply. That keeps them unit-testable against fakes, with no network call needed.

A few do read a real file behind a path-returning port. `ArtifactStore` hands back paths rather than bytes for large binary artifacts, so a service is where that last-mile read happens instead of a route.

Every service is a `createX(deps)` factory taking its ports as a plain dependency object, so a test hands it fakes instead of touching the filesystem or a model.

The generation flow is the clearest worked example.

- Approving a TOC calls `createStartBook`, which streams chapter one over SSE and saves it.
- Reading calls `createReadChapter`.
- Finishing a chapter calls `createSubmitFeedback`, which grades any saved quiz and records the reader's response.
- The next chapter runs through `createGenerateNextChapter`, again streamed over SSE, the same function whether it is generating a new chapter or regenerating one.

`BackgroundTasks` owns a task's lifecycle, start, progress, success, failure, and cancellation. A caller only ever holds a `TaskHandle` exposing an `AbortSignal`, never the controller that could cancel it.

Background work is a `Task` everywhere in this layer, never a "job" in that sense. `JobJournal` is the one exception. It persists a job across a restart, and "job" is the correct word there.

`authoring/` is the MCP-facing sub-folder, the services behind the MCP server's authoring writes rather than the reader-facing flows above.

Related: [../README.md](../README.md), [../ports/README.md](../ports/README.md), [../adapters/README.md](../adapters/README.md), [ADR 0002](../../docs/adr/0002-just-in-time-chapter-generation.md), [ADR 0008](../../docs/adr/0008-persisted-job-journal.md)
