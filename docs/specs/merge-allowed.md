# Spec — `task:merge` honours the always-allowed globs the lane card added

Card: T-M3-34 (self-fix of friction F-011, kind `command-failed`, D-017). Builds on lanes and `task:merge`
(`precheck` in `kit/tools-saf/lib/task.mjs`, `docs/card-lifecycle.md` "Lanes") and the always-allowed list
(`alwaysAllowed` in `kit/tools-saf/lib/plan.mjs`, setting `workflow.alwaysAllowed`).

## 1. Purpose

Before merging, `task:merge` checks that the lane branch holds exactly the files `task:verify` counted in the lane, and
skips files that are always allowed. It reads the always-allowed list only from the main folder's `saf.config.json`.
A lane card that adds a glob to `workflow.alwaysAllowed` was verified with the new list, so files under the new glob
are not in its evidence — and the main folder, still on the old list, refuses the merge with "changed after
verification" (F-011, and F-005 before it). The owner's workaround was to copy the lane's config to main by hand.
After this spec the check uses both lists, so such a card merges in one step; a file that neither list allows still
refuses the merge.

## 2. Rules

1. The merge check skips a changed file when it matches the main folder's always-allowed list (today's rule) **or**
   a glob in `workflow.alwaysAllowed` of the `saf.config.json` committed on the lane branch, with the exceptions of
   rules 3 and 4. The card file itself stays skipped (unchanged).
2. The branch's list is read from the branch commit (`refs/heads/<branch>`), not from the lane worktree and not from
   the merged result.
3. `saf.config.json` itself is never skipped by a glob that only the branch's list has: a config changed after
   verification is still refused.
4. The branch's extra globs count only when the branch's `saf.config.json` is the one the lane verified: unchanged
   between the merge base and the branch, or listed in the card's `verified.files` with the same hash. Otherwise only
   the main folder's list is used (today's behaviour) — a config edited after verification cannot widen the check.
5. A branch `saf.config.json` that is missing, not valid JSON, or whose `workflow.alwaysAllowed` is not a list of
   strings adds no globs; the merge goes on with the main folder's list. It never throws for this reason.
6. Unchanged: exit codes (3 refused · 4 conflict · 5 merge check failed), the refusal text
   `changed after verification (does not match verified.files): …`, the merge checks, the rollback.

## 3. Data

- Built-in always-allowed paths and `workflow.alwaysAllowed`: `alwaysAllowed(config)` in `kit/tools-saf/lib/plan.mjs`
- Config file name: `CONFIG_FILE` in `kit/tools-saf/lib/config.mjs` · reading a file at a commit: `showFile` in
  `kit/tools-saf/lib/git.mjs`
- The check: `precheck` in `kit/tools-saf/lib/task.mjs`

## 4. Edge cases and errors

- The branch removes a glob the main folder still has: the union keeps it — the lane verified with the smaller list,
  so its evidence already holds those files and they match by hash.
- Main changed its own list after the lane opened: the union still holds main's list (today's rule).
- A lane without any `saf.config.json` change: the branch list equals the base list; nothing new is skipped.
- Built-in paths an engine change adds in `plan.mjs` (F-005): not covered — the merging engine's code decides them.

## 5. Acceptance

Run in temporary git repositories with `task.startCard(…, { worktree: true })` as the lane tests in
`test/unit/task.test.mjs`; the main folder's context keeps the config from before the lane, the lane verifies with
its own `loadConfig`.

| id | given | when | then | test layer |
|---|---|---|---|---|
| MALLOW-AC-01 | lane card with `touch` `src/**` and `saf.config.json`; in the lane it adds `gen/**` to `workflow.alwaysAllowed`, writes `src/a.ts` and `gen/out.txt`, verifies (pass), commits, then changes `gen/out.txt` again and commits | `task.mergeCard` in the main folder (main config without `gen/**`) | the merge succeeds (no exit 3); the merge commit holds `gen/out.txt` and `saf.config.json` | unit |
| MALLOW-AC-02 | the lane of MALLOW-AC-01, and after verification `src/late.ts` (outside both lists) is also written and committed | `task.mergeCard` in the main folder | exit 3; the message has `changed after verification` and names `src/late.ts`; it does not name `gen/out.txt` | unit |
| MALLOW-AC-03 | the lane of MALLOW-AC-01, and after verification the lane edits `saf.config.json` to add `src/**` to `workflow.alwaysAllowed` and writes `src/late.ts`, then commits | `task.mergeCard` in the main folder | exit 3; the message names `saf.config.json` and `src/late.ts` | unit |

MALLOW-AC-01 fails today (refused, `gen/out.txt` is not in `verified.files`); MALLOW-AC-02 fails today (the message
also names `gen/out.txt`). MALLOW-AC-03 holds on today's code — it passes by design: it is the guard of rules 3 and 4
that a config edited after verification cannot widen the check.

## 6. Out of scope

- Built-in always-allowed paths added by an engine change on the branch (F-005) — the main folder cannot run the
  branch's engine.
- `task:verify`, `task:start` and `task:next --parallel` (they read the folder's own config).
- Making main's config follow the branch before the merge (the merge itself brings the branch's config).
