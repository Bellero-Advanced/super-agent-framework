# Card lifecycle

Status is never typed by hand — it is computed from three kinds of files:

| File | Holds | Written by |
|---|---|---|
| `docs/plan/milestones/M<n>.md` | goal · scope · risks · exit gates · ordered cards · `status` | designer; the owner approves |
| `docs/plan/tasks/M<n>/T-M<n>-<nn>.md` | one card: frontmatter + "Done when" commands | designer |
| `docs/plan/evidence/<id>.json` | start commit · command results · changed files | the engine only |

`docs/plan/STATE.md` and `.saf/plan.md` are generated from them (`task:state`; `--check` verifies they are current).

## The loop

1. The owner says **Go** on a milestone (`status: active`; one at a time). The designer has written its cards (`/saf-plan`).
2. `task:start <id>` — refuses when the milestone is not active (and the card is not a [side card](#side-lanes)), a dependency has not passed, or another main-folder card is
   open. Records the start commit and a hash of every already-dirty file (so pre-existing changes are not blamed on the card).
3. The card's role does the work, touching only files matched by `touch` and never `dont_touch`.
4. `task:verify <id>` — runs every "Done when" command, then compares changed files with `touch`/`dont_touch`, then checks
   every id in `scenarios` has a test with the id in its name. Pass → `done`; otherwise `failed` with the reasons.
   Flaky passes (failed before, passed now) are reported.
5. `spec-reviewer` (read only) compares the code with the card and the spec — every card at standard/strict rigor, size-M
   cards at light rigor.
6. `qa-runner` runs real tests when the card touches UI, multiplayer or performance.
7. Commit (main-folder card) or `task:merge <id>` (lane card).
8. When all cards pass: `task:verify M<n>` runs the exit gates (gates without commands are manual owner checks) and
   `task:report M<n>` writes the report from evidence. The owner closes the milestone.

`task:abandon <id>` gives up an unfinished card. `task:start <id> --restart` re-opens a passed card.

## Card format

```markdown
---
id: T-M1-03
milestone: M1
title: Sign-in shows a clear error for a wrong password
spec: [docs/specs/auth.md]
depends: [T-M1-02]
size: S                      # S ≤ 150 / M ≤ 400 changed code lines at standard rigor
role: implementer
touch: [src/auth/**, test/auth/**]
dont_touch: [src/auth/crypto/**]
scenarios: [AUTH-AC-04]
---

## Done when

- `pnpm test`
- `pnpm spec:matrix --check`
```

Headings accepted for the criteria section: "Done when", "Pass criteria", "Criteria", "เกณฑ์ผ่าน".
Each list item is one command — a leading backticked command or the whole line.

## Specs and scenarios

Specs live in `docs/specs/<system>.md`. The "Acceptance" (or "ฉากยอมรับ") section is a table whose first cell is a
scenario id `<AREA>-AC-<nn>`. `spec:matrix` maps ids to tests (JS/TS: the test name contains the id; other languages: the
id appears in a test file). `spec:matrix --check` fails when a started card has a scenario without a test;
`--complete=auth,billing` demands every scenario of those specs.

## Parallel lanes

With `workflow.worktrees` on, cards whose role works in the **code lane** (implementer, qa-runner, db-guardian,
data-engineer, builder custom roles) can run side by side:

- `task:next --parallel` lists a safe set: no `touch` overlap (unsure = overlap), caps per lane, solo paths alone, one card
  per submodule — and explains why other cards wait. `--json` for scripts.
- `task:start <id> --worktree` — commit plan files first. Step 1 creates the worktree on `card/<id>`, step 2 commits the
  evidence on the main branch, steps 3–5 bring the worktree up to date, write a lane label and install dependencies.
  A failure in steps 3–5 exits **6**: fix the cause, then `--resume`.
- Inside the lane: work, `task:verify <id>` (evidence on the lane branch only), commit. `task:env` prints the lane's port
  (`base + step × lane`) and test-database name.
- In the main folder: `task:merge <id>` merges one card with `--no-ff`, installs dependencies if lock files changed, runs
  the merge checks and refreshes status. Exit **3** refused (not passed, dirty folder, changed after verification) · **4**
  conflict · **5** a merge check failed — 4 and 5 are rolled back completely.

Roles in the main-folder lane (designer, spec-reviewer, art-producer, release-operator, …) and submodule cards run in the main
folder, one at a time. With lanes off, every card runs in the main folder, one at a time.

## Side lanes

Work that does not wait on the active milestone — a landing page, community setup, a docs site — can run beside it
without breaking milestone order. The designer lists those cards in `side_cards:` of their **planned** milestone:

```yaml
id: M3
status: planned
cards: [T-M3-01, T-M3-02, T-M3-03]
side_cards: [T-M3-01]          # must also be in cards
```

- **Same standards.** Side cards start, verify, merge and get reviewed exactly like other cards: spec, `touch`, `depends`,
  size caps, scenario tests, evidence. Lane rules (touch overlap, caps, solo paths, `--worktree`) apply unchanged.
- **The active milestone comes first.** `task:next` (all forms) walks the active milestone's cards first, then side cards
  in `cards` order, tagged `[side lane M3]`; `--json` adds `side: [...]`. `task:start` of a side card succeeds only in
  capacity the active milestone leaves free — with lanes off (one folder), a side card starts only when no active card can.
- **A cap.** At most `workflow.sideLanes.max` side cards in progress (default 1). `workflow.sideLanes.enabled: false` turns
  the feature off (`side_cards` is then ignored).
- **Plan checks.** `task:state --check` fails when `side_cards` lists a card that is not in `cards`, or when a side card
  depends on a card that can never start (not done, not in the active milestone, not a side card).
- **Status.** `STATE.md` shows a "Side lane M3" block after the active milestone (only side cards, counted separately);
  `.saf/plan.md` adds a side-lane task list; the SessionStart hook prints one line per side lane plus its card in
  progress. Side cards never count toward the active milestone's done count or exit gates — they count again when their own
  milestone becomes active.
- **Heavy runs** of a side lane (e2e, perf) go through the same measure lock as everything else.

## Measure lock

`measure <name> -- <command>` runs heavy commands (full test suite, e2e, perf) one at a time per machine, across all
worktrees. Names marked `idle` also wait until the machine is quiet. Exit **75** = never got the lock or a quiet machine —
nothing was measured; run again later. `measure --status` shows the holder.

## Hooks

- **SessionStart** prints the milestone, cards done, the card in progress with its criteria and `touch`, the next cards and
  the latest evidence — inside a lane, only that lane's card.
- **Stop** reminds the session when a started card has not passed yet (once per round; `SAF_STOP_HOOK=off` disables it).
- `task:probe` proves the hook works: two fresh `claude -p` sessions without tools — with hooks it must know the card,
  with hooks disabled it must not.
