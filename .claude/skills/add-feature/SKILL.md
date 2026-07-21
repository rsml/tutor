---
name: add-feature
description: Add a capability to Tutor end to end, following the test-first port, adapter, service, route, api client, feature slice recipe.
---

# Add a Feature to Tutor

The recipe for adding a capability that needs new server behavior, from domain types down to the UI. Test commits precede or accompany implementation commits at every step. That ordering is deliberate and should stay visible in git history.

## When to use, when not

Use this when the feature reaches new server behavior or a new external dependency. Skip it for a pure UI tweak with no new I/O. That is just a component edit, no port, service, or route involved.

## Decide whether a new port is needed

Only add a port when the feature reaches a genuinely new external dependency, meaning a new service, a new binary, or a new file format. Reusing an existing port is the common case. There are 15 today (`text-generation`, `key-vault`, `image-generation`, `book-repository`, `artifact-store`, `speech-synthesis`, `audio-assembly`, `diagram-renderer`, `epub-import`, `epub-export`, `background-tasks`, `job-journal`, `library-migrator`, `clock`, `os-file-manager`). Check `server/ports/README.md` for the current list before assuming you need a new one.

## Steps, in TDD order

1. Define or extend the domain types in `shared/`. Persisted entities are Zod schemas in `shared/domain.ts`. Request bodies go in `shared/contracts.ts`. Response shapes go in `shared/responses.ts`. SSE event unions go in `shared/events.ts`. `shared/` is flat, there is no subfolder per feature.

2. Declare the port interface in `server/ports/<capability>.ts`, named for the capability and never for the vendor.

3. Write the contract test `server/ports/<capability>.contract.ts` and the in-memory fake `server/ports/<capability>.fake.ts`, then `server/ports/<capability>.fake.test.ts`, which runs the contract against the fake. This is RED first, there is no adapter yet.

4. Write the adapter `server/adapters/<technology>-<capability>.ts` and run the same contract against it. That turns the contract GREEN and is what stops the fake drifting from the real thing. `fs-book-repository.ts`, `kokoro-speech-synthesis.ts`, and `system-clock.ts` are worked examples of this naming. When the technology name already implies the capability's own prefix, the capability half gets shortened instead of duplicated, as in `epub2-import.ts` for the `epub-import` port. A couple of adapters, such as `os-file-manager.ts`, carry no technology prefix at all because there is only one plausible implementation. Match the port's name unless one of those two cases applies.

5. Write the service unit test `server/services/<verb-noun>.test.ts` against the fake. RED.

6. Write the service `server/services/<verb-noun>.ts` as a `createX(deps)` factory, where `deps` is an object of ports by name, for example `{ ai, books, clock }`. GREEN. See `server/services/create-book.ts` for the shape.

7. Add the thin route in the matching `server/routes/*.ts` module (`library.ts`, `reading.ts`, `assessment.ts`, `authoring.ts`, and others by domain area, not one file per entity). Parse the body with the Zod schema from `shared/contracts.ts` through `parseBody()` in `server/http/parse.ts`, then delegate to the service. Register any new port and service through `server/composition-root.ts`, adding a field to the `Ports` interface and wiring it in `createPorts()`. Then run `pnpm docs:routes` and commit the regenerated `docs/api-routes.md`.

8. Add one function to the matching `client/api/*.ts` module with its mocked-fetch test, then the feature hook and component under `client/features/<feature>/` (see `audiobook`, `chat`, `creation`, `library`, `markdown`, `profile`, `progress`, `quiz`, `reader`, `settings` for the existing slices, each with its own `components/` and `hooks/`).

## Conventions checklist

- No raw `fetch` or `new EventSource` outside `client/api/`. Both are lint errors, enforced in `eslint.config.mjs`, not just conventions.
- No SDK or vendor import outside `server/adapters/`.
- No `fs` in `server/services/` or any domain module.
- No magic strings where a named constant already exists.
- JSDoc on new exported symbols, stating a constraint the signature cannot show on its own.
- Tests colocated beside the file they cover, as `*.test.ts`.
- Test commits before implementation commits.
- Domain names taken from `CONTEXT.md`, never invented fresh.

## Finish

Run the `verify` skill before calling the feature done.
