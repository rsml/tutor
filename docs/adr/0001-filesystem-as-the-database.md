# 0001. Filesystem as the database

Status: Accepted
Date: 2026-07-21

## Context

Tutor is a single-user desktop app. A book's content is Markdown chapters plus YAML metadata, and readers expect to read, diff, back up, and hand-edit their own books. SQLite was the obvious alternative to a plain filesystem layout.

## Decision

Each book lives at `books/{id}/` under the OS data directory, holding `meta.yml`, `toc.yml`, `chapters/NN.md`, `progress.yml`, and `feedback/NN.yml`. [`createFsBookRepository`](../../server/adapters/fs-book-repository.ts) is the only adapter that touches these files, and every read is validated against a Zod schema before the caller sees it. Every write goes through [`fs-paths.ts`](../../server/adapters/fs-paths.ts)'s `writeYaml` helper, or an equivalent inline pattern for chapter Markdown, which writes a `.tmp` file first and renames it into place, so a reader never observes a half-written file. [`createRecoverFromCrash`](../../server/services/recover-from-crash.ts) runs once at boot. It sweeps any `.tmp` leftovers from an interrupted write and resets a book's status when the process died mid-generation.

`meta.yml` and `learning-profile.yml` also carry a schema version stamp that is checked on every read. That stamp was added after this decision. See [ADR 0007](0007-versioned-library-with-forward-only-migrations.md) for the migration path it enables.

## Consequences

**What this buys**
- Chapters and metadata stay human-readable and git-friendly, and a book directory is trivially backed up by copying it.
- EPUB import and export become plain file operations against the same layout.

**What this costs**
- There is no transaction across files, so a multi-file update can partially land if the process dies mid-write. Boot-time recovery narrows this risk, but it does not eliminate it.
- There is no query layer, so listing the library means reading every book's `meta.yml`.
- Invariants live in application code rather than in a schema the filesystem can enforce.
- Crash safety is this app's own responsibility, which is acceptable because exactly one process holds the data directory at a time.

## Revisit when

Tutor gains multiple users or any kind of sync, or the library grows past a few hundred books and reading every `meta.yml` on each list call becomes noticeable.
