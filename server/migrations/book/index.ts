import type { MigrationStep } from '../migrate.js'
import { materializeBookDefaults } from './001-materialize-defaults.js'

/**
 * The book migration chain, in order. Checked for contiguity against
 * CURRENT_BOOK_SCHEMA_VERSION by chains.test.ts, so an entry missing from
 * this array fails a test rather than silently shipping. To add a
 * migration, see server/migrations/README.md.
 */
export const BOOK_MIGRATIONS: readonly MigrationStep[] = [materializeBookDefaults]
