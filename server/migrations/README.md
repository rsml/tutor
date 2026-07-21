Up: [ARCHITECTURE.md](../../ARCHITECTURE.md)
# server/migrations/

Forward-only, pure migrations for the two things Tutor persists at the top
of a data directory: a book's `meta.yml` and the library's
`learning-profile.yml`. Each has its own version counter
(`shared/schema-version.ts` explains why two counters instead of one) and
its own chain of steps, `book/` and `profile/`, walked by the same
`migrateForward` in `migrate.ts`.

A step is a pure function, `(raw: Record<string, unknown>) => Record<string,
unknown>`, with no `fs`, no zod, no knowledge of anything but the shape it
turns into the next shape. The I/O half, reading a file, calling
`migrateForward`, and writing the result plus a one-time backup, is the
`LibraryMigrator` port, a later phase task, not this directory.

## Adding a migration

1. Bump `CURRENT_BOOK_SCHEMA_VERSION` or `CURRENT_PROFILE_SCHEMA_VERSION` in
   `shared/schema-version.ts`.
2. Edit the schema in `shared/domain.ts` to match the new shape.
3. Add `NNN-name.ts` under `book/` or `profile/` as a `MigrationStep` whose
   `to` is the version you just bumped to, and register it in that
   directory's `index.ts`.
4. Commit a fixture library at the PREVIOUS version under `__fixtures__/`
   (see `__fixtures__/README.md`). Never edit an existing fixture, a
   fixture is a historical record of what some released build actually
   wrote, not something to bring up to date.
5. Add the round-trip test: run the new step over the new fixture, assert
   the fields it adds and the fields it must leave alone, and assert the
   result parses under the current Zod schema.

`chains.test.ts` fails the moment a version constant is bumped without a
matching step added to that chain's `index.ts`. Skipping step 3 above is
therefore a test failure at the next `pnpm test`, not a runtime surprise
discovered against someone's real library months later.

Steps are pure and forward-only by design. There is no downgrade path, a
step only ever knows how to turn `to - 1` into `to`, never the reverse.
That is deliberate. A bad forward migration can be fixed by writing another
one, but a migration nobody wrote is a step this app has no way to reverse
safely, so a library newer than a build supports fails loudly
(`SchemaTooNewError`) instead of a downgrade silently corrupting it.
