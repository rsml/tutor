import type { MigrationStep } from '../migrate.js'

/**
 * Migration 001: writes out `skills`, the one field LearningProfileSchema
 * has always backfilled at read time with `.default([])`. A v1
 * `learning-profile.yml` never wrote it, since it did not exist yet, so it
 * is simply absent on disk. Materializing it makes a migrated file
 * self-describing rather than dependent on whichever Zod default happens
 * to backfill it.
 *
 * `style`, `identity`, and every `preferences` value pass through
 * untouched. This step only ever adds `skills`, and only when missing, it
 * never overwrites a skills list some other write path already set.
 */
export const materializeProfileDefaults: MigrationStep = {
  to: 2,
  name: '001-materialize-defaults',
  migrate(raw) {
    return {
      ...raw,
      skills: raw.skills ?? [],
    }
  },
}
