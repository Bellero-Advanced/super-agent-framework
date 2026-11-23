---
name: tdd
description: Test-driven development — red, green, refactor, one acceptance scenario at a time. Use when building a feature or fixing a bug test-first.
---

# Test-driven development

1. **Pick one behaviour** from the spec — ideally one acceptance scenario. Put its id in the test name (`FEAT-AC-01 …`).
2. **Red** — write the test; run it; watch it fail for the right reason (an assertion, not a typo or import error).
3. **Green** — write the smallest code that makes it pass. No extra features.
4. **Refactor** — clean names and duplication with all tests green. Run the suite again.
5. Repeat for the next behaviour. Commit at green points.

Rules:

- test behaviour through public interfaces, not private details
- deterministic tests: fixed seeds, fake clocks, no real network in unit tests
- integration tests at the seams that matter (database, API boundary) — use a local `_test` database, never shared data
- a bug fix starts with a test that reproduces the bug
