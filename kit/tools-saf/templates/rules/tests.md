---
paths:
{{rulePathsYaml}}
---

# Rules for test files

- A test that proves an acceptance scenario has the scenario id in its name (`FEAT-AC-01 …`) — `{{cmd.specMatrix}}` maps them
- Tests assert behaviour the spec describes, not implementation details; one reason to fail per test
- Deterministic: fixed seeds, fake clocks, no real network or paid APIs in unit tests, no sleeps to wait for state
- Databases in tests: a local database whose name ends in `_test`, or an in-memory one — never shared or production data
- Fake secrets in fixtures are built at runtime (string concatenation) so secret scanners never match a real-looking value
- A flaky test is a bug: fix the cause; never add retries or widen timeouts just to get green
- Never delete or weaken an assertion to make a card pass — the card's size caps include tests (S ≤ {{testS}} · M ≤ {{testM}} lines)
