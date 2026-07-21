import type { MigrationStep } from '../migrate.js'
import { materializeProfileDefaults } from './001-materialize-defaults.js'

/**
 * The profile migration chain, in order. Checked for contiguity against
 * CURRENT_PROFILE_SCHEMA_VERSION by chains.test.ts, so an entry missing
 * from this array fails a test rather than silently shipping. To add a
 * migration, see server/migrations/README.md.
 */
export const PROFILE_MIGRATIONS: readonly MigrationStep[] = [materializeProfileDefaults]
