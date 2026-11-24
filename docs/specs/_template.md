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

One table row per scenario; the first cell is the id `<PREFIX>-AC-<nn>`. A card that lists the id in `scenarios:` needs a test with the id in its name.
Each row must be able to fail on the code before the card: work out what the current code does with its values — a row that already holds proves nothing.

| id | given | when | then | test layer |
|---|---|---|---|---|
| FEAT-AC-01 | … | … | … | unit |
| FEAT-AC-02 | … | … | … | integration |

## 6. Out of scope

What this spec intentionally does not cover.
