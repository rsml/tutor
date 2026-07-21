# Architecture

Tutor is one Electron desktop app for one reader on one machine. It generates a book chapter by chapter, and each chapter is shaped by the feedback and quiz results of the one before it. Everything below follows from that, and from there being exactly one writer and no cloud.

Start here, then follow the links. Domain words are defined in [CONTEXT.md](CONTEXT.md), decisions and their costs in [docs/adr/](docs/adr/README.md), and the HTTP surface in [docs/api-routes.md](docs/api-routes.md), which is generated from the route registry rather than written by hand.

## 1. What talks to what

```mermaid
flowchart LR
  reader([Reader])
  subgraph app["Tutor.app"]
    electron["electron/<br/>main and preload"]
    client["client/<br/>React renderer"]
    server["server/<br/>embedded Fastify"]
  end
  library[("On-disk library<br/>Markdown and YAML")]
  providers["AI providers<br/>Anthropic, OpenAI, Google"]
  local["Kokoro TTS and ffmpeg<br/>on this machine"]

  reader --> client
  electron --> client
  electron --> server
  client -->|"HTTP and SSE on 127.0.0.1"| server
  server --> library
  server -->|"the reader's own API key"| providers
  server --> local
```

The Fastify server is embedded in the Electron main process rather than deployed anywhere. It binds `127.0.0.1` on a free port at launch, or 3147 when run standalone with `pnpm dev:server`. The library is plain Markdown and YAML under the OS data directory, which is [ADR 0001](docs/adr/0001-filesystem-as-the-database.md). Narration is synthesized locally instead of by a metered cloud service, which is [ADR 0003](docs/adr/0003-local-kokoro-tts.md).

## 2. The server hexagon

```mermaid
flowchart LR
  subgraph core["server core"]
    direction TB
    routes["routes/<br/>parse and delegate"]
    services["services/<br/>application logic"]
    domain["domain/<br/>pure rules"]
    routes --> services
    services --> domain
  end

  subgraph ports["ports/ (15 interfaces)"]
    direction TB
    pStore["BookRepository<br/>ArtifactStore<br/>LibraryMigrator<br/>JobJournal<br/>KeyVault"]
    pAi["TextGeneration<br/>ImageGeneration"]
    pMedia["SpeechSynthesis<br/>AudioAssembly<br/>DiagramRenderer<br/>EpubImport<br/>EpubExport"]
    pSys["BackgroundTasks<br/>Clock<br/>OsFileManager"]
  end

  subgraph adapters["adapters/ (the only I/O)"]
    direction TB
    aStore["fs-*.ts<br/>file-key-vault.ts"]
    aAi["ai-sdk-text-generation.ts<br/>http-image-generation.ts"]
    aMedia["kokoro-speech-synthesis.ts<br/>ffmpeg-audio-assembly.ts<br/>kroki- and electron-diagram-renderer.ts<br/>epub2-import.ts, epub-gen-export.ts"]
    aSys["in-memory- and journalled-background-tasks.ts<br/>system-clock.ts, os-file-manager.ts"]
  end

  services --> pStore
  services --> pAi
  services --> pMedia
  services --> pSys
  pStore --> aStore
  pAi --> aAi
  pMedia --> aMedia
  pSys --> aSys
```

Nothing in the core names an adapter. [`server/composition-root.ts`](server/composition-root.ts) is the one place a real adapter is chosen, and `buildServer(overrides)` lets a test or the Electron shell substitute one. Every port ships an in-memory fake and a shared contract test, and every adapter that can be exercised without spending money or downloading a model runs that same contract, which is what stops a fake from drifting into a convenient fiction. See [`server/ports/README.md`](server/ports/README.md) and [`server/adapters/README.md`](server/adapters/README.md) for the full mapping, and [ADR 0005](docs/adr/0005-ai-sdk-behind-a-port.md) for why the AI SDK sits behind one.

## 3. How a request travels

```mermaid
flowchart LR
  components["features/<br/>components"] --> hooks["features/<br/>hooks"]
  hooks --> store["store/<br/>Redux slices"]
  hooks --> api["api/<br/>the one HTTP client"]
  api -->|"HTTP and SSE"| routes["routes/"]
  routes --> services["services/"]
  services --> ports["ports/"]
  ports --> adapters["adapters/"]
```

Components render and hooks decide. Every call to the server goes through [`client/api/`](client/README.md), and a raw `fetch` or `new EventSource` anywhere else is an ESLint error rather than a convention, because the client previously held eighty four scattered fetch calls and two competing reconnect policies.

## 4. The adaptive loop

```mermaid
sequenceDiagram
  actor Reader
  participant Client as client/
  participant Server as server/
  participant AI as TextGeneration
  participant Disk as library

  Reader->>Client: topic and prompt
  Client->>Server: POST /api/books
  Server->>AI: draft the table of contents
  Server->>Disk: meta.yml, toc.yml
  Server-->>Client: SSE, status toc_review
  Reader->>Client: approve the TOC
  Client->>Server: PUT /api/books/:id/toc
  Server->>AI: generate chapter 1
  Server-->>Client: SSE chunks as they stream
  Server->>Disk: chapters/01.md
  Reader->>Client: read, then submit feedback
  Client->>Server: POST /api/books/:id/chapters/1/feedback
  Server->>Disk: feedback/01.yml
  Server->>AI: generate chapter 2 in the background
  Reader->>Client: answer the quiz while it generates
  Note over Server,AI: chapter 2 is shaped by chapter 1's feedback and quiz result
```

Chapters are generated one at a time rather than up front, and the quiz exists partly to cover the generation latency. That is [ADR 0002](docs/adr/0002-just-in-time-chapter-generation.md). If the app is closed mid-generation the work is not lost, because jobs are journalled to disk and resumed at the next boot, which is [ADR 0008](docs/adr/0008-persisted-job-journal.md).

## 5. The dependency rule

```mermaid
flowchart TD
  client["client/"] --> shared["shared/"]
  server["server/"] --> shared
  electron["electron/"] --> shared
  client -. "ESLint error" .-> server
  shared -. "ESLint error" .-> client
```

`shared/` is the dependency root and imports neither side. It holds the Zod schemas, the status predicates, the HTTP contract types, and the SSE event unions, so the two halves of the app validate against the same definitions. This is one package shaped like a monorepo rather than real workspaces, which is [ADR 0004](docs/adr/0004-single-package-monorepo-shaped.md), and the folders are already package-shaped if that ever needs to change.

## Deliberately out of scope

Observability and telemetry, a security-hardening pass, and release engineering were all considered and declined. The app runs locally on one machine, holds one reader's data, has no cloud component, and has no multi-user surface, so each of those would add machinery with nothing to protect or measure. The reasoning is recorded in [ADR 0004](docs/adr/0004-single-package-monorepo-shaped.md) rather than left as an unexplained gap.

## Where to read next

| Area | Start at |
|---|---|
| Server, routes, services, ports, adapters | [`server/README.md`](server/README.md) |
| React renderer and feature slices | [`client/README.md`](client/README.md) |
| Types both sides depend on | [`shared/README.md`](shared/README.md) |
| Electron shell and packaging | [`electron/README.md`](electron/README.md) |
| End-to-end journeys | [`e2e/README.md`](e2e/README.md) |
| Every decision and what it cost | [`docs/adr/`](docs/adr/README.md) |
| Domain vocabulary | [`CONTEXT.md`](CONTEXT.md) |
| Generated HTTP surface | [`docs/api-routes.md`](docs/api-routes.md) |
