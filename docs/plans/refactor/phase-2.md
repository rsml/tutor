# Phase 2 — Server Hexagonal Restructure

Scope: `server/` only. Assumes P1 delivered `server/ + shared/ + client/` with `@server/* @shared/* @client/*` aliases and ESLint boundaries. Assumes P0 landed `fastify.inject` characterization tests. Verified against the real code (books.ts 2,244 lines read in full, plus every other route/service).

Consolidation deltas that modify this plan: S1 reduces to `shared/domain/provider.ts` consolidation only (P1 owns the schemas move); the schemas re-export shim does not exist so S12's shim deletion is moot; S1+S2+S3 land as an early `phase-2-foundations` PR merged to master so P3 can rebase; service unit tests are written red before each extraction (TDD delta 9).

## 0. Reconciled during execution

Facts found in the code that contradict what this plan was written against. The plan below is corrected in place; this list records what moved and why, so the diff between plan and reality is never silent.

1. **Test baseline.** Section 9 was written against a post-P0 count of 232. Phase 1 landed more tests, so the real baseline on `master` before this branch is 315. Stage S4 took it to 479, and the stage 2 items below took it to 481. The phase gate is measured against 481 plus the new adapter and service tests, not 232.
2. **`books.ts` size.** Read at 2,244 lines when this plan was written. The foundations PR moved constants, HTTP helpers, and the error handler out, so it is 2,176 lines and 47 route registrations at the point S6b splits it. Every line reference in sections 2 and 3 is therefore approximate and must be re-derived from the file rather than trusted.
3. **Sanctioned change 1 has no frozen assertion to edit.** Risk 4 assumed the eight MCP authoring routes had P0 characterization assertions locking their current 500. They do not. Those eight routes have zero test coverage of any kind, verified by grepping every `*.test.ts` under `server/` for their paths. So the 500 to 400 flip edits nothing. Instead this phase must ADD tests asserting the new 400, because an unsanctioned regression there would otherwise be invisible.
4. **DiagramRenderer failure contract.** The port shipped in S4 said a failed chart yields `''`. The two real implementations disagreed: kroki pushed `''`, Electron pushed an escaped mermaid code block holding the chart source. The architect standardized on the Electron behaviour, so a failed chart now yields `diagramSourceFallback(source)` and never `''`. The kroki adapter adopts it, which is sanctioned change 5, visible only in dev web mode.
5. **AudioAssembly cover embedding.** `ConcatToM4bRequest` gained an optional `coverPath`. Retrying the stitch without a cover when embedding fails stays adapter-internal resilience rather than a caller concern.
6. **Port count.** Thirteen ports shipped in S4, not the eleven plus two extras this plan estimated: TextGeneration, KeyVault, ImageGeneration, BookRepository, ArtifactStore, SpeechSynthesis, AudioAssembly, DiagramRenderer, EpubImport, EpubExport, BackgroundTasks, Clock, OsFileManager.
7. **`services/mermaid-renderer.ts` is confirmed dead.** Only its own test imports it. Every other `mermaid-renderer` hit in the tree is a log prefix string or a temp file name, not an import.
8. **Two ports were widened while their real adapters were built.** `AudioAssembly.concatToM4b` gained `bookTitle` alongside the architect's `coverPath`, because the real M4B stitch tags the file with the book's title as container metadata and as the FFMETADATA1 title line, and `AudiobookChapterEntry` carries only per-chapter titles. Without it the adapter could not reproduce today's tagging.
9. **`generation-manager.ts` and the standalone `generate-quiz.ts` were not duplicates.** The generation-manager copy appended `MARKDOWN_FORMATTING_RULES` to the quiz prompt and the standalone one did not. Reconciling them onto one implementation therefore needed an explicit `includeFormattingRules` flag rather than a straight merge, so each caller keeps the prompt it has always sent.
10. **The route split produced 46 route registrations, not 47.** Counted by grep across the original file, and the eight target modules account for all 46.
11. **Three `server/domain/` modules were not pure.** `profile-context.ts`, `chapter-range.ts`, and `skill-progress-report.ts` all reached the filesystem through the `book-store` singleton. Each was split into a pure core plus a port-taking wrapper in `server/services/`, which is what section 6 intended by "server-only pure helpers" but the mechanical split alone did not achieve.
12. **The singleton-to-factory risk was handled with deliberate temporary shims.** Rather than converting call sites and factories in one step across five parallel slices, each singleton became a thin shim over its new adapter in a single atomic commit, callers migrated onto ports slice by slice, and the shims were deleted only once nothing imported them. No half-converted state ever existed, so the production data directory was never at risk.

## 0b. Final shape

13 ports, 15 adapters, 52 services, 8 domain modules, 16 route modules, none over 200 lines. `server/composition-root.ts` is the only module that names a concrete adapter. `createPorts(overrides)` builds all thirteen, `createSharedServices(ports)` builds the in-memory state two route modules must share, and `buildServer(overrides)` threads both into every route plugin as plugin options.

## 1. Port catalog

Location: `server/ports/<port>.ts` — interface + fake + contract test per port. All signatures derived from actual call sites (line refs are current `server/`).

```ts
// ports/text-generation.ts — covers 9 generateObject + 6 streamText call sites
export interface ModelRef { provider: ProviderId; model: string }   // shared/domain/provider.ts
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface TextGeneration {
  /** books.ts:327,1079,1217; generation-manager.ts:294; chat.ts:63 */
  streamText(req: { model: ModelRef; system?: string; prompt?: string;
                    messages?: ChatMessage[]; signal?: AbortSignal }): AsyncIterable<string>
  /** books.ts:131,270,870,976,1444,1507; covers.ts:145; profile.ts:92; gen-mgr:131 */
  generateObject<T>(req: { model: ModelRef; schema: z.ZodType<T>; prompt: string; system?: string
                           schemaName?: string; schemaDescription?: string
                           signal?: AbortSignal }): Promise<T>
  /** profile.ts:147 only — tool loop + fullStream text-delta filtering */
  runToolConversation(req: { model: ModelRef; system: string; messages: ChatMessage[]
                             tools: Record<string, ToolSpec>; maxSteps: number
                             signal?: AbortSignal }): AsyncIterable<{ type: 'text'; text: string }>
}
```
The adapter owns the 5-minute timeout (`AbortSignal.any([external, AbortSignal.timeout(AI_GENERATION_TIMEOUT_MS)])`, Node 24 — verified). That deletes `createTimeout()` ×5 and the manual signal-combining at generation-manager.ts:287-292. Callers pass only *cancellation* signals (task abort).

```ts
// ports/book-repository.ts — structured domain data (YAML/MD today)
export interface BookRepository {
  listBooks(): Promise<BookMeta[]>;  getBook(id: BookId): Promise<BookMeta>
  saveBook(meta: BookMeta): Promise<void>;  deleteBook(id): Promise<void>;  resetBook(id): Promise<void>
  getToc(id): Promise<Toc>;  saveToc(id, toc: Toc): Promise<void>
  getChapter(id, num: ChapterNumber): Promise<string>;  saveChapter(id, num, md: string): Promise<void>
  chapterExists(id, num): Promise<boolean>
  getQuiz(id, num): Promise<Quiz>;  saveQuiz(id, num, quiz): Promise<void>;  quizExists(id, num): Promise<boolean>
  getFinalQuiz(id): Promise<Quiz>;  saveFinalQuiz(id, quiz): Promise<void>;  finalQuizExists(id): boolean
  getFeedback(id, num): Promise<Feedback>;  saveFeedback(id, num, fb): Promise<void>
  getAllFeedback(id): Promise<Feedback[]>
  getProgress(id): Promise<Progress>;  saveChapterProgress(id, num, p: ChapterProgress): Promise<void>
  getChaptersRead(id): Promise<number>;  getSkillProgress(): Promise<SkillProgress>
  getProfile(): Promise<LearningProfile>;  saveProfile(p): Promise<void>;  getProfileUpdatedAt(): Promise<string|null>
  saveBrief/getBrief/saveSummary/getSummary/getAllSummaries/saveReference/getReference/listReferences
}

// ports/artifact-store.ts — binary artifacts. DOCUMENTED filesystem-bound:
// ffmpeg and HTTP Range streaming need real paths; pretending otherwise is false abstraction.
export interface ArtifactStore {
  coverPath(id): Promise<string | null>;  hasCover(id): Promise<boolean>;  coverMtime(id): Promise<Date|null>
  saveCover(id, data: Buffer, mediaType): Promise<void>;  deleteCover(id): Promise<void>
  epubPath(id): string;  epubExists(id): boolean;  writeEpub(id, bytes: Buffer): Promise<void>
  audiobookPath(id): string;  audiobookExists(id): boolean;  audioDir(id): string
  chapterAudioPath(id, num): string;  chapterWavPath(id, num): string;  chapterAudioExists(id, num): Promise<boolean>
  getAudiobookManifest(id): Promise<AudiobookManifest|null>;  saveAudiobookManifest(id, m): Promise<void>
  deleteAudiobookArtifacts(id): Promise<void>;  recoverFromCrash(): Promise<CrashRecoveryReport>
}

// ports/speech-synthesis.ts (kokoro)          // ports/audio-assembly.ts (ffmpeg)
listVoices(): VoiceInfo[]                       probeDurationSec(path, signal): Promise<number>
isInstalled(): boolean                          concatToM4b(req: { inputs: string[]; chapters:
missingComponents(): MissingComponents            AudiobookChapterEntry[]; out: string; bitrate: string
install(onProgress, signal): Promise<void>        signal: AbortSignal }): Promise<void>
synthesizePreview(voiceId): Promise<Buffer>
synthesizeChapter(req: { text; voiceId; speed; outPath; signal?; onSentence? }): Promise<void>
startWorkerPool(n): Promise<void>;  stopWorkerPool(): Promise<void>

// ports/image-generation.ts
generate(req: { provider: ProviderId; preferredModel: string; prompt: string
                signal: AbortSignal }): Promise<GeneratedImage>   // image-generation.ts:185 as-is

// ports/key-vault.ts
get(p: ProviderId): string|null;  set(p, key): void;  remove(p): void;  has(p): boolean
status(): Record<ProviderId, boolean>

// ports/diagram-renderer.ts
render(charts: string[]): Promise<string[]>     // markup per chart; failed = diagramSourceFallback(source), never ''

// ports/epub-import.ts  — MUST NOT persist (today epub-importer.ts:10 imports book-store)
preview(bytes: Buffer): Promise<EpubPreview>
read(bytes: Buffer): Promise<ImportedBook>      // pure data: meta fields, chapters[], coverBytes?

// ports/epub-export.ts
build(req: { title; author; css?; coverPath?
             chapters: Array<{ title: string; html: string }> }): Promise<Buffer>

// ports/background-tasks.ts — expose signal, never the AbortController
start(spec: { type: TaskType; bookId: string; bookTitle: string; total: number }): TaskHandle
report(taskId, current: number, label: string): void;  succeed(taskId, result?): void
fail(taskId, error: string): void;  cancel(taskId): boolean
get(taskId): Task|undefined;  list(): Task[];  findActive(bookId, type?): TaskHandle|undefined
subscribe(cb: (e: TaskEvent) => void): Unsubscribe
export interface TaskHandle { id: string; signal: AbortSignal }
```
Two cheap extras, approved by the architect: **`ports/clock.ts`** (`nowIso()`, `newId()` — kills 15 `new Date().toISOString()` and makes service unit tests assert exact timestamps) and the `AudioAssembly` split above (ffmpeg is a distinct dependency from kokoro; 2 methods).

## 2. Adapter map

| Today | Becomes | Notes |
|---|---|---|
| `services/book-store.ts` (810) | `adapters/fs-book-repository.ts` + `adapters/fs-artifact-store.ts` | factory takes `dataDir`; existing `vi.mock('data-dir')` tests become plain temp-dir tests |
| `services/model-client.ts` + inline `ai` calls | `adapters/ai-sdk-text-generation.ts` | owns timeout, provider validation, `experimental_repairText` logging hook |
| `services/key-store.ts` | `adapters/file-key-vault.ts` | factory args replace import-time side effects |
| `services/image-generation.ts` | `adapters/http-image-generation.ts` | drop its `getKey` import, inject KeyVault |
| `services/kokoro-service.ts` | `adapters/kokoro-speech-synthesis.ts` | |
| ffmpeg internals of `services/audiobook-generator.ts` (`runFfmpeg`, `getAudioDurationSec`, m4b stitch) | `adapters/ffmpeg-audio-assembly.ts` | orchestration half → service (§3) |
| `services/epub-importer.ts` | `adapters/epub2-import.ts` | strip `saveBook/saveToc/saveChapter/saveCover` imports; return data |
| epub-gen-memory block, books.ts:1630-1634,1768 | `adapters/epub-gen-export.ts` | keeps CJS double-default handling (Electron constraint) |
| `index.ts:78-108` kroki decoration + `electron/main.ts:385` | `adapters/kroki-diagram-renderer.ts`, `adapters/electron-diagram-renderer.ts` (registered by main.ts) | **`services/mermaid-renderer.ts` is dead code** — only its own test imports it. Delete it and the `fastify.mermaidRenderer` cast at books.ts:1668 |
| `services/task-manager.ts` | `adapters/in-memory-background-tasks.ts` | |
| books.ts:2007-2019 `spawn(open/explorer/xdg-open)` | `adapters/os-file-manager.ts` | |
| `services/generation-manager.ts` stream hub | `services/chapter-generation-stream.ts` | not a port — in-memory domain service |

## 3. Service decomposition (`books.ts` and friends)

Every row = a `services/<name>.ts` exporting `createX(deps)` returning one function. Pure helpers land in `server/domain/`.

| Current lines | New module |
|---|---|
| books 39-87 ∥ gen-mgr 45-92 (verbatim dup) | `domain/profile-context.ts` `describeLearningProfile(profile)` + labels |
| books 89-121 | `domain/skill-progress-report.ts` (pure) |
| books 33-37, gen-mgr 10-14, chat 60-61, profile 88-89/133-134, covers 141-142 | deleted — adapter owns timeout |
| books 123-152 ∥ gen-mgr 123-154 | `services/generate-quiz.ts` (+ `domain/quiz-scoring.ts`: shuffle w/ injected rng, `QUIZ_QUALITY_RULES` → `prompts/quiz.ts`) |
| books 169-176, 178 | `domain/chapter-range.ts`, `domain/sanitize.ts` |
| books 184-243 | `http/send-media-range.ts` |
| books 246-375 + 1301-1361 | `services/start-book.ts` (+ `services/classify-book-skills.ts` from 268-317) |
| books 377-409 | `services/list-library.ts` |
| books 413-491 | `services/search-library.ts` |
| books 499-535 | `services/read-chapter.ts`, `services/get-chapter-quiz.ts` |
| books 537-579 | `services/submit-feedback.ts` (scoring → domain) |
| books 581-688 | `services/generate-next-chapter.ts` (regenerate = same service, `targetChapterNum` set) |
| books 692-724, gen-mgr 156-382 | `services/chapter-generation-stream.ts` + `http/sse.ts` |
| books 730-754 | `services/update-book-details.ts` (+ `domain/tags.ts` normalize) |
| books 756-772, 774-800 | `services/delete-book.ts`, `services/reset-book.ts`, `services/rate-book.ts` |
| books 802-906 | `services/generate-final-quiz.ts` + `domain/final-quiz-plan.ts` (char tiers 830, count 849, focus text 851-866 — all pure) |
| books 908-1031 | `services/suggest-profile-updates.ts` |
| books 1033-1165 | `services/create-book.ts` (TOC stream, parse, persist, failure marking) |
| books 1167-1299 | `services/revise-toc.ts` |
| books 1363-1489 | `services/suggest-next-book.ts` + `domain/learning-evidence.ts` (summary assembly, pure) |
| books 1491-1533 | `services/suggest-book-details.ts` |
| books 1537-1599 | `services/generate-all-chapters.ts` |
| books 1603-1785 | `services/export-epub.ts` + `domain/epub-embedding.ts` (hidden-div round-trip markup, pairs with importer) |
| books 1811-1922, audiobook-gen 126-379 | `services/generate-audiobook.ts` (gates + voice resolution + narration loop) |
| books 2029-2049 | `services/record-progress.ts` |
| books 2059-2243 | `services/authoring/*.ts` (skeleton, chapter-content, meta, brief, summaries, toc, references, quiz) |
| import.ts 28-47 | `services/import-book.ts` (adapter returns data, service persists) |
| chat.ts, profile.ts 74-187, covers.ts | `services/explain-passage.ts`, `services/interview-profile.ts`, `services/suggest-skills.ts`, `services/generate-cover.ts`, `services/suggest-cover-prompt.ts` |

**One Zod mechanism — chosen: `http/parse.ts`.** `parseBody(schema, request.body)` throws `RequestValidationError { statusCode: 400, issues }`; one new branch in the existing `setErrorHandler` (index.ts:123) renders the *exact current* body `{ error: 'Invalid request', details: issues }`. Rejected Fastify/ajv `schema.body` validation: it changes the 400 payload shape (breaking the P0 behavior lock and client error handling) and drops Zod defaults/transforms the code relies on (`.default([])`). Rejected per-route preValidation hooks: same 20× repetition, moved. Result: ~20 try/catch blocks → 0.

**Constants** — `server/constants.ts` (+ `http/status.ts`): `AI_GENERATION_TIMEOUT_MS` (5 sites), `GENERATION_STREAM_CLEANUP_MS`, `TASK_CLEANUP_DELAY_MS` (60s), `MODEL_LIST_TIMEOUT_MS` (10s), `DIAGRAM_RENDER_TIMEOUT_MS` (30s), `DEFAULT_CHAPTER_COUNT` (12, ×4), `MAX_CHAPTERS` (500), `DEFAULT_QUIZ_LENGTH` (3), `FINAL_QUIZ_QUESTION_COUNT`, `FINAL_QUIZ_CHAR_BUDGET_TIERS`, `PROFILE_EXCERPT_CHARS` (300), `CHAT_CONTEXT_CHARS` (4000), `PREV_CHAPTER_TAIL_CHARS` (500), `SEARCH_SNIPPET_RADIUS` (60), `TOC_ERROR_SNIPPET_CHARS` (300), `COVER_CACHE_MAX_AGE_S` (3600), `VOICE_PREVIEW_CACHE_MAX_AGE_S`, `IMPORT_BODY_LIMIT_BYTES`, `M4B_BITRATE`, `RATE_LIMITS` (6 inline configs), `DEFAULT_MODEL`. `DEFAULT_PROVIDER` (12× `?? 'anthropic'`) and `PROVIDERS`/`MODEL_REGEX` (dup'd across model-client:6-7, key-store:17, schemas:188-190) go to `shared/domain/provider.ts`. Route param JSON schemas (books:154-167 ∥ covers:11-15) → `http/route-params.ts`.

## 4. Thin routes

Target ~12 files, each <200 lines: `library, generation, assessment, suggestions, authoring, epub, covers, audiobook, chat, profile, models, settings, tasks`. `books.ts` ceases to exist. Shape:

```ts
export function libraryRoutes({ listLibrary, submitFeedback }: LibraryDeps): FastifyPluginAsync {
  return async fastify => {
    fastify.get('/api/books', () => listLibrary())
    fastify.post<{ Params: BookChapterParams }>('/api/books/:id/chapters/:num/feedback',
      { schema: { params: bookChapterParams } },
      req => submitFeedback({ bookId: req.params.id, chapter: toChapterNumber(req.params.num),
                              ...parseBody(FeedbackBodySchema, req.body) }))
  }
}
```
Rules (lint-enforced): routes import from `@shared`, `../http/*`, and their deps type only — never `ai`, `node:fs`, `zod` parsing blocks, `await import()`, or adapters. Wiring: `server/composition-root.ts` builds ports+services; `startServer(port, host, overrides?: Partial<Ports>)` passes services as plugin options, so `fastify.inject` tests boot with fakes.

## 5. Contract tests + fakes

Each port ships `ports/<name>.fake.ts` (in-memory, recording) and `ports/<name>.contract.ts` exporting `describeXContract(makeSubject)`. Run against: **fake + real** for BookRepository/ArtifactStore (`mkdtemp` temp dir — replaces the `vi.mock('lib/data-dir')` hack in book-store.test.ts), KeyVault (temp dir), BackgroundTasks (real is in-memory; `vi.useFakeTimers` for cleanup delays). **Fake only** for TextGeneration, ImageGeneration, SpeechSynthesis, AudioAssembly, DiagramRenderer, EpubImport/Export — never hit live providers. Every service gets unit tests against fakes (assert prompts contain profile context, gates return 409, feedback scoring, final-quiz tiering, etc.).

## 6. Domain split (P3 hand-off)

`shared/` — P1 delivered the base schemas + book-status predicates + body-schema contracts. Phase 2 S2 adds `shared/contracts/` response types the client needs — `LibraryBook`/`BookSummary` (BookMeta + `hasCover/showTitleOnCover/coverUpdatedAt/chaptersRead/hasAudiobook`), `GenerationStatus`, `ClientTask`/`TaskEvent`, `SearchResults`, `SkillProgress`, `EpubPreview`, `VoiceInfo`, `AudiobookStatus`, and the **SSE event unions** for create-book, revise-toc, start, generate-next, tasks-stream. Verify whether the client renders the six slider label arrays; if yes they move to `shared/domain/preference-labels.ts`.

`server/domain/` — server-only: `profile-context, final-quiz-plan, quiz-scoring, learning-evidence, skill-progress-report, epub-embedding, chapter-range, tags, sanitize`, plus `server/prompts/*.ts` typed builders.

## 7. Implementer tasks

| # | Task | Acceptance check |
|---|---|---|
| S1 | `shared/domain/provider.ts` consolidation (PROVIDERS/MODEL_REGEX/DEFAULT_PROVIDER dedup) — P1 already moved the schemas | tsc clean, tests green, boundary rule passes |
| S2 | `shared/contracts/` response + SSE types derived from real route returns | tsc clean; **notify orchestrator — P3 unblocked** |
| S3 | `constants.ts`, `http/{parse,status,route-params,sse,send-media-range}.ts` + error-handler branch | `rg "5 \* 60 \* 1000" server` = 0; `rg "instanceof ZodError" server/routes` = 0; P0 tests green unedited |
| S4 | All port interfaces + fakes + contract harness (tests first — contract test defines the port) | contract tests green against fakes |
| S5 | All adapters (11) incl. book-store/key-store factory conversion | contract tests green against real adapters; existing service tests green |
| S6a | `composition-root.ts`, `startServer(overrides)`, plugin-option threading | `pnpm dev:server` boots, `/api/health` 200, `electron:preview` boots |
| S6b | **Mechanical split of books.ts** into the 12 target route files, zero logic change | P0 tests green; `books.ts` deleted; slices now own disjoint files |
| S7 | Slice A — library + authoring services/routes (service unit tests written red first) | routes <200 lines, service unit tests, P0 green |
| S8 | Slice B — generation (create, revise-toc, start, next, all, stream hub) | ditto + manual SSE book creation |
| S9 | Slice C — assessment + suggestions | ditto |
| S10 | Slice D — epub import/export, covers, audiobook | ditto + 206 range response verified |
| S11 | Slice E — chat, profile, models, settings, tasks | ditto |
| S12 | Delete dead code: `mermaid-renderer.ts`, `generation-manager.ts` dup profile builder, `fastify.mermaidRenderer` cast, `any` at books.ts:173 (if it survived P0) | `rg "from 'ai'" server/{routes,services}` = 0; lint 0 warnings |
| S13 | Verify sweep: three Electron modes, coverage report, route-doc script sanity | all gates below |

**Parallel:** S1∥S3; S7-S11 fully parallel (5 Sonnet implementers, separate worktrees, rebased on S6b). **Sequential:** S1→S2→S4→S5→S6a→S6b→{S7..S11}→S12→S13. S6b is the critical de-conflicting step — without it four slices collide in `books.ts`; S6a registers all final route modules so no slice edits `index.ts`.

## 8. Risks

1. **SSE regressions** (`reply.hijack`, `raw.writeHead`, `request.raw.on('close')`) are invisible to unit tests. Require ≥1 P0 characterization test per streaming route asserting event order; manual boot per slice.
2. **Timeout semantics move** into the adapter. Verify `AbortSignal.any` (Node 24 ✓, Electron 40 ✓); keep manual controller-combining as fallback.
3. **Electron packaging**: adapters change the rollup `external()` list in `vite.config.ts`; `epub-gen-memory`'s double-default and `kokoro-js`/`@huggingface/transformers` must stay external. Gate `electron:preview` after S5 and S12.
4. **Sanctioned behavior change**: 8 MCP CRUD routes call `.parse()` unguarded and currently return **500** on bad input; `parseBody` makes them **400**. Architect accepted. At the current file size those unguarded parses sit at books.ts:1997, 2021, 2038, 2055, 2077, 2103, 2126, 2169. They have no test coverage at all, so nothing is edited and new tests assert the 400 instead (section 0 item 3).
5. **Singleton→factory**: `epub-importer`, `audiobook-generator`, `mcp-server` import `* as store` at module scope. All must convert in S5 or keep a shim; a half-converted state silently writes to the production data dir.
6. **Test-mock debt**: `vi.mock('../../lib/data-dir.js')` must be deleted when the factory lands, otherwise tests pass against the wrong directory.
7. `electron/main.ts:385` sets `fastify.mermaidRenderer`; switching to `setDiagramRenderer` requires an `electron/` edit — coordinate with the orchestrator on that file.
8. **Scope**: ~40 new files. Every slice must be independently mergeable and leave the app green.

## 9. Phase gate

- `pnpm test` green, count ≥ 481 + new adapter/service tests (see section 0 item 1 for how the baseline moved: 315 on master, 479 at S4, 481 after the stage 2 items); `tsc --noEmit` clean; ESLint 0 warnings including new boundary rules.
- Grep gates: `rg "from 'ai'" server/{routes,services}` = 0 · `rg "node:fs" server/routes` = 0 · `rg "5 \* 60 \* 1000" server` = 0 · `rg "instanceof ZodError" server` = 0 · `rg "await import\(" server/routes` = 0 · no route file > 200 lines · `server/routes/books.ts` gone.
- Contract test exists for all mandated ports; hermetic ones also run against the real adapter.
- `electron:dev` + `electron:preview` boot; manual E2E once: create book (SSE) → read → feedback+quiz → generate next → export EPUB → audiobook range request returns 206.
- P0 characterization assertions unchanged. The 400/500 item edits none of them, because those eight routes had no coverage to edit, so it ships with new tests instead (section 0 item 3).
