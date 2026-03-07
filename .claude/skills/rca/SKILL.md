---
description: Root cause analysis with five-whys across full failure cascade
argument-hint: <failure description>
disable-model-invocation: false
---

# Root Cause Analysis

Systematic five-whys analysis that traces the full failure cascade and hardens every weak point — not just the final symptom.

## Steps

1. **Capture the failure** — Document:
   - Symptom (what broke)
   - Location (file:line or component)
   - Immediate error message or observed behavior
   - This is "Why 0" — the starting point.

2. **Apply five-whys** — Trace backwards from the symptom. For each "why":
   - The failure point (file:line or component)
   - Why it failed (missing check, wrong assumption, missing test, etc.)
   - What allowed it to reach this point (upstream weakness)

   Stop when reaching the root cause or a system boundary. Document the full chain as Why 1 through Why N.

3. **Classify weaknesses by level** — For each failure point in the chain, classify the weakness:
   - **Code**: implementation bug, missing validation, wrong logic
   - **Test**: missing coverage, weak assertion, missing edge case
   - **Pattern**: no pattern exists, pattern not followed, pattern incomplete
   - **Config**: build config, tooling setup, environment issue

4. **Generate hardening actions** — For each uncovered weakness:
   - **Code**: describe the fix
   - **Test**: describe the test that would have caught this
   - **Pattern**: note if a convention should be documented
   - **Config**: note the config change needed

5. **Report** — Output structured RCA summary:

   ```
   ## RCA: <one-line symptom>

   ### Root cause chain
   - Why 0: <symptom> (file:line)
   - Why 1: <cause> (file:line)
   - ...
   - Why N: <root cause> (file:line or system boundary)

   ### Weakness classification
   | Level   | Weakness                  | Hardening action          |
   |---------|---------------------------|---------------------------|
   | Code    | <what was wrong>          | <fix description>         |
   | Test    | <what was missing>        | <test description>        |
   | Pattern | <gap>                     | <convention to document>  |
   | Config  | <gap>                     | <config change>           |

   ### Immediate actions
   - <what was done now>

   ### Deferred actions
   - <what should be done later>
   ```
