# Spec — `spec:matrix --check` counts a started card only where it is built

Card: T-M3-32. Friction: F-008 (kind `command-failed`, D-017). Builds on the scenario matrix
(`kit/tools-saf/lib/matrix.mjs`, `docs/card-lifecycle.md` "Specs and scenarios") and lanes
([role-lanes.md](role-lanes.md), `laneFolder` in `kit/tools-saf/lib/task.mjs`).

## 1. Purpose

`spec:matrix --check` fails when a started card names a scenario that has no test. A lane card's tests live on its own
branch until `task:merge`, but every other folder still sees that card as started: its evidence was copied when the
other lane's branch was made (or sits in the main folder). So two lane cards that both name scenarios block each
other's `task:verify` — T-M3-28 and T-M3-29 deadlocked and were freed only by `task:abandon` and a restart. After this
spec a card that is still being built counts only in the folder where it is built; a finished card counts everywhere.

## 2. Rules

1. "Here" is the folder the command runs in: a lane worktree (`laneFolder` returns the lane, its card is "the lane's
   card") or the main folder (`laneFolder` returns null).
2. A card counts for `--check` here when one of these holds:
   - its status is `done` or `legacy` (listed under `done_before_cards`) — in every folder;
   - its status is `in_progress` or `failed` and it is built here: in a lane worktree only the lane's card; in the
     main folder only a card whose evidence has no `lane` field (a main-folder card).
3. A card with status `todo` never counts (unchanged).
4. A scenario gap (no test) fails `--check` only when at least one card that names the scenario counts here. A gap
   whose only started cards are built elsewhere does not fail.
5. Only the evidence decides: the command does not look at branches or worktrees. A lane card whose branch or
   worktree was deleted still counts only in its lane (which no longer exists) — `task:abandon` is the repair, as
   today.
6. If `laneFolder` refuses (a lane label that does not match the evidence), `--check` counts every started card in
   every folder (the behaviour before this spec) and prints one line on stderr:
   `lane not recognised (<reason>) — checking every started card`. The reason is the refusal text.
7. Table and summary agree with `--check`: a gap whose started cards are all built elsewhere shows the status
   `✗ gap (started in another folder)`; the summary line counts as "gaps of started cards" only the gaps that fail
   here, and adds ` · started in another folder <n>` when n > 0.
8. Unchanged: exit codes (0 = no issue and no failing gap · 1 = otherwise) · the issues (duplicate ids, unknown
   scenario names) · `--complete=<spec,…>`, which still demands every scenario of the named specs in every folder ·
   the GitHub step summary (it shows the same table) · `task:verify`'s own scenario check of the card it verifies.
9. Where nothing is missed: `task:merge` runs its merge checks in the main folder after the branch is merged in, so
   the merged card's evidence is `done` there and counts (rule 2); the milestone gate runs in the main folder after
   every card is done.
10. The selection is a pure function of the matrix and "here" in `matrix.mjs` (no git, no file reads), so it is unit
    tested without repositories; `bin/saf.mjs spec-matrix` computes "here" once and passes it in. Calling the
    selection without "here" keeps the old behaviour (every started card counts).

## 3. Data

- Status per card: `cardStatus` (`kit/tools-saf/lib/plan.mjs`) · lane per card: the evidence field `lane` ·
  the lane's card: `laneFolder` (`kit/tools-saf/lib/task.mjs`).
- Status texts of the table: `STATUS_TEXT` and `renderMatrix` in `kit/tools-saf/lib/matrix.mjs`.

## 4. Edge cases and errors

- Worktrees off (`workflow.worktrees: false`): no evidence has `lane`, every started card is a main-folder card — the
  behaviour equals today's.
- A main-folder card started before a lane was opened: its evidence is copied into the lane branch, but its tests are
  written in the main folder — it does not count in the lane (rule 2).
- An abandoned card: its evidence is removed, so it is `todo` in that folder. A stale copy of an abandoned lane card on
  another lane's branch is `in_progress` with a `lane` that is not that lane's card — it does not count there.
- A lane card that passed `task:verify` in its lane is `done` on its branch (counts there) and still `in_progress` in
  the main folder until merged (does not count there).
- A lane card whose verify failed (`failed`) counts in its own lane only.
- A scenario named by two cards: it fails if either card counts here.
- Side cards and submodule cards follow the same rules (their evidence carries `lane` the same way).

## 5. Acceptance

Scenarios that need lanes run in temporary git repositories with `task:start --worktree` (as the lane tests in
`test/unit/task.test.mjs`); the selection itself (rules 2–4, 7) can also be tested on a built matrix.

| id | given | when | then | test layer |
|---|---|---|---|---|
| MSCOPE-AC-01 | lane card B (scenario `B-AC-01`) started with `--worktree`, then lane card A (scenario `A-AC-01`) started with `--worktree`; A's lane has a test for `A-AC-01`, the test for `B-AC-01` exists only on B's branch | `spec:matrix -- --check` in A's worktree, then in B's worktree | exit 0 in both; the table in A's worktree shows `B-AC-01` as `✗ gap (started in another folder)` | unit |
| MSCOPE-AC-02 | main folder: lane card L in progress (scenario `L-AC-01`, no test on main) and main-folder card M in progress (scenario `M-AC-01`, no test) | `spec:matrix -- --check` in the main folder | exit 1; stderr names `M-AC-01` and card M; stderr does not name `L-AC-01` | unit |
| MSCOPE-AC-03 | main-folder card M in progress (scenario `M-AC-01`, no test) started before lane card A was opened; A's own scenario `A-AC-01` has no test in A's lane | `spec:matrix -- --check` in A's worktree | exit 1; stderr names `A-AC-01`; stderr does not name `M-AC-01` | unit |
| MSCOPE-AC-04 | a matrix with gaps for a `done` main card, a `done` lane card, a `legacy` card and a `todo` card | the selection for the main folder and for a lane of another card | the `done`, lane-`done` and `legacy` gaps fail in both; the `todo` gap fails in neither | unit |
| MSCOPE-AC-05 | the state of MSCOPE-AC-02 | `spec:matrix` (no flag) in the main folder | the row of `L-AC-01` reads `✗ gap (started in another folder)`, the row of `M-AC-01` reads `✗ gap (card started)`; the summary ends `gaps of started cards 1 · started in another folder 1`; exit 0 | unit |
| MSCOPE-AC-06 | a lane worktree whose lane label names a card the branch evidence does not hold, with a started card's gap | `spec:matrix -- --check` there | exit 1; stderr has `lane not recognised (` and `checking every started card` and names the gap | unit |
| MSCOPE-AC-07 | lane card B started with `--worktree`, its test only on its branch; then B abandoned with `task:abandon` while lane card A (opened before the abandon) keeps B's evidence copy | `spec:matrix -- --check` in the main folder and in A's worktree (A has its own test) | exit 0 in both | unit |

MSCOPE-AC-04 holds on today's code (every non-`todo` status counts today): it is the guard that the new selection
does not drop finished cards — it passes by design. Every other row fails today: AC-01, AC-03 and AC-07 (A's worktree)
exit 1 on the copied evidence; AC-02 names `L-AC-01`; AC-05 and AC-06 print texts that do not exist yet.

## 6. Out of scope

- Counting in-progress cards by their current role lane (`task:next --parallel`, review note D1) — a separate card.
- Making `task:verify` or `task:merge` read other branches to find tests.
- Any change to how tests are matched to scenario ids (`scenarios.mjs`).
