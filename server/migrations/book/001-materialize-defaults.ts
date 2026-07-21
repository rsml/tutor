import type { MigrationStep } from '../migrate.js'

/**
 * Migration 001: writes out the fields BookMetaSchema has always backfilled
 * at read time with `.default([])`, `tags` and `audioGeneratedChapters`. A
 * v1 `meta.yml` never wrote either field, since neither existed yet, so
 * both are simply absent on disk. Materializing them makes a migrated file
 * self-describing: what is on disk is what the book actually has, instead
 * of being whatever a Zod default happens to backfill in the build that
 * happens to read it.
 *
 * Every other field passes through untouched. This step only ever adds the
 * two fields it owns, and only when they are missing, it never overwrites
 * a value some other write path already set.
 */
export const materializeBookDefaults: MigrationStep = {
  to: 2,
  name: '001-materialize-defaults',
  migrate(raw) {
    return {
      ...raw,
      tags: raw.tags ?? [],
      audioGeneratedChapters: raw.audioGeneratedChapters ?? [],
    }
  },
}
