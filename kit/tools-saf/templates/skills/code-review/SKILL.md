---
name: code-review
description: Review changes since a fixed point (commit, branch or merge-base) on two axes — standards (does the code follow this repo's documented rules?) and spec (does it do what the card and spec asked?). Use to review a card, a branch or work in progress.
---

# Code review

## 1. Fix the range

Pick the base: the card's start commit (in `docs/plan/evidence/<id>.json` → `started.base`), a branch, or `git merge-base HEAD main`.
List changed files with `git diff --stat <base>...HEAD` and write the diff to a file if it is long — read the file, not the terminal.

## 2. Spec axis

For each rule and acceptance scenario the card claims:

- where in the diff is it implemented? (file:line)
- which test proves it, and does the test really exercise it?
- edge cases and errors from the spec — handled or missing?

## 3. Standards axis

Check against the rules that apply to the changed paths (`CLAUDE.md`, `.claude/rules/`):

- files outside the card's `touch`; anything in `dont_touch`
- magic numbers in logic that belong in data tables · branching on hard-coded ids
- untranslated user-facing text (when the project uses i18n) · secrets · debug leftovers
- error handling, input validation at boundaries, authorization
- dead code, duplication, names that lie

## 4. Report

Two short sections, "Spec" and "Standards". Each finding: file:line · what is expected · what the code does · blocking or not.
End with `PASS` or `FAIL`. Do not rewrite the code in the review.
