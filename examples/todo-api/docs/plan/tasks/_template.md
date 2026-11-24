---
id: T-M1-01
milestone: M1
title: One line — what changes for the user
spec:
  - docs/specs/example.md
depends: []
size: M
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
Size M ≤ 800 changed code lines (tests ≤ 600) · L ≤ 1600 (tests ≤ 1200) — `task:verify` warns above a cap and fails above 2 × the cap: split the card.

## Why

The user-visible reason in one or two sentences. Link the spec section.

## What to do

- Concrete steps. Name files and functions. No time estimates.

## Out of scope

- What this card must not do (another card does it).

## Done when

- `npm run spec:matrix -- --check`
- `npm test`
