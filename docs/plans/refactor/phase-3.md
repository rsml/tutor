# Phase 3 — Client Feature Slices

Assumes Phase 1 landed: `client/` (was `src/`), `shared/`, aliases `@client/*`, `@shared/*`. Runs in its own worktree, parallel to Phase 2. Strictly behavior-preserving, zero visual change.

Consolidation deltas that modify this plan: shared needs #1 and the raw entity schemas come from Phase 1 (already landed); response/SSE contract types come from Phase 2's early `phase-2-foundations` PR — rebase on it before S2; S12 reduces to timing-constants sweep plus rg verification (P1 S6 already swapped the 24 status literals); TDD delta 9 — API-module tests and dialog-reducer tests are written before or with their implementations; P3 moves `GenerationEvent` to shared/ itself unless P2 S2 already placed it.

## 0. What Phase 3 needs from `shared/`

| # | Export | Consumed by |
|---|--------|-------------|
| 1 | `BookStatus` union + predicates `isGenerating`, `isReadable`, `isResumableCreation`, `isFailed`, `isComplete` | landed in P1 (24 sites already swapped) |
| 2 | `BookSummary` + `BookDetail` (adds `generation: { active, stage, chapterNum }`) | replaces **7** duplicate local `interface Book` (App 50, ReaderPage 37, SeriesStackCard 13, SeriesView 6, BookListView 6, SortableSeriesCard 7, BookListRow 5) |
| 3 | `Toc`, `TocChapter` | ReaderPage, CreationView, BookOverviewModal, QuizReviewPage |
| 4 | `QuizQuestion`, `QuizResult`, `ChapterFeedback` | ReaderPage, QuizPanel, store slices |
| 5 | ~~`GenerationEvent`, moved out of `lib/parse-sse-stream.ts` by Phase 3~~ **Corrected during execution.** Phase 2 already landed this and went further, splitting the single loose client union into five per-stream unions in `shared/events.ts`, namely `CreateBookEvent`, `ReviseTocEvent`, `StartBookEvent`, `GenerateChapterEvent` and `TaskEvent`. Phase 3 therefore deletes the client union and consumes those, and the client-side parser becomes generic over the event type. | all SSE consumers |
| 6 | `TaskType`, `Task`, `TaskEvent` union | useBackgroundTasks, GenerateAllModal, BackgroundTasksFooter, store |
| 7 | `LearningProfile`, `Preferences`, `Skill` (learner Skill — glossary-disambiguated) | ProfileDialog, SkillsPanel, ProfileUpdatePage, AudiobookSettingsDialog |
| 8 | `AudiobookManifest`, `BookAudiobookStatus`, `EngineStatus`, `VoiceInfo` | audiobook slice |
| 9 | `ProviderId`, `ModelOption`, `AiFunctionGroup`, `ApiKeyStatus` | store, settings slice |
| 10 | `SearchResult`, `SearchMatch`, `EpubPreview`, `SkillProgress` | library slice |

Types only — label arrays, `PROVIDERS` metadata and `DEFAULT_PREFS` stay in `client/lib/`.

## 1. Target tree

```
client/
  app/            App.tsx (~150), router.tsx, providers.tsx, main.tsx
  api/            http.ts sse.ts urls.ts books.ts chapters.ts creation.ts covers.ts
                  audiobook.ts profile.ts progress.ts settings.ts tasks.ts chat.ts
                  import.ts index.ts  (+ *.test.ts)
  features/
    library/      components/ hooks/ dialogs/ LibraryPage.tsx
    reader/       components/ hooks/ ReaderPage.tsx
    creation/     components/ hooks/
    audiobook/    components/ hooks/
    settings/     components/ hooks/
    profile/      components/ hooks/ ProfileUpdatePage.tsx
    progress/     components/ ReviewProgressPage.tsx SkillDetailPage.tsx
    quiz/         components/ QuizReviewPage.tsx
    chat/         components/ hooks/
    markdown/     SafeMarkdown CodeBlock MermaidDiagram + sanitize/strip helpers
  components/ui/  shadcn primitives (12, unchanged)
  hooks/          shared: useStreamingContent, useTextSelection
  lib/            constants.ts utils.ts toast.ts providers.ts profile-constants.ts
                  mcp-config.ts parse-sse-stream.ts split-sections.ts format-toc.ts
  store/          index.ts settings.ts readingProgress.ts chapterData.ts
                  backgroundTasks.ts providerModels.ts quizHistory* chatHistory persist.ts
```

## 2. Slice map (complete — 61 components, 9 hooks, 5 pages, 14 lib, 4 store)

| Destination | Members |
|---|---|
| `features/library/` | LibraryPage (**new**, from App), BookCard, SortableBookCard, BookListRow, BookListView, SeriesView, SeriesStackCard, SortableSeriesCard, LibraryToolbar, FilterPopover, BookOverviewModal, EditTagsDialog, SetSeriesDialog, ImportPreviewDialog, GenerateAllModal, BackgroundTasksFooter, CoverGenerationModal; hooks `useBooks`(**new**), `useLibraryDialogs`(**new**), `useBackgroundTasks`(moved) |
| `features/reader/` | ReaderPage, ReaderHeader, FeedbackForm, QuizPanel, BookCompleteSummary, SelectionTooltip, ChapterListenButton, StarRating; hooks `useSectionNavigation`, `useChapterGeneration`(**new**), `useGenerationResume`(**new**), `useExternalGenerationPoll`(**new**), `useReaderScroll`(**new**) |
| `features/creation/` | WizardModal, CreationView, ReviseTocPanel; hooks `useTocStream`(**new**), `useChapterOneStream`(**new**) |
| `features/audiobook/` | AudiobookDownloadModal, AudiobookVoiceModal, AudiobookRegenerateConfirmModal, AudiobookSettingsDialog; hooks `useChapterAudio`, `useAudiobookEngine`(**new**) |
| `features/settings/` | SettingsMenu, ModelAssignmentDialog, ThemeProvider; hooks `useProviderModels`, `useApiKeys`(**new**) |
| `features/profile/` | ProfileDialog, ProfileEditView, ProfileDiffView, InterviewPanel, SkillsPanel, ProfileUpdatePage; hooks `useInterviewChat`, `useLearningProfile`(**new**, replaces SettingsMenu:100-117 + ProfileDialog:38 + SkillsPanel:55 duplication) |
| `features/progress/` | ReviewProgressPage, SkillDetailPage, ProgressStats, OverlaidBar |
| `features/quiz/` | QuizReviewPage, ChapterBreakdownList, SmartReviewFlow |
| `features/chat/` | ChatPanel, ChatMessage; hook `useStreamingChat` |
| `features/markdown/` | SafeMarkdown, CodeBlock, MermaidDiagram + `sanitize-mermaid` (from shared/ if P1 moved it), `strip-streaming-mermaid` |
| `components/ui/` | badge, button, command, dialog, dropdown-menu, input, input-group, popover, separator, textarea, tick-slider, tooltip |
| shared `components/` | NoiseOverlay (6 importers) |
| shared `hooks/` | useStreamingContent, useTextSelection |
| `lib/` | api-base→`api/http.ts`, api.ts→**deleted** (folds into `api/`), constants(**new**), utils, toast, providers, profile-constants, mcp-config, parse-sse-stream, split-sections, format-toc |
| `store/` | store.ts split into 6 slice files + persist.ts + index.ts; quizHistorySlice/Selectors + chatHistorySlice move in |
| **Delete (dead)** | `PageTurnOverlay.tsx`, `usePageTurnGesture.ts` — zero importers (verified) |

## 3. Typed API client

`api/http.ts` wraps the existing `tracedFetch` (trace id + one-shot retry + CORS bisection probe) — that logic is preserved verbatim, only relocated, and the function is renamed `apiFetch` now that it is the only fetch primitive. Server already allows `X-Trace-Id` in preflight (`server/index.ts:67`). Add `request<T>(path, {method, body, signal, trace})`, `ApiError { status, message, body }` (replaces the `res.json().catch(() => ({error}))` block repeated ~20×), and `trace: false` for polling GETs so we don't add a preflight round-trip to the 1s library poll.

**Corrected during execution, three findings that change what this task means.**

1. `tracedFetch` had exactly **one** call site, `CoverGenerationModal:74`. The other 83 sites called bare `fetch(apiUrl(...))`. Routing everything through `request<T>` therefore does change the wire, since every request gains the trace header and the one-shot retry. POSTs already sent `Content-Type: application/json` and were already preflighted, so they cost nothing extra. GETs newly preflight, which is exactly risk 2 below, and the `trace: false` mitigation on the hot polls is what pays for it. The retry only fires when `fetch` itself threw, which on loopback means a refused connection rather than a dropped in-flight request, so it cannot duplicate a side effect the server already performed.
2. Error messages change in error paths, and this is accepted. Every route answers `{ error }` and none answers `{ message }`, but roughly five call sites read `body?.message || 'Generation failed'` and so always discarded the server's real reason. `ApiError` reads `message`, then `error`, then a caller-supplied fallback, which means those five paths start showing the actual reason. Only ever visible after something has already failed.
3. `client/lib/api.ts` also holds `SearchResult`, `SearchMatch` and `EpubPreview` type declarations, not just three functions. Those types are replaced by `shared/responses.ts` equivalents when the module is folded into `api/`.

`api/sse.ts`: `streamGeneration(path, init, onEvent)` (fetch + `parseSSEStream`), `subscribeToTasks(handlers)` (EventSource + 3s reconnect), `streamText(path, init, onChunk)` (`/api/chat`), `streamNdjson(path, init, onLine)` (`/api/profile/interview`).
`api/urls.ts`: `coverUrl(book)`, `audiobookFileUrl(bookId, generatedAt)`, `voicePreviewUrl(voiceId)` — the 6 non-fetch `apiUrl()` sites (App 2157/2179, SeriesView 97, SeriesStackCard 45, ChapterListenButton 87, AudiobookVoiceModal 144, AudiobookSettingsDialog 160).

### Call-site inventory (84 raw sites → 1 module)

| Client fn (module) | Call sites `file:line` |
|---|---|
| `listBooks` (books) | App:245 |
| `getBook` | App:475, App:501, ReaderPage:86, ReaderPage:160, CreationView:213, BookOverviewModal:36 |
| `updateBook` (PATCH) | App:688, 711, 763, 778, 876, 1140, 1164, 1171; CoverGenerationModal:144 |
| `deleteBook` | App:505, App:731 |
| `resetBook` | App:748 |
| `rateBook` | App:1580, App:1607, ReaderPage:329 |
| `searchBooks` | App:357, lib/api.ts:21 |
| `getToc` | ReaderPage:141, CreationView:214, BookOverviewModal:35, QuizReviewPage:37 |
| `generateAllChapters` | App:542 |
| `exportEpub` / `downloadEpub` | App:560 / App:584 |
| `getChapter` (chapters) | useSectionNavigation:73 |
| `saveChapterProgress` | useSectionNavigation:160, ReaderPage:256 |
| `submitChapterFeedback` | ReaderPage:421 |
| `getChapterQuiz` | ReaderPage:271 |
| `generateFinalQuiz` | ReaderPage:297 |
| `streamNextChapter` (SSE) | ReaderPage:378 |
| `streamChapterRegeneration` (SSE) | ReaderPage:455 |
| `streamGenerationResume` (SSE) | ReaderPage:105 |
| `createBookStream` (SSE, creation) | CreationView:158 |
| `startFirstChapterStream` (SSE) | CreationView:64 |
| `reviseTocStream` (SSE) | CreationView:115 |
| `suggestTopic` / `suggestDetails` / `createSkeleton` | WizardModal:633 / 707 / 667 |
| `suggestCoverPrompt`/`generateCover`/`uploadCover`/`deleteCover` (covers) | CoverGenerationModal:52 / 74 + App:465 / 104 / 126 |
| `getBookAudiobook` (audiobook) | App:610, useChapterAudio:29 |
| `generateAudiobook` | AudiobookVoiceModal:162 |
| `getEngineStatus` | App:626, AudiobookSettingsDialog:88 |
| `installEngine` | App:642, AudiobookSettingsDialog:185 |
| `listVoices` | AudiobookVoiceModal:96, AudiobookSettingsDialog:89 |
| `revealAudiobook` | App:656 |
| `getProfile` (profile) | SettingsMenu:101, SettingsMenu:112, ProfileDialog:38, SkillsPanel:55, AudiobookSettingsDialog:87, ProfileUpdatePage:59 |
| `saveProfile` | ProfileDialog:52, SkillsPanel:39, AudiobookSettingsDialog:241, ProfileUpdatePage:202 |
| `suggestSkills` / `getProfileSuggestions` | SkillsPanel:110 / ProfileUpdatePage:69 |
| `streamInterview` (NDJSON) | useInterviewChat:30 |
| `getSkillProgress` (progress) | ReviewProgressPage:31, SkillDetailPage:31 |
| `saveApiKey`/`removeApiKey`/`getApiKeyStatus`/`checkHealth`/`getProviderModels` (settings) | App:158,175 + SettingsMenu:159 / SettingsMenu:180 / App:194 / App:211 / useProviderModels:33 |
| `cancelTask` / `subscribeToTasks` (tasks) | BackgroundTasksFooter:69 / useBackgroundTasks:54, GenerateAllModal:28 |
| `streamChat` (chat) | useStreamingChat:33 |
| `previewEpubImport` / `confirmEpubImport` (import) | lib/api.ts:37 / :56 |

## 4. Dialog state machine (replaces 21 `useState`s in App.tsx)

```ts
// features/library/dialogs/dialog-machine.ts
export type LibraryDialog =
  | { kind: 'wizard' }
  | { kind: 'apiKey' }
  | { kind: 'rename'; book: BookSummary; title: string; subtitle: string }
  | { kind: 'renameSeries'; seriesName: string; books: BookSummary[]; newName: string }
  | { kind: 'delete'; book: BookSummary; confirmText: string }
  | { kind: 'reset'; book: BookSummary; confirmText: string }
  | { kind: 'rate'; book: BookSummary; rating: number }
  | { kind: 'overview'; book: BookSummary }
  | { kind: 'cover'; book: BookSummary }
  | { kind: 'editTags'; book: BookSummary }
  | { kind: 'setSeries'; book: BookSummary }
  | { kind: 'generateAll'; book: BookSummary; taskId: string }
  | { kind: 'audiobookDownload'; missingBytes: number; missing: { model: boolean; ffmpeg: boolean } }
  | { kind: 'audiobookVoice'; book: BookSummary; mode: 'firstTime' | 'normal' | 'regenerate' }
  | { kind: 'audiobookRegenerate'; book: BookSummary }
  | { kind: 'import'; preview: EpubPreview; fileBase64: string; filename: string }

export type LibraryMenu =
  | { kind: 'book'; book: BookSummary; x: number; y: number }
  | { kind: 'series'; seriesName: string; books: BookSummary[]; x: number; y: number }

type Action =
  | { type: 'open'; dialog: LibraryDialog }
  | { type: 'edit'; patch: Partial<LibraryDialog> }   // draft fields: title, confirmText, rating
  | { type: 'close' }
  | { type: 'openMenu'; menu: LibraryMenu }
  | { type: 'closeMenu' }

interface DialogState { dialog: LibraryDialog | null; exiting: LibraryDialog | null; menu: LibraryMenu | null }
```

`close` moves `dialog` into `exiting`. `useLibraryDialogs()` exposes `payloadOf(kind)` reading `dialog ?? exiting`, so the shadcn `data-closed:animate-out` (100ms, `ui/dialog.tsx:34`) still renders its content while fading — without this the always-mounted dialogs (rename/delete/reset/rate/overview/import) would flash empty on close, which is a visual regression.

Deliberately **not** in the machine, with a comment saying why: `pendingAudiobookForBookId` (an intent that outlives its closed dialog — install finishes minutes later and then opens the voice modal) and `mutating` (request-in-flight flag shared by rename/delete/reset/rate).

## 5. Constants + predicates

`client/lib/constants.ts` (values verbatim from current code): `HEALTH_POLL_MS 10_000` (App:218), `GENERATING_POLL_MS 1_000` (App:421), `EXTERNAL_CHAPTER_POLL_MS 5_000` (ReaderPage:158), `AUDIOBOOK_POLL_MS 4_000` (useChapterAudio:52), `TASK_STREAM_RECONNECT_MS 3_000` (useBackgroundTasks:119), `TASK_ROW_DISMISS_MS 10_000` (BackgroundTasksFooter:57), `API_KEY_DEBOUNCE_MS 200` (SettingsMenu:172), `SKILL_SAVE_DEBOUNCE_MS` (SkillsPanel:37), `SEARCH_FOCUS_DELAY_MS 100` (LibraryToolbar:69,110), `GENERATE_ALL_CLOSE_MS 1_500/1_000` (GenerateAllModal:44,52), `CREATION_ADVANCE_MS 600` (CreationView:104), `COPY_RESET_MS 2_000` (CodeBlock:20), toast durations `12_000/10_000/8_000` (App:383,672,675; WizardModal:693), `DEFAULT_API_PORT 3147`, `HEALTH_PREWARM_ATTEMPTS 30`/`_INTERVAL_MS 50`/`RETRY_DELAY_MS 200`/`PROBE_TIMEOUT_MS 5_000` (api-base), reader scroll `PAGE_SCROLL_FRACTION 2/3`, `LINE_HEIGHT 1.625`, `SMOOTH_SCROLL_MS 320/420/240`, `AT_BOTTOM_EPSILON_PX 40`.

Resolved while writing the module: `SKILL_SAVE_DEBOUNCE_MS` is 300, not the 200 its neighbour uses. The single `GENERATE_ALL_CLOSE_MS` became two constants, `GENERATE_ALL_DONE_CLOSE_MS 1_500` and `GENERATE_ALL_CANCELLED_CLOSE_MS 1_000`, since the two literals mark different outcomes. The three toast durations are named for their situations rather than their lengths, as `AUDIOBOOK_READY_TOAST_MS`, `CLIPBOARD_FALLBACK_TOAST_MS` and `MCP_COMMAND_TOAST_MS`. `LINE_SCROLL_LINES 5` was missing from the list and is included.

## 6. Ordered tasks

| # | Task | Depends | Acceptance check |
|---|---|---|---|
| **S1** | `api/http.ts` (relocate tracedFetch + `request<T>` + `ApiError`), `api/sse.ts`, `api/urls.ts`, `lib/constants.ts`. Port `api-base.test.ts`. Tests first. | shared #5,#9 | `pnpm test` green; new tests cover retry, ApiError, trace-off path |
| **S2** | All 14 `api/*.ts` endpoint modules, one function per endpoint, types from `@shared`. No call-site changes yet. Unit tests with mocked fetch per module, written with/before each module. | S1, phase-2-foundations merged | `tsc --noEmit` clean; every row in §3 has an exported fn; ≥1 test per module |
| **S3** | Mechanical slice move: `git mv` per §2 table, imports rewritten with **ts-morph** (not sed). No logic edits. Delete `PageTurnOverlay`, `usePageTurnGesture`. | S2 | `git diff --stat` shows renames only; `pnpm test` + `tsc` + `pnpm lint` green; `electron:preview` boots |
| **S4** | **Library**: App.tsx → `LibraryPage.tsx` + `useBooks` (fetch/poll/focus-refetch/optimistic merge) + `useHealthCheck` + `useElectronApiKeys` (App:147-205 IPC bootstrap) + `useLibrarySearch`; migrate all 29 App call sites to `api/`. | S3 | `wc -l client/app/App.tsx` ≤ 160; App contains only providers + view routing; library grid/list/DnD/series/context menus visually identical |
| **S5** | **Reader**: ReaderPage → `useChapterGeneration` (generate-next + regenerate + retry), `useGenerationResume` (mount fetch + resume SSE, ReaderPage:83-150), `useExternalGenerationPoll` (154-172), `useReaderScroll` (smoothScrollBy + autoscroll + scroll-detect, 198-223/494-534); migrate 11 call sites. | S3 | `wc -l ReaderPage.tsx` ≤ 400; quiz→feedback→generate→read loop unchanged; resume-mid-generation still renders buffered text without autoscroll |
| **S6** | **Creation**: WizardModal + CreationView + ReviseTocPanel to `api/creation.ts`; extract `useTocStream`/`useChapterOneStream`. | S3 | TOC streams, revise, approve, chapter-1 auto-advance all unchanged |
| **S7** | **Audiobook**: 4 modals + `useChapterAudio` → `api/audiobook.ts`; add `useAudiobookEngine` (status/install/voice-preview). | S3 | install → voice → generate → reveal chain works; per-chapter Listen buttons still light up progressively |
| **S8** | **Settings + Profile**: SettingsMenu profile checks (100-117) → `useLearningProfile`; key save/remove → `api/settings.ts`; ProfileDialog/SkillsPanel/ProfileUpdatePage/InterviewPanel/AudiobookSettingsDialog migrated. | S3 | `wc -l SettingsMenu.tsx` ≤ 420; badge states (no key / no profile) identical |
| **S9** | **Progress + Quiz + Chat + Import**: remaining 8 call sites. | S3 | pages render identically |
| **S10** | **Dialog machine**: reducer + `useLibraryDialogs` + dialog components moved to `features/library/dialogs/`. Reducer unit tests written first (open/edit/close/exiting). | S4 | 21 useStates → 1 reducer + 2 documented flags; no empty-content flash on close |
| **S11** | **store split**: `store/` folder, one file per slice, `persist.ts` holds transforms + `persistConfig`. `store/index.ts` re-exports the *exact* current public surface. | S3 | reducer keys, persist `key: 'tutor'`, blacklist, and 4 transforms byte-identical; snapshot persisted JSON before/after and diff → empty; existing imports unchanged |
| **S12** | **Constants sweep + verification**: replace timing literals with `lib/constants.ts`; verify zero remaining status literals (P1 did the swap). | S4–S9 | `rg "status === '(generating|reading|complete|toc_review|failed)" client` → 0 hits outside `shared/`; `rg "setInterval\(.*, [0-9]{3,}"` → 0 |
| **S13** | **Boundaries + a11y + cleanup**: ESLint `no-restricted-syntax` banning `CallExpression[callee.name='fetch']` and `NewExpression[callee.name='EventSource']` outside `client/api/**`; plus `no-restricted-imports` for `@server/*` from client. A11y: `aria-label` on icon-only buttons (ReaderPage:698 back, App context-menu buttons, BackgroundTasksFooter:154/163, ChapterBreakdownList:68, CoverGenerationModal:181, AudiobookVoiceModal:226, AudiobookSettingsDialog:348, ProfileDialog:114/124), `role="status" aria-live="polite"` on the Toaster (`app/providers.tsx`) and on generation-stage text. | S1–S12 | `pnpm lint` zero warnings/errors; `rg "fetch\(" client --glob '!client/api/**'` → 0; every `size="icon*"`/icon-only button has `aria-label` |

## 7. Parallelization

- **Serial spine**: S1 → S2 → S3. S3 is a single agent (repo-wide renames); nothing else may touch `client/` while it runs.
- **Fan out after S3** (6 concurrent, one worktree each, disjoint directories): S4 (library — biggest, start first), S5 (reader), S6 (creation), S7 (audiobook), S8 (settings+profile), S9 (misc), S11 (store — fully independent, can start at S3).
- S10 waits on S4 (same files). S12 and S13 are sweeps — single agent each, after the fan-out merges.
- Merge order: S11 → S9 → S6/S7/S8 → S5 → S4 → S10 → S12 → S13. Rebase each on the previous; only S4 and S10 share files.

## 8. Risks

1. **Persisted-state drift (S11)** — highest. Renaming a reducer key or reordering `transforms` silently wipes user reading positions. Mitigation: snapshot `localStorage['persist:tutor']` (or electron-store) before/after and assert byte equality; keep `store/index.ts` as the sole import path.
2. **Preflight on hot polls (S1)** — `X-Trace-Id` turns simple GETs into preflighted ones; the 1s library poll would double its request count. Mitigation: `trace: false` on the 4 polling GETs (health, books, chapter status, audiobook).
3. **Exit-animation flash (S10)** — covered by the `exiting` field; verify by opening then closing rename/delete/import and watching the 100ms fade.
4. **SSE reconnect churn** — `useBackgroundTasks` deps include inline callbacks from App (App:373-414), so the EventSource currently tears down on many renders. Extraction with stable refs reduces reconnects. Architect-sanctioned invisible improvement — call it out in the PR rather than shipping it silently.
5. **StrictMode double-invoke** — new hooks must keep the existing `AbortController`/`cancelled` cleanup patterns (ReaderPage:84,149; useSectionNavigation:100,115) or dev mode double-fires generation.
6. **`window.electronAPI` optional chaining** — the IPC bootstrap (App:147-205) and `saveFile`/`showInFinder`/`setBusyState` calls must stay optional in web mode; the extracted hook needs a no-Electron test path.
7. **ts-morph** — dynamic imports and `vite.config.ts` alias must both be updated or the Electron build silently resolves stale paths.
8. **Test environment** — vitest is `environment: 'node'` with no jsdom/@testing-library. All Phase 3 tests are node-env unit tests (API client with mocked fetch, dialog reducer, predicates), matching the existing `api-base.test.ts` pattern. Architect affirmed: no jsdom this effort.

## 9. Phase gate

- [ ] `pnpm test` green (all pre-existing tests plus new `api/` and reducer tests)
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm lint` zero warnings (including the new boundary rules)
- [ ] `rg "fetch\(|new EventSource" client --glob '!client/api/**'` → 0 hits
- [ ] `wc -l`: App.tsx ≤ 160, ReaderPage ≤ 400, SettingsMenu ≤ 420, no client file > 500 except `LibraryPage.tsx` and `client/features/creation/wizard-suggestions.ts`

**Corrected during execution, the size targets cost more than the plan budgeted.**

Three of these numbers were unreachable by the work the plan assigned, and finding that out took an implementer each time. Recording it so the next phase budgets honestly.

- **ReaderPage.** The plan names four hooks and a 400-line target in the same row. Those four take it from 1083 to 857, because roughly 495 of the remaining lines are a single render block no hook touches. Reaching 362 took two more hooks, `useReaderQuiz` and `useChapterCompletion`, and splitting the render into eight components along its existing `phase` seams.
- **LibraryPage.** S10's dialog extraction alone cannot reach the 600 the task implies. The file is 1190, and roughly 760 of those lines are drag and drop, filter and sort computation, and the grid and list markup, none of which is dialog code and none of which the plan assigns to any task. Left as is rather than improvised on, and called out here so it can be scoped deliberately.
- **WizardModal.** Not named in any task, yet it breached the 500-line gate at 920. It turned out to be 521 lines of literal data, one list of cover art directions and one of topic suggestions, now in `wizard-suggestions.ts`. That data module is itself over 500 lines on purpose, since a rule that splits a list of topic strings across files is the rule being wrong.

**Two further findings from execution.**

S4 needed two hooks beyond the four named. The background task stream must be subscribed from a component that never unmounts, because a narrator install or an EPUB export can finish minutes later while the reader is on another screen and the stream never replays a missed event. That pins the audiobook dialog cluster to `App.tsx` rather than `LibraryPage.tsx`.

The EPUB import dialog now fades out over the same hundred milliseconds as its siblings, where it previously vanished instantly. Section 4 lists it among the always-mounted dialogs needing `payloadOf`, but it also carries its own `if (!preview) return null`, so it never flashed empty, it simply cut. Following the plan makes it consistent with every other dialog, and a fade appearing is a smaller change than content flashing, so it stands.
- [ ] Zero `interface Book` declarations left in `client/`
- [ ] `pnpm electron:preview` boots; manual pass: create book → TOC → chapter 1 → quiz → feedback → next chapter → finish → rate; library grid + list + manual DnD + series + all 16 dialogs + context menus; audiobook install/generate/reveal; EPUB import + export
- [ ] Persisted-state diff empty across the store split
- [ ] Conventional commits, one PR for Phase 3
