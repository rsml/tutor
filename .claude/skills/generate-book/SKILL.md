---
name: generate-book
description: Generate a complete book from a detailed brief using the Tutor MCP server. Use when the user provides a book brief/spec and wants multi-phase agentic generation with reference grounding, planning, context-aware chapter generation, and verification.
---

# Agentic Book Generation

Generate a complete book from a brief using the Tutor MCP server tools. This workflow produces higher-quality books than simple mode by incorporating reference materials, maintaining cross-chapter context via summaries, and self-reviewing each chapter.

## Prerequisites

- Tutor MCP server must be connected (you should have tools like `mcp__tutor__list_books`, `mcp__tutor__create_book`, etc.)
- The user provides a brief — either pasted directly or as a file path to read

## Phase 1: Grounding

1. Read the user's brief carefully
2. Extract any reference URLs mentioned in the brief
3. For each URL:
   - If it's a library/framework doc, try `context7` MCP first (resolve-library-id then query-docs)
   - Otherwise, use `WebFetch` to retrieve the content
   - Save each fetched reference via `mcp__tutor__save_reference` with a descriptive name
4. If the brief itself is long, save it via `mcp__tutor__save_brief`

## Phase 2: Planning

1. Read the learning profile via `mcp__tutor__get_profile`
2. Create the book skeleton via `mcp__tutor__create_book` with:
   - A concise, memorable title (2-5 words, think O'Reilly/Pragmatic Bookshelf)
   - A punchy subtitle (max 8 words, not "A guide to...")
   - The user's original prompt/brief text
   - `totalChapters` based on the brief's scope
3. Generate a structured TOC from the brief + references + profile:
   - Each chapter: title, description (one sentence), and which reference chunks are relevant
   - Order chapters in a logical learning progression
   - Early chapters: foundations. Later chapters: advanced/synthesis topics.
4. Save the TOC via `mcp__tutor__save_toc`
5. If the brief is very long (>3K words), generate a condensed version (1-2K words) and save via `mcp__tutor__save_brief` — this condensed brief will be used for later chapters to save tokens
6. Update book meta status to `generating` via `mcp__tutor__update_meta`

## Phase 3: Generation (per chapter)

For each chapter from 1 to totalChapters:

### 3a. Load Context
- Load all previous summaries via `mcp__tutor__get_all_summaries`
- Load the brief via `mcp__tutor__get_brief`
- Load relevant reference chunks via `mcp__tutor__get_reference` (only those mapped to this chapter in planning)
- Load all feedback via `mcp__tutor__get_all_feedback` (if any exists from prior reading)
- Load the learning profile via `mcp__tutor__get_profile`

### 3b. Generate Chapter
Write the chapter content incorporating:
- The chapter's spec from the TOC (title + description)
- Summaries of all prior chapters (for continuity)
- Relevant reference material (for accuracy)
- Learning profile preferences (for style/depth/tone)
- Any feedback from the reader (for adaptation)

Chapter guidelines:
- ~1,500 words (flex longer when content demands, up to ~2,500)
- Start with `# Chapter Title`
- Use `##` and `###` for sections
- Include code examples when relevant (with language tags)
- Use `> blockquotes` for key insights
- Bold/italic for emphasis
- If including mermaid diagrams, do NOT add style/classDef directives; always quote node labels
- If the reader struggled with topics in prior quizzes, add a brief recap at the chapter start

### 3c. Self-Review
Before saving, review the chapter for:
- Does it cover all key topics listed in the TOC description?
- Is it accurate relative to reference materials?
- Does it maintain continuity with prior chapter summaries?
- Does it match the learning profile's style preferences?

If issues are found, revise the chapter (max 1 revision cycle).

### 3d. Save and Summarize
1. Save the chapter via `mcp__tutor__save_chapter`
2. Generate a ~200-word summary + 3-7 key points
3. Save the summary via `mcp__tutor__save_summary`
4. Update `generatedUpTo` via `mcp__tutor__update_meta` with `{ "generatedUpTo": chapterNum }`

### 3e. Generate Quiz (optional)
If quizzes are desired, generate 3 multiple-choice questions testing the chapter's key concepts and save via `mcp__tutor__save_quiz`.

## Phase 4: Verification

After all chapters are generated:

1. Spot-check cross-references: read 2-3 chapters and verify they reference each other correctly
2. Check brief coverage: compare the original brief's requirements against the TOC and verify each was addressed
3. Report any issues to the user with specific chapter numbers
4. Update book status to `reading` via `mcp__tutor__update_meta` with `{ "status": "reading" }`

## Token Budget Guidelines

Keep context loading within these budgets per chapter:

| Component | Target Tokens | Notes |
|-----------|--------------|-------|
| Profile + instructions | ~800 | Stable |
| Brief | 1.5K-2K | Use condensed version after ch.10 |
| Chapter spec | ~800 | From TOC |
| All prior summaries | ~300 per chapter | ~7K at ch.25 |
| Reference chunks | up to 15K | Hard cap, prioritize relevant ones |
| Prior feedback | ~2K | Accumulated |

If total context exceeds ~40K tokens, prioritize: chapter spec > recent summaries > references > older summaries > feedback.

## Error Handling

| Situation | Action |
|-----------|--------|
| Reference URL fails to fetch | Log it, skip, continue — note the gap |
| Chapter self-review fails | Revise once, then accept |
| MCP tool call fails | Retry once, then report to user |
| Context too large | Drop oldest summaries first, then trim references |
| Mid-generation stop | All state is on disk. Resume from `generatedUpTo + 1` |

## Resuming a Partial Book

If asked to continue a book that's partially generated:
1. `mcp__tutor__get_book` to check current `generatedUpTo` and `totalChapters`
2. `mcp__tutor__get_toc` to load the plan
3. `mcp__tutor__get_all_summaries` to load context from completed chapters
4. Resume from chapter `generatedUpTo + 1`

## Example Brief Format

The user might provide something like:

```
Topic: Effect-TS for Backend Services
Chapters: 15

Chapter-by-chapter spec:
1. Why Effect? — Compare to raw promises, introduce the Effect type
2. Creating and Running Effects — Effect.succeed, Effect.fail, runPromise
...

Reference URLs:
- https://effect.website/docs/getting-started
- https://github.com/Effect-TS/effect/tree/main/packages/effect

Running example: Build a task management API throughout the book
```

But briefs can be much longer — thousands of words with detailed per-chapter specs.
