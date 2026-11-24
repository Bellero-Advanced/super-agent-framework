---
id: T-M1-01
milestone: M1
title: One line — what changes for the user
spec:
  - docs/specs/example.md
depends: []
size: S
role: implementer
touch:
  - src/feature/**
  - test/feature/**
dont_touch: []
scenarios:
  - FEAT-AC-01
---

# T-M1-01 — One line — what changes for the user

Copy this file to `docs/plan/tasks/M<n>/T-M<n>-<nn>.md` (files starting with `_` are ignored by the engine).
Size S ≤ 150 changed code lines (tests ≤ 250) · M ≤ 400 (tests ≤ 600) — bigger → split.

## Why

The user-visible reason in one or two sentences. Link the spec section.

## What to do

- Concrete steps. Name files and functions. No time estimates.

## Out of scope

- What this card must not do (another card does it).

## Done when

Each command fails before the card (check: `npm run task:prerun -- <id>`) or carries `— passes by design: <reason>` after it. Guard commands (the full suite, the engine checks) need no mark.

- `npm run spec:matrix -- --check`
- `npm test`
