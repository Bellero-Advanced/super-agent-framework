# Spec — review rounds (every spec review is recorded per card)

Decision: [D-017](../DECISIONS.md) (proposed), measurement for [D-016](../DECISIONS.md). Card: T-M3-02; the report
by size and effort is T-M3-04 ([effort-by-size.md](effort-by-size.md) rules 11–12).

## 1. Purpose

The spec review is done by an agent (`spec-reviewer`), not by the engine, so today the evidence knows how often
`task:verify` ran but not how often a card bounced in review or why. That number is what D-016 needs to judge effort
by size, and a bounce caused by a gap in SAF is friction. The main session records each review result with one small
command; the engine stores it beside the evidence and shows it in the report.

## 2. Rules

1. `task:review <id> pass` or `task:review <id> fail --kind <k>[,<k>…] [--note <text>]` records one review round.
   `task:review <id>` with no result prints the rounds so far. Main folder only — in a lane worktree it is refused
   with the main-folder command (the main session runs reviews).
2. Kinds are `REVIEW_KINDS` (`kit/tools-saf/lib/reviews.mjs`): `spec-mismatch` (the work differs from the spec or
   card) · `missing-test` (a scenario or rule has no real test) · `out-of-scope` (changes outside the card's outcome) ·
   `docs` (user docs or comments wrong or missing) · `framework` (the bounce comes from a gap in SAF itself). `fail`
   needs at least one kind; `pass` takes none. `--note` is one line, at most `REVIEW_LIMITS.note` characters.
3. A round can be recorded only when the card's last verify passed: for a main-folder card the evidence in the main
   folder; for a lane card the evidence committed on its branch (read the way `task:merge` reads it). Otherwise
   refused, naming the verify command.
4. Rounds are stored in `docs/plan/evidence/reviews/<id>.json` (written by the engine only, like all evidence):
   `{ id, rounds: [{ round, at, result, kinds, note, head, verifyAttempts, verifyAt }] }`. `round` counts from 1;
   `head` is the commit reviewed (main HEAD, or the lane branch head); `verifyAttempts` and `verifyAt` copy the
   verify evidence. Rounds are only appended. `loadPlan` does not treat this sub-folder as card evidence.
5. `fail` on a main-folder card sets its evidence `status` from `done` back to `failed` with
   `reviewFailed: <round>`, keeping `started`, `attempts` and `verified`, so the next `task:verify` runs without
   `--restart`. A lane card needs no change (verify in the lane can already run again).
6. `task:start --restart` and `task:abandon` never delete the reviews file — rounds survive a restart.
7. `fail --kind framework` also appends a friction entry (kind `review-bounce`, the card id, `--area` required with
   this kind, evidence `review round <n> of <id>: <note>`) through the friction log's append function
   ([friction-log.md](friction-log.md) rules 2–7) and prints its id.
8. `task:report <M>` shows a "Reviews" column in the cards table: `<rounds> (<fails> fail)` or `—` when none; below the
   table one line with the milestone totals (cards reviewed · passed first time · total rounds).
9. `task:review` writes only; it never commits. A lane card's review file is in the main folder, so the main session
   commits it (`git commit -m "chore(plan): review <id> round <n>" -- docs/plan/evidence/reviews/<id>.json`) before
   `task:merge` (which refuses a dirty main folder).
10. The generated `/saf` command's review step says: record the result with `task:review` (pass, or fail with kinds),
    and on `fail` the builder fixes and verifies again.

## 3. Data

- `REVIEW_KINDS`, `REVIEW_LIMITS`, `reviewsPath`, `readReviews`, `recordReview`: `kit/tools-saf/lib/reviews.mjs`
- Reopen on fail: `kit/tools-saf/lib/task.mjs` (verify accepts `failed` with `reviewFailed`)
- Report column and labels (en, th): `kit/tools-saf/lib/report.mjs` · `kit/tools-saf/lib/text.mjs`
- Script `task:review`: `ENGINE_SCRIPTS` in `config.mjs`

## 4. Edge cases and errors

- Unknown card id, unknown kind, `pass --kind …`, `fail` without kind, note too long or multi-line → exit 1, nothing
  written. Missing arguments → exit 2 with usage.
- Review recorded twice by mistake: both stay (append only); the report counts both — the main session should not
  repeat a command.
- Unreadable reviews file → the command refuses and names the file; the report shows `?` for that card.
- A card reviewed after merge (already done in main, lane merged): `pass` is recorded; `fail` is refused with the hint
  to start a follow-up card (a merged card is not reopened).

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| REVIEW-AC-01 | a main-folder card whose verify passed | `task:review <id> pass` | `evidence/reviews/<id>.json` has round 1, result pass, head, verifyAttempts; the card evidence is unchanged | unit |
| REVIEW-AC-02 | the same card | `task:review <id> fail --kind spec-mismatch,missing-test --note "…"` | round 2 recorded with both kinds; the evidence status is `failed` with `reviewFailed: 2`; `task:verify` runs again without `--restart` and keeps the attempt count | unit |
| REVIEW-AC-03 | a card whose verify has not passed, a lane worktree, `fail` without kind, `pass` with a kind, an unknown kind | `task:review` | refused with the reason, nothing written | unit |
| REVIEW-AC-04 | a lane card with passed evidence on its branch | `task:review <id> fail --kind docs` in the main folder | round recorded with the branch head; main-folder card evidence unchanged | unit |
| REVIEW-AC-05 | a failed round with kind framework and `--area task:merge` | recorded | a friction entry `review-bounce` with the card id and `review round <n>` evidence is appended; without `--area` it is refused | unit |
| REVIEW-AC-06 | two reviewed cards and one without rounds | `task:report <M>` | the Reviews column shows `2 (1 fail)`, `1 (0 fail)`, `—` and the totals line | unit |
| REVIEW-AC-07 | a card with rounds | `task:start <id> --restart` | the reviews file is unchanged | unit |

## 6. Out of scope

- Running the spec review from the engine (it stays an agent's judgment)
- Blocking `task:merge` on a missing or failed review (possible later; today only `/saf` enforces the step)
- Review rounds by qa-runner (only spec reviews are counted)
