# 0005. AI SDK behind a TextGeneration port

Status: Accepted
Date: 2026-07-21

## Context

Calls to the Vercel AI SDK used to sit directly inside route and service modules, five files calling `generateObject` and `streamText` against the SDK itself, per the account in [`../../server/ports/text-generation.ts`](../../server/ports/text-generation.ts). Anthropic, OpenAI, and Google are all user-selectable providers on a per-call basis, so each of those call sites also resolved a provider and model on its own. Each caller hand-rolled its own timeout and abort handling rather than sharing one policy. Nothing that touched an AI model could be exercised in a test without a network call and a live key.

## Decision

One `TextGeneration` port now covers every shape a caller needs, `streamText`, `generateObject`, and `runToolConversation`, the last running a short tool-calling conversation and yielding only its text output. [`../../server/adapters/ai-sdk-text-generation.ts`](../../server/adapters/ai-sdk-text-generation.ts) is the only module allowed to import the `ai` package. It resolves provider and model, combines a caller's cancellation signal with a five-minute generation timeout, and retries through the policy in [`../../server/adapters/retry-policy.ts`](../../server/adapters/retry-policy.ts), explicitly setting `maxRetries: 0` on every SDK call so the SDK's own retry can never run underneath this adapter's. A failure maps to a typed `TextGenerationError` carrying one of seven `kind` values, `auth-failed`, `rate-limited`, `overloaded`, `timed-out`, `network-failed`, `content-refused`, or `unknown`. [`../../server/ports/text-generation.fake.ts`](../../server/ports/text-generation.fake.ts) scripts responses in memory, and [`../../server/ports/text-generation.contract.ts`](../../server/ports/text-generation.contract.ts) pins the fake's behavior. That contract is deliberately fake-only, since a real subject would spend money against a live provider on every run. Services depend on the port and routes stay thin. Prompt text lives in typed TypeScript template literals inside each service module rather than runtime markdown files, plus one shared fragment, [`../../server/prompts/formatting-rules.ts`](../../server/prompts/formatting-rules.ts), so prompts survive Electron bundling and type-check like any other code.

## Consequences

**What this buys**

- Services are unit-testable against the fake, with no network call and no provider key.
- Timeout, retry, and abort policy live in one place instead of being redefined per caller.
- Adding a provider is an adapter-only change.

**What this costs**

- Every service call now passes through one extra indirection before it reaches the SDK.
- The port can only expose streaming as plain text chunks plus abort, not the SDK's fuller stream. A tool call's own arguments and result are never visible on the returned iterable, only their side effect.

## Revisit when

A provider needs a capability the port cannot express without leaking SDK types into a service.
