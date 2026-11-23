# Spec — <system name>

Copy this file to `docs/specs/<system>.md`. One spec per system. Numbers live in code data tables, not here.

## 1. Purpose

What the user gets, in two or three sentences.

## 2. Rules

Numbered, testable statements. Each rule is small enough that one test can prove it.

1. …

## 3. Data

Tables, fields and where they live in code. Point to the code; do not copy values.

## 4. Edge cases and errors

What happens on empty input, failure, retry, concurrency, permission denied.

## 5. Acceptance

Each scenario has an id `<PREFIX>-AC-<nn>`. A card that lists the id in `scenarios:` needs a test with the id in its name.

- FEAT-AC-01 — Given … when … then …
- FEAT-AC-02 — Given … when … then …

## 6. Out of scope

What this spec intentionally does not cover.
