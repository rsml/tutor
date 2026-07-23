Up: [ARCHITECTURE.md](../../ARCHITECTURE.md)

# server/ports/

A port is an interface owned by the server core, named for the capability it provides, never for the vendor behind it.

| Port | Capability |
|------|------------|
| `text-generation` | streaming and structured text generation against an AI model |
| `key-vault` | storing and retrieving AI provider API keys |
| `image-generation` | turning a prompt into a cover image, with provider fallback |
| `book-repository` | a book's YAML metadata and markdown text, TOC, chapters, quizzes, feedback, progress, profile |
| `artifact-store` | a book's binary artifacts, covers, the exported EPUB, audiobook audio and its manifest |
| `speech-synthesis` | text-to-speech narration for audiobook generation |
| `audio-assembly` | probing and concatenating narrated chapter audio into one M4B audiobook |
| `diagram-renderer` | rendering mermaid diagram source into embeddable EPUB markup |
| `epub-import` | parsing an EPUB file into data the app can preview or import |
| `epub-export` | rendering a book's chapters into EPUB bytes |
| `background-tasks` | tracking a long-running task so it can be started, observed, and cancelled |
| `job-journal` | persisting an in-flight background job so it can be resumed after a restart |
| `library-migrator` | a forward-only migration pass over every book and the learning profile at startup |
| `clock` | the current time and fresh unique ids, as one seam |
| `os-file-manager` | revealing a file on disk in the OS's native file manager |

Every port ships an in-memory fake plus a contract test. The fake and the real adapter run the same contract, so a fake cannot drift from the thing it stands in for. Twelve of the seventeen adapters run it today.

The five that do not are the ones whose real subject would spend money against a provider, download a model, or reach a remote service on every run. `text-generation`, `image-generation`, `speech-synthesis`, and `diagram-renderer` are contract-tested against their fakes instead, and covered separately by their own adapter tests.

Nothing in this folder imports an AI SDK, `fs`, `fetch`, or an environment variable. That is adapter work.

To add a port, follow the `add-feature` Agent Skill at [add-feature/SKILL.md](../../.claude/skills/add-feature/SKILL.md).

## Contract conventions

- A missing entity is signalled by an error whose `code` is `'ENOENT'`, never by an `instanceof` check, because the error crosses an adapter boundary and a real adapter's own Node fs error carries that same code.
- A method that is deliberately synchronous stays synchronous. `JobJournal`'s own methods are synchronous specifically so a synchronous `BackgroundTasks` contract can be persisted without becoming async.
- `DiagramRenderer` returns an escaped-source fallback for a chart that fails to render. It never returns an empty string for that chart.

Related: [../README.md](../README.md), [../adapters/README.md](../adapters/README.md), [../services/README.md](../services/README.md), [../migrations/README.md](../migrations/README.md), [ADR 0005](../../docs/adr/0005-ai-sdk-behind-a-port.md)
