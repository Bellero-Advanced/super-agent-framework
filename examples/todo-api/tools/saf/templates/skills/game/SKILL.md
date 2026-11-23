---
name: game
description: Game work — balance numbers in data tables, server-authoritative outcomes, deterministic simulation tests, fixed tick, asset and frame budgets, playtest evidence. Use for gameplay, systems, content or multiplayer cards.
---

# Game development

## Data, not code

- every balance number (damage, cooldowns, drop rates, prices, XP curves) lives in a data table — logic reads the table
- systems never branch on a hard-coded class, skill, item or monster id; behaviour comes from data fields
- a new item, skill or enemy should need data only — if it needs code, the system is missing a data field

## Authority

- multiplayer: the server decides damage, drops, currency and positions; the client sends intent and predicts locally
- every value change (currency, items, ownership) goes through a transaction with a ledger record and an idempotency key
- reject forged or out-of-range client messages and test that they are rejected

## Simulation

- fixed tick for game logic; rendering interpolates
- deterministic: seeded random, injected clock — the same inputs give the same outcome in a test
- formulas and combat resolution are unit-tested with the scenario ids from the spec, including edge cases (zero, max, overflow)

## Budgets

Frame time, draw calls, texture memory, network bytes per tick and asset sizes have budgets in the project's budget file.
Measure on the target device class{{#if measureOn}} through the measure lock (`{{cmd.measure}}`){{/if}}.

## Evidence

- simulation tests for the rules · two-client e2e for anything multiplayer (each sees the other move)
- a short playtest note: build · what was played · what felt wrong · numbers (FPS, latency)
- screenshots or a clip for visual changes
