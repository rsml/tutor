# Migration fixtures

Each directory here is a complete stand-in for a Tutor data directory
(`{dataDir}`) frozen at an old schema version. Tests copy one into a fresh
`mkdtemp()` and run the real `LibraryMigrator` against the copy, so the
committed fixture is never mutated and the migrator is exercised against
real files rather than an in-memory mock of a filesystem.

`{dataDir}/books/` holds both `learning-profile.yml` and one directory per
book, which is why every fixture has that nesting.

| Fixture | What it pins |
|---|---|
| `v1-library` | The ordinary case. A profile plus two books at version 1, one finished and one part way through generation. |
| `v1-profile-only` | A fresh install where the user set up a profile and never made a book. Proves the profile counter is independent of the book counter. |
| `v1-corrupt-book` | One readable book beside one whose `meta.yml` is not valid YAML. Proves a single bad book is reported rather than aborting the whole migration. |

Version 1 is what the app wrote before `schemaVersion` existed, so no fixture
file here carries that field. Version 1 also omits every value the Zod schemas
backfill with `.default()` at read time, `tags` and `audioGeneratedChapters`
on a book and `skills` on the profile, because the app never wrote them to
disk. Materializing exactly those is what migration `001` does.

**Do not "fix" a fixture.** A fixture is a historical record of what some
released build actually wrote. If it looks wrong or incomplete, that is the
point. Adding a new migration means adding a NEW fixture at the version
before it, and leaving these alone forever.

Up: [server/migrations](../README.md)
