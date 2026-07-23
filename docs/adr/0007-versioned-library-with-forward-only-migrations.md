# 0007. Versioned on-disk library with forward-only migrations

Status: Accepted
Date: 2026-07-21

## Context

The library is plain YAML on the filesystem, and its shape used to be implied by whichever Zod `.default()` happened to be in the running build. An older library meeting a newer schema failed at read time with no diagnosis of what was wrong or how old the data was.

## Decision

`meta.yml` on each book and `learning-profile.yml` globally now carry a `schemaVersion` field, defined in [`../../shared/schema-version.ts`](../../shared/schema-version.ts). An absent field reads as version 1, since every build before this one wrote neither file with a version at all.

- Each of the two gets its own ordered chain of pure forward-only steps, walked by `migrateForward` in [`../../server/migrations/migrate.ts`](../../server/migrations/migrate.ts) and documented in [`../../server/migrations/README.md`](../../server/migrations/README.md).
- A `LibraryMigrator` port, defined in [`../../server/ports/library-migrator.ts`](../../server/ports/library-migrator.ts) and implemented by [`../../server/adapters/fs-library-migrator.ts`](../../server/adapters/fs-library-migrator.ts), runs `migrate()` once inside `runStartupTasks` in [`../../server/index.ts`](../../server/index.ts), before crash recovery. It has to run first, because recovery reads and writes `meta.yml` through the current schema and would silently skip a book still at an old version.
- `buildServer` itself stays mutation-free. Only `runStartupTasks` touches disk.
- The first time a document is migrated, the migrator writes a one-time backup of its exact original bytes alongside it, named `meta.yml.bak-v1` for every migration written so far, since version 1 is the only version any released build has ever produced.
- A document newer than the running build supports is never written to and is reported failed, raising `SchemaTooNewError` on any later direct read.
- Committed fixture libraries at old schema versions, under `server/migrations/__fixtures__/`, are the test corpus proving each step round-trips.

## Consequences

**What this buys**

- One auditable migration pass at boot, logged as a single line, instead of read-time coercion scattered across whichever code happens to read a file first.
- Schemas can stop leaning on `.default()` to paper over an old shape.

**What this costs**

- There is no backward migration, so downgrading the app fails loudly with `SchemaTooNewError` instead of silently corrupting a newer library.
- A book added to disk while the app is already running waits for the next boot before it is migrated.

## Revisit when

The library outgrows the filesystem, or a migration ever needs to be reversible.
