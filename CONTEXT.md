Up: [ARCHITECTURE.md](ARCHITECTURE.md)

# Domain language

The words this codebase uses, and the type or module that owns each one. These names appear unchanged in schemas, services, components, prompts, and UI copy. Do not invent synonyms for them.

Some words carry more than one meaning. Those collisions are permanent, so the sections below say how to qualify each one instead of renaming around them.

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

The rest of the overloads fit in one table.

| Word | It can mean | How to tell |
|---|---|---|
| **Section** | An intra-chapter slice used for pagination and reader navigation | Never a synonym for Chapter. Lives in `client/lib/split-sections.ts` |
| **Review** | `toc_review`, the BookStatus waiting for TOC approval, or Smart Review, the spaced-repetition re-quiz flow | Unrelated features. Name the one you mean |
| **Prompt** vs **brief** | A `prompt` is the reader's short topic request on `BookMeta`. A `brief` is the long generation spec the MCP authoring services consume | Length and audience |
| **Summary** | `ChapterSummary`, cross-chapter context fed into generation, or the completion summary the reader sees at the end | Qualify which |
| **Reference** | Source material saved for agentic generation, `ReferenceEntry` | Not a citation |
| **Narration** | Chapter Markdown transformed for speech | A derived form, never the chapter text itself |
| **Progress** | Reading scroll progress, `TaskProgress` on a background task, or skill progress on the profile | Always qualify |
| **Error kind** | `AiErrorKind`, why an AI call failed, `auth-failed` through `unknown` | Decides whether the adapter retries. Not a status |

## Numbering

`chapterNum` is 1-based and canonical, and it is what appears in file names, routes, and every persisted record. `chapterIndex` is 0-based, array-local, and never crosses a module boundary. A function that takes one and returns the other is doing a conversion and should say so in its name.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/adr/](docs/adr/README.md), [shared/README.md](shared/README.md), [docs/api-routes.md](docs/api-routes.md)
