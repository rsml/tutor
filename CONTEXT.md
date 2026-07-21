Up: [ARCHITECTURE.md](ARCHITECTURE.md)

# Domain language

The words this codebase uses, and the type or module that owns each one. Names here are the ubiquitous language. They appear unchanged in schemas, services, components, prompts, and UI copy, and a synonym for one of them is a bug in the writing rather than a stylistic choice.

Several words in this domain are overloaded, some of them badly. The later sections exist because those collisions are real and permanent, so the fix is to qualify them consistently rather than to rename around them.

## Core domain

| Term | Meaning | Owned by |
|---|---|---|
| **Book** | A generated learning artifact. One book is one directory on disk and one `BookMeta` record. | `BookMetaSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Chapter** | One roughly 1,500-word Markdown unit, addressed by a 1-based `chapterNum`, stored as `chapters/NN.md`. | [`server/adapters/fs-book-repository.ts`](server/adapters/fs-book-repository.ts) |
| **TOC** | The chapter plan the reader reviews and revises before any chapter is generated. | `TocSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Feedback** | The reader's response to a chapter just read. Submitting it is what triggers the next chapter. | `FeedbackSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Quiz** | Three questions after a chapter, or a longer final quiz across the whole book. | `QuizSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Progress** | Per-chapter scroll fraction plus a completed flag, where completed means at least 90 percent. | `ProgressSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **LearningProfile** | The global reader model, meaning identity, `aboutMe`, `Preferences`, and `Skill[]`, with optional per-book `profileOverrides`. | `LearningProfileSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Audiobook** | An M4B with chapter markers, synthesized locally from a book's chapters. | `AudiobookManifest` in [`shared/domain.ts`](shared/domain.ts) |
| **Series** | A named ordering of related books. It is two fields on `BookMeta`, `series` and `seriesOrder`, and has no entity of its own. | `BookMetaSchema` in [`shared/domain.ts`](shared/domain.ts) |
| **Interview** | The conversational flow that fills in a LearningProfile by asking the reader questions. | [`server/services/interview-profile.ts`](server/services/interview-profile.ts) |
| **Background task** | A cancellable long-running server operation with progress streamed over SSE. | `BackgroundTasks` port in [`server/ports/background-tasks.ts`](server/ports/background-tasks.ts) |

A background task is one of five `TaskType` values, `generate-all`, `generate-epub`, `generate-cover`, `install-audiobook`, and `generate-audiobook`. The wire shape the client receives is `ClientTask` in [`shared/responses.ts`](shared/responses.ts).

## The Skill collision

**Skill** in the domain is a named competency with a 1 to 10 level on the LearningProfile, plus its per-chapter `subskill` weightings on the TOC. **Agent Skill** is a `SKILL.md` under [`.claude/skills/`](.claude/skills) that instructs Claude Code.

Both keep their names. The domain type is never renamed to avoid the collision, and prose always qualifies which one it means by writing "learner Skill" or "Agent Skill".

## Overloaded terms

**Status** is three unrelated enums and they are never interchangeable.

| Enum | Values | Lives in |
|---|---|---|
| `BookStatus` | `generating_toc`, `toc_review`, `generating`, `reading`, `complete`, `failed` | [`shared/book-status.ts`](shared/book-status.ts) |
| `TaskStatus` | `running`, `done`, `error`, `cancelled` | [`shared/responses.ts`](shared/responses.ts) |
| `GenerationStage` | `streaming`, `saving`, `quiz`, `done`, `error` | [`shared/responses.ts`](shared/responses.ts) |

`BOOK_STATUSES` is the single source of truth for the first of those, and the six predicates beside it (`isGenerating`, `isGeneratingToc`, `isAwaitingTocApproval`, `isReadable`, `isComplete`, `isFailed`) are the only sanctioned way to ask about a book's status. The literals themselves appear nowhere else.

**Job** and **task** are not synonyms. A background task is the live, in-memory unit the tray shows. A job is its persisted record on disk, written by the `JobJournal` port so an interrupted task can be resumed after a restart. The schemas are `GenerationJobSchema` and friends in [`shared/domain.ts`](shared/domain.ts), and `GenerationJobType` covers every `TaskType` plus `generate-chapter`, which is the just-in-time single chapter path that never went through background tasks. Use "job" only when you mean the durable record.

**Section** is an intra-chapter slice used for pagination and reader navigation, in `client/lib/split-sections.ts` and `client/features/reader/hooks/useSectionNavigation.ts`. It is never a synonym for Chapter.

**Review** is two unrelated things. `toc_review` is the BookStatus in which a generated TOC is waiting for the reader to approve it. Smart Review is the spaced-repetition flow that re-quizzes a reader on questions they missed, in `client/features/quiz/components/SmartReviewFlow.tsx`.

**Prompt** and **brief** are different lengths of the same idea. A `prompt` is the reader's short topic request stored on `BookMeta`. A `brief` is the long agentic-generation specification stored per book and consumed by the MCP authoring services.

**Summary** is either a `ChapterSummary`, which is cross-chapter context fed into generation, or the book-completion summary the reader sees at the end. Qualify which.

**Reference** is source material saved for agentic generation, as `ReferenceEntry` in [`shared/domain.ts`](shared/domain.ts). It is not a citation.

**Narration** is chapter Markdown transformed for speech, in [`server/services/markdown-to-narration.ts`](server/services/markdown-to-narration.ts). It is a derived form of the chapter text and not the chapter text itself.

**Progress** appears three ways, as reading scroll progress, as `TaskProgress` on a background task, and as skill progress on the profile. Always qualify it.

**Error kind** is `AiErrorKind` in [`shared/responses.ts`](shared/responses.ts), one of `auth-failed`, `rate-limited`, `overloaded`, `timed-out`, `network-failed`, `content-refused`, or `unknown`. It classifies why an AI call failed, which is what decides whether the adapter retries. It is not a status.

## Numbering

`chapterNum` is 1-based and canonical, and it is what appears in file names, routes, and every persisted record. `chapterIndex` is 0-based, array-local, and never crosses a module boundary. A function that takes one and returns the other is doing a conversion and should say so in its name.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/adr/](docs/adr/README.md), [shared/README.md](shared/README.md), [docs/api-routes.md](docs/api-routes.md)
