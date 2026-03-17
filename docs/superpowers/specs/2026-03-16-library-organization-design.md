# Library Organization: Search, Filter, Sort, Tags, Series, Drag-to-Reorder, EPUB Import

## Context

The library page currently displays books in a flat grid with 4 hardcoded status filter tabs (All / In Progress / Not Started / Finished) and automatic sorting by reading status. As the library grows, this becomes insufficient — users can't find books quickly, can't categorize them, can't group related books into a series, and can't import books shared by other users. This design adds comprehensive library management while preserving the clean, centered grid layout.

## Design Decisions

- **Toolbar-driven** layout (not sidebar) — preserves the app's centered aesthetic, scales progressively from 3 books to 300
- **Tags** for flexible categorization (not folders) — a book can have multiple tags, no nesting complexity
- **Series** as book metadata (`series` + `seriesOrder`) — auto-groups by name, no separate registry
- **Stacked card** visual for series — collapsed into a single card with depth shadows, expands on click
- **No EPUB preview dialog** — import immediately, edit metadata after via context menu
- **Drag-and-drop** only in "Manual" sort mode — other sorts use computed ordering

## Architecture Overview

### Data Model Changes

**`server/schemas.ts` — BookMetaSchema additions:**

```typescript
// Add to BookMetaSchema
tags: z.array(z.string().min(1).max(50)).max(20).default([]),
series: z.string().min(1).max(100).optional(),
seriesOrder: z.number().int().min(1).optional(),
sortOrder: z.number().optional(),
imported: z.boolean().optional(),
```

These fields are optional with defaults, so existing books remain valid without migration.

**`server/schemas.ts` — New schemas:**

```typescript
export const PatchBookBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
  subtitle: z.string().max(150).optional(),
  showTitleOnCover: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),       // NEW
  series: z.string().min(1).max(100).nullable().optional(),           // NEW (null to remove)
  seriesOrder: z.number().int().min(1).nullable().optional(),         // NEW
  sortOrder: z.number().nullable().optional(),                        // NEW
})
```

### New API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/books/import` | Import an EPUB file → native book format |
| `GET` | `/api/books/search?q=...&full=true` | Search books (title/subtitle, optionally chapter content + TOC) |

Tag and series lists are derived client-side from the `GET /api/books` response — no dedicated endpoints needed.

### Modified API Routes

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/books` | Response now includes `tags`, `series`, `seriesOrder`, `sortOrder`, `imported`, `createdAt` per book |
| `PATCH` | `/api/books/:id` | Accept `tags`, `series`, `seriesOrder`, `sortOrder` in body |

All filtering and sorting is **client-side** — the full book list is already loaded. No server-side filter query params.

### Frontend `Book` Interface Changes

The `Book` interface in `src/App.tsx:34-49` must be extended with:

```typescript
// Add to Book interface
createdAt: string       // Required for "Date created" sort and "Created" filter
tags: string[]          // For tag filtering and display
series?: string         // For series grouping
seriesOrder?: number    // For ordering within series
sortOrder?: number      // For manual drag-and-drop ordering
imported?: boolean      // For showing "Imported" badge
```

The `fetchBooks()` function at `App.tsx:173-188` must map these fields from the server response.

---

## Feature Specifications

### 1. Toolbar (`LibraryToolbar` component)

**Replaces** the current filter tabs row (`App.tsx:500-538`).

**Layout:** Three zones in a single row below the header:
- **Left:** Search input (280px default, expands on focus) with `Cmd+F` shortcut and "Full" toggle checkbox
- **Center/Right:** Filter button (with active count badge), Sort dropdown, Grid/List view toggle

**When filters are active:** A second row appears below the toolbar showing dismissible filter chips with a "Clear all" link.

**Files to modify:**
- `src/App.tsx:500-538` — Replace tab nav with `<LibraryToolbar />`
- `src/store.ts` — Extend `settingsSlice` to persist: `librarySort`, `libraryView`, `libraryFilters`

**New files:**
- `src/components/LibraryToolbar.tsx` — Toolbar component
- `src/components/FilterPopover.tsx` — Filter popover (Status, Tags, Series, Rating, Date)

### 2. Search

**Default mode:** Filters `allBooks` client-side by matching `title` and `subtitle` against the query string (case-insensitive substring match). Instant, no debounce needed for local data.

**Full search mode:** Sends `GET /api/books/search?q=...&full=true` to the server. Server searches:
1. Book title + subtitle (from `meta.yml`)
2. TOC chapter titles + descriptions (from `toc.yml`)
3. Chapter markdown content (from `chapters/*.md`)

Returns matching book IDs with match context (which chapter/section matched). Results displayed with highlight indicators on matched books.

**Server implementation (`server/routes/books.ts`):**
- Read all book directories
- For each book, check title/subtitle first (fast path)
- If `full=true`, also read `toc.yml` and `chapters/*.md`, search with case-insensitive substring
- Return `{ bookId, matches: [{ type: 'title'|'toc'|'chapter', chapter?: number, snippet: string }] }`
- Debounce on client side (300ms) for full search since it hits disk

**Files to modify:**
- `server/routes/books.ts` — Add `GET /api/books/search`
- `src/lib/api.ts` — Add `searchBooks(query, full)` function

### 3. Filter Popover

Opens from the Filter button. Four sections:

1. **Status:** All / In Progress / Not Started / Finished (toggle buttons, replaces current tabs)
2. **Tags:** All known tags as toggleable chips (multi-select, OR logic — show books matching *any* selected tag)
3. **Rating:** Any / ★3+ / ★4+ / ★5 (toggle buttons)
4. **Created:** Any time / Last week / Last month / Last 3 months (toggle buttons)

No series filter — series are navigated via stacked cards, not filtered. Filters apply immediately (no "Apply" button). Cross-section logic is AND (e.g., "In Progress" AND "tag:react" AND "★4+").

**Tag and series lists** are derived client-side from the `GET /api/books` response — `Array.from(new Set(allBooks.flatMap(b => b.tags)))` for tags, similar grouping for series. No dedicated API endpoints needed.

**State:** Stored in Redux `settingsSlice` as `libraryFilters`:
```typescript
libraryFilters: {
  status: 'all' | 'in-progress' | 'not-started' | 'finished',
  tags: string[],
  ratingMin: number | null,     // null = any, 3, 4, or 5
  datePreset: 'any' | 'week' | 'month' | '3months',
}
```

**Files:**
- New: `src/components/FilterPopover.tsx`
- Modify: `src/store.ts` — Add `libraryFilters` to settings, replace `libraryTab`
- Modify: `src/App.tsx` — Replace tab-based filtering with `libraryFilters`-based filtering

### 4. Sort

Sort dropdown with options:
- **Date created** (default, newest first)
- **Title** (A→Z)
- **Rating** (highest first, unrated last)
- **Progress** (most progress first)
- **Recently read** (most recently opened, using `lastReadAt` timestamp — see below)
- **Manual** (uses `sortOrder` from meta.yml, enables drag-and-drop)

Each non-manual sort has an implicit direction (shown in dropdown). Clicking the same sort option toggles ascending/descending.

**"Recently read" requires a new timestamp.** The current `readingProgress.positions` has no timestamp. Add `lastReadAt: string` (ISO timestamp) to the `ReadingPosition` interface in `src/store.ts`. Updated whenever `setPosition` is dispatched. Note: this is client-side Redux state, so "Recently read" sort won't survive app reinstalls — acceptable for a local preference.

**State:** `librarySort` in Redux settings:
```typescript
librarySort: {
  field: 'date' | 'title' | 'rating' | 'progress' | 'recent' | 'manual',
  direction: 'asc' | 'desc',
}
```

**Sorting logic** is client-side — the full book list is already loaded. Series books are always grouped together regardless of sort (series group position is determined by the first book in the series according to the current sort).

**Files to modify:**
- `src/App.tsx:378-401` — Replace hardcoded sort with configurable sort
- `src/store.ts` — Add `librarySort` to settings

### 5. Grid/List View Toggle

**Grid view** (current): Responsive grid of BookCards. Series rendered as stacked cards.

**List view** (new): Table-like rows with columns: Title/Subtitle, Tags (inline chips), Progress (bar + fraction), Created (date), Rating (stars). Series groups have a collapsible header row.

**State:** `libraryView: 'grid' | 'list'` in Redux settings.

**New files:**
- `src/components/BookListView.tsx` — List view component
- `src/components/BookListRow.tsx` — Individual row component

**Files to modify:**
- `src/App.tsx:563-590` — Conditionally render grid or list based on `libraryView`

### 6. Tags

**Data:** `tags: string[]` on BookMeta. Lowercase, hyphenated. Max 20 per book, max 50 chars each.

**Normalization:** Applied server-side in the PATCH handler — `tag.trim().toLowerCase().replace(/\s+/g, '-')`. UI displays the normalized form. This ensures consistency regardless of client input (e.g., "React Hooks" → "react-hooks").

**Adding tags:** Via context menu → "Edit Tags" dialog, or via the import flow. Dialog shows an input with autocomplete (suggesting existing tags from other books) and current tags as removable chips.

**Existing tag list:** Derived from all books' `tags` arrays — `Array.from(new Set(allBooks.flatMap(b => b.tags)))`.

**New files:**
- `src/components/EditTagsDialog.tsx`

**Files to modify:**
- `src/App.tsx` — Add "Edit Tags" to context menu
- `server/schemas.ts` — Add `tags` to `BookMetaSchema` and `PatchBookBodySchema`
- `server/services/book-store.ts` — No code changes needed; the new fields are added to `BookMetaSchema` in `schemas.ts`, and `book-store.ts` already reads/writes meta via that schema

### 7. Series

**Data:** `series: string` + `seriesOrder: number` on BookMeta. A book belongs to at most one series.

**Setting series:** Via context menu → "Set Series" dialog. Input with autocomplete for existing series names, plus a number input for order.

**Visual treatment — Stacked Card + Folder Navigation:**
- Books sharing the same `series` value are collapsed into a single stacked card in the grid
- The card shows the series name, book count, and overall progress ("2 of 3 read")
- Visual: Shadow layers behind the card suggesting a stack of books
- **Click to navigate:** Clicking the stacked card navigates to a **series detail view** — a dedicated page showing the series' books in `seriesOrder` with a back button to return to the library grid. This is like opening a folder in Finder/Dropbox.
- The series detail view uses the same grid/list layout as the library, with the series name as the page title
- Back button follows the existing pattern: `absolute left-6 top-3 z-20` (see `ReaderPage.tsx:339-344`)
- Within the series view, books can be reordered (when in Manual sort mode)

**New files:**
- `src/components/SeriesStackCard.tsx` — Collapsed stacked card in library grid
- `src/components/SeriesView.tsx` — Series detail page (navigated to on click)
- `src/components/SetSeriesDialog.tsx` — Dialog for setting series + order

**Files to modify:**
- `src/App.tsx` — Group books by series before rendering; render `SeriesStackCard` for grouped books; add `{ type: 'series', seriesName: string }` to the view union type; render `SeriesView` when active
- `server/schemas.ts` — Add `series`, `seriesOrder` to `BookMetaSchema` and `PatchBookBodySchema`

### 8. Drag-and-Drop Reordering

**Only active** when sort mode is "Manual". Drag handles (⠿) appear on book cards.

**Implementation:** Use `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, accessible, React-native).

**Position storage:** `sortOrder` as float in `meta.yml`. Insertions use midpoint between neighbors (e.g., inserting between `sortOrder: 1.0` and `sortOrder: 2.0` gives `1.5`). Initial values assigned as integers on first switch to Manual sort. **Rebalancing:** When the gap between adjacent items falls below `1e-10`, re-assign integer sort orders to all books to prevent floating-point precision loss.

**Behaviors:**
- Drag a card → elevated shadow + slight scale
- Drop target → dashed outline placeholder
- On drop → PATCH book's `sortOrder`, re-render grid
- Series stacks can be dragged as a unit
- Within an expanded series, books can be reordered (updates `seriesOrder`)

**New dependency:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Files to modify:**
- `src/App.tsx` — Wrap grid in `DndContext` + `SortableContext` when sort is Manual
- `src/components/BookCard.tsx` — Add optional drag handle, `useSortable` hook integration
- `server/schemas.ts` — Add `sortOrder` to `BookMetaSchema` and `PatchBookBodySchema`

### 9. EPUB Import

**Flow:** User selects .epub file → server parses metadata → preview dialog shows title, chapter count, cover → user confirms → server converts to native format → book appears in library → toast notification.

**Preview dialog:** Shows extracted title, subtitle (if any), chapter count, format version, cover thumbnail (if present). Optional fields: tags input (with autocomplete) and series name + order. "Import" button confirms, "Cancel" aborts. This is a lightweight dialog — the server only parses metadata at this stage, not the full content.

**Two-phase server processing:**
- Phase 1 (`POST /api/books/import/preview`): Parse EPUB metadata only → return title, subtitle, chapterCount, hasCover, coverBase64 (thumbnail)
- Phase 2 (`POST /api/books/import/confirm`): Full conversion — chapters to Markdown, cover saved, book directory created

**Entry points:**
1. "Import" button in the header (next to "New Book")
2. Drag `.epub` file onto the library grid (drop zone with visual overlay)

Electron File menu entry point deferred to a later iteration (requires IPC bridge in `electron/main.ts`).

**File upload approach:** Use base64 encoding in the request body (consistent with the existing `UploadCoverBodySchema` pattern at `server/schemas.ts:239-242`). EPUB files for generated books are small (< 5MB typically). This avoids needing `@fastify/multipart`.

```typescript
export const ImportEpubBodySchema = z.object({
  base64: z.string().max(15_000_000), // ~10MB encoded
  filename: z.string().min(1).max(255),
})

export const ImportEpubResponseSchema = z.object({
  book: BookMetaSchema,
})
```

**Server processing (`POST /api/books/import`):**
1. Decode base64 → write to temp file
2. Parse with `@nicolo-ribaudo/epub` package — extract metadata, chapters, cover
3. Create new book directory: `books/{generated-id}/`
4. Convert EPUB XHTML chapters → Markdown (lightweight HTML-to-MD using `turndown` package)
5. Write `meta.yml` with `status: reading`, `imported: true`, `prompt: "Imported from EPUB"`
6. Write `toc.yml` from EPUB's navigation structure
7. Save chapters as `01.md`, `02.md`, etc.
8. Save cover image if present
9. Return the new book's metadata

**Imported books:** `imported: true` in meta.yml. These books:
- Are fully readable in the reader
- Support all organizational features (tags, series, rating, progress tracking)
- Do NOT support AI generation features (no "Generate Next Chapter", no feedback-driven adaptation)
- Show an "Imported" badge instead of generation status

**Error handling:**
- Corrupted/unreadable EPUB → return 400 with descriptive error message, toast on frontend
- EPUB with no chapters → import as empty book with `totalChapters: 0`, `status: reading`
- DRM-protected EPUB → return 400 "DRM-protected EPUBs cannot be imported"
- File too large (>10MB encoded) → rejected by Zod schema validation

**New dependencies:** `@nicolo-ribaudo/epub` (EPUB parser), `turndown` (HTML-to-Markdown)

**New files:**
- `server/services/epub-importer.ts` — EPUB parsing and conversion logic
- `server/routes/import.ts` — Import API route

**Files to modify:**
- `server/index.ts` — Register import routes
- `src/App.tsx` — Add import button, drag-to-import drop zone
- `src/components/BookCard.tsx` — Show "Imported" badge for imported books

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `src/components/LibraryToolbar.tsx` | Toolbar with search, filter, sort, view toggle |
| `src/components/FilterPopover.tsx` | Filter popover with 5 sections |
| `src/components/BookListView.tsx` | List view layout |
| `src/components/BookListRow.tsx` | List view row |
| `src/components/EditTagsDialog.tsx` | Tag editing dialog |
| `src/components/SetSeriesDialog.tsx` | Series assignment dialog |
| `src/components/SeriesStackCard.tsx` | Collapsed series stack card |
| `src/components/SeriesView.tsx` | Series detail page (folder navigation) |
| `src/components/ImportPreviewDialog.tsx` | EPUB import preview dialog with metadata + optional tags/series |
| `server/services/epub-importer.ts` | EPUB parse + convert to native format |
| `server/routes/import.ts` | EPUB import API routes (preview + confirm) |

### Modified Files
| File | Changes |
|------|---------|
| `server/schemas.ts` | Add `tags`, `series`, `seriesOrder`, `sortOrder`, `imported` to BookMetaSchema + PatchBookBodySchema |
| `server/routes/books.ts` | Add search endpoint, include new fields in list response |
| `server/index.ts` | Register import routes |
| `src/App.tsx` | Extend `Book` interface with new fields + `createdAt`; update `fetchBooks()` mapping; replace tab nav with toolbar; add series grouping logic; add list view toggle; add drag-and-drop wrapper; add import button + drop zone |
| `src/store.ts` | Add `librarySort`, `libraryView`, `libraryFilters` to settings (replace `libraryTab`); add `lastReadAt` to `ReadingPosition`; add persist migration transform for `libraryTab` → `libraryFilters` |
| `src/components/BookCard.tsx` | Add drag handle prop, imported badge, series membership indicator |
| `src/lib/api.ts` | Add `searchBooks()`, `importEpub()`, `updateBookTags()`, `updateBookSeries()` |

### New Dependencies
| Package | Purpose |
|---------|---------|
| `@dnd-kit/core` | Drag-and-drop framework |
| `@dnd-kit/sortable` | Sortable preset for dnd-kit |
| `@dnd-kit/utilities` | CSS utilities for dnd-kit |
| `@nicolo-ribaudo/epub` | EPUB file parser (server) |
| `turndown` | HTML-to-Markdown converter (server) |

### shadcn Components to Add
| Component | Purpose |
|-----------|---------|
| `input` | Search input, tag input |
| `popover` | Filter popover |
| `badge` | Tag chips, filter chips |
| `separator` | Dividers in filter popover |
| `command` | Tag autocomplete (cmdk-based) |
| `tooltip` | Toolbar button tooltips |

---

## State Management

Replace `libraryTab` in Redux settings with:

```typescript
// In settingsSlice initial state
librarySort: { field: 'date', direction: 'desc' },
libraryView: 'grid' as 'grid' | 'list',
libraryFilters: {
  status: 'all' as 'all' | 'in-progress' | 'not-started' | 'finished',
  tags: [] as string[],
  ratingMin: null as number | null,
  datePreset: 'any' as 'any' | 'week' | 'month' | '3months',
},
```

All library UI state persists to Redux (which uses encrypted Electron IPC storage). Search query is local component state (not persisted — clears on navigate away).

**Redux persist migration:** Removing `libraryTab` and adding `libraryFilters` requires a persist transform (like the existing `migratePositionsTransform` at `src/store.ts:355-366`). The transform maps old `libraryTab` values to `libraryFilters.status`:
- `'all'` → `status: 'all'`
- `'in-progress'` → `status: 'in-progress'`
- `'not-started'` → `status: 'not-started'`
- `'finished'` → `status: 'finished'`

Also add `lastReadAt: string` to `ReadingPosition` in `src/store.ts`, updated on every `setPosition` dispatch.

---

## Verification Plan

### Happy paths
1. **Search:** Type in search box → books filter by title/subtitle instantly. Toggle "Full" → results include chapter content matches with brief delay.
2. **Filter:** Click Filter → popover opens. Select "In Progress" + a tag → grid shows only matching books. Chips appear below toolbar. Click ✕ on chip → filter removed.
3. **Sort:** Change sort to "Title" → grid reorders alphabetically. Change to "Manual" → drag handles appear. Drag book A before book B → order persists on page reload.
4. **Tags:** Right-click book → "Edit Tags" → add tag → tag appears in filter popover. Filter by that tag → book shown.
5. **Series:** Right-click book → "Set Series" → enter series name + order. Repeat for 2 more books → books collapse into a stacked card. Click stack → expands inline showing all 3 books.
6. **List view:** Toggle to list view → books render as table rows with columns. Series groups show as collapsible rows.
7. **EPUB import:** Click Import → select .epub file → book appears in library after brief processing → toast notification. Open book → chapters render in reader.

### Edge cases
8. **Empty filter results:** Apply filters that match no books → empty state shows "No books match these filters" with a "Clear filters" button.
9. **Malformed EPUB:** Import a corrupted file → toast error with descriptive message, no crash.
10. **Search + filter interaction:** Search and filters are AND — active search text AND active filters both apply simultaneously.
11. **Persistence:** Change sort/filter/view settings → restart app → settings restored from Redux persist.
12. **Drag-and-drop with series stacks:** In Manual sort, drag a series stack card to reorder its position among other cards.
13. **Drag .epub onto grid:** Drag an EPUB file from Finder onto the library grid → visual drop zone overlay appears → file imports on drop. Must not conflict with dnd-kit card reordering (which uses pointer events, not native HTML5 drag).

### Automated
14. **Run tests:** `pnpm test` passes. Manual test of all features above in `pnpm electron:dev`.
