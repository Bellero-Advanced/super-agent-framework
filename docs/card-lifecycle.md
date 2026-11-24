# Card lifecycle

Status is never typed by hand — it is computed from three kinds of files:

| File | Holds | Written by |
|---|---|---|
| `docs/plan/milestones/M<n>.md` | goal · scope · risks · exit gates · ordered cards · `status` | designer; the owner approves |
| `docs/plan/tasks/M<n>/T-M<n>-<nn>.md` | one card: frontmatter + "Done when" commands | designer |
| `docs/plan/evidence/<id>.json` | start commit · command results · changed files | the engine only |
| `docs/plan/evidence/reviews/<id>.json` | one entry per spec review round | the engine only (`task:review`) |

`docs/plan/STATE.md` and `.saf/plan.md` are generated from them (`task:state`; `--check` verifies they are current).

## The loop

1. The owner says **Go** on a milestone (`status: active`; one at a time). The designer has written its cards (`/saf-plan`).
2. `task:start <id>` — refuses when the milestone is not active (and the card is not a [side card](#side-lanes)), a dependency has not passed, or another main-folder card is
   open. Records the start commit and a hash of every already-dirty file (so pre-existing changes are not blamed on the card).
   It prints `agent <name> · effort <effort> · size <S|M> · models.effort <mode> (<source>)` and records the same in the
   evidence (`started.effort`). The agent is the card's role, or — with `models.effort: by-size` — that role's variant file
   `<role>-<effort>` when the card's size asks for a different effort; `task:start` names it, and `task:report` compares
   review rounds by size and effort. Without the variant files (setup ran with `fixed`) it prints a warning and names the
   role's own agent.
3. The agent `task:start` named does the work, touching only files matched by `touch` and never `dont_touch`.
4. `task:verify <id>` — runs every "Done when" command, then compares changed files with `touch`/`dont_touch`, then checks
   every id in `scenarios` has a test with the id in its name. Pass → `done`; otherwise `failed` with the reasons.
   Flaky passes (failed before, passed now) are reported.
   It also counts changed lines (added + removed, from the start commit) — test files apart from code (test-file names and
   `test/`, `tests/`, `__tests__/` folders) — and compares them with the caps of the card's size (`workflow.sizes`,
   `workflow.testCaps`). Over a cap = a warning in the output and in the evidence (`verified.size`), never a failure:
   the reviewer decides, or the designer splits the card.
5. `spec-reviewer` (read only) compares the code with the card and the spec — every card at standard/strict rigor, size-M
   cards at light rigor. With `tokenSaving.reviewerDiff` on, the main session first runs `task:diff <id>`, which writes
   `.saf/memory/review/<id>.diff` (a git-ignored local file) holding exactly the files `task:verify` counts as the card's
   — a lane card is read and written in its worktree — and prints its path; the reviewer gets the card id, the review
   types the card needs (`text` · `data` · `security` · `refactor`) and that path (with the setting off: the id and the
   types only). The main session records each result with `task:review <id> pass` or
   `task:review <id> fail --kind <k>[,<k>…] [--note <text>]` (kinds: `spec-mismatch` · `missing-test` · `out-of-scope` · `docs` ·
   `framework`) in `docs/plan/evidence/reviews/<id>.json`; the command only works in the main folder, only after the card's
   last verify passed (for a lane card: the evidence committed on its branch), and never commits — commit that file alone
   (`git commit -m "chore(plan): review <id> round <n>" -- docs/plan/evidence/reviews/<id>.json`), before `task:merge` for a lane
   card. `task:review <id>` alone lists the rounds. A `fail` on a main-folder card sets its evidence back to `failed`
   (`reviewFailed: <round>`), so `task:verify <id>` runs again without `--restart` and keeps the attempt count; a lane card
   is verified again in its worktree; a merged card is not reopened (start a follow-up card). `fail --kind framework` also
   needs `--area` and appends a `review-bounce` entry to the friction log. `task:start --restart` and `task:abandon` keep the
   reviews file, and `task:report` shows rounds per card and the totals.
6. `qa-runner` runs real tests when the card touches UI, multiplayer or performance.
7. Commit (main-folder card) or `task:merge <id>` (lane card).
8. When all cards pass: `task:verify M<n>` runs the exit gates (gates without commands are manual owner checks) and
   `task:report M<n>` writes the report from evidence (`--html` also writes one page for people who do not read JSON). The owner closes the milestone.
9. Friction triage: the designer reads the report's Friction section, runs `task:friction draft`, and turns the drafts into
   cards (the milestone needs the owner's Go) or closes entries with `task:friction close <F-id> dropped <reason>`. Once a draft
   becomes a card, close its entries with `task:friction close <F-id> carded <card id>` ([details](#friction-log)).

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
`--complete=auth,billing` demands every scenario of those specs. A card still being built counts only in the folder
where it is built (its lane, or the main folder for a card without a lane); a finished card counts everywhere. A gap
whose only started cards are being built in another folder is marked "started in another folder" and does not fail
`--check`. If the lane label does not match the evidence, `--check` prints `lane not recognised (…)` and counts every
started card.

## Parallel lanes

With `workflow.worktrees` on, cards whose role works in the **code lane** (by default implementer, qa-runner, db-guardian,
data-engineer, builder custom roles; `roles.lanes` can move a role, see [roles.md](roles.md#moving-a-role-to-the-other-lane)) can run side by side:

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
  The "changed after verification" check skips files allowed by the main folder's `workflow.alwaysAllowed` or the branch's, so a card that adds a glob merges in one step.

By default the roles of the main-folder lane (designer, spec-reviewer, art-producer, release-operator, …) run in the main
folder, one at a time, and so do submodule cards, which cannot move; `roles.lanes` can move a library role other than designer, spec-reviewer and release-operator to the code lane ([roles.md](roles.md#moving-a-role-to-the-other-lane)). With lanes off, every card runs in the main folder, one at a time. The main lane is fixed at one card
(`workflow.lanes.main` stays 1) because it works in one folder and `task:verify` counts every file changed in the folder since a card's start commit as that card's, so two cards in one folder could not be told apart; `task:start` also refuses a second main-folder card.

Each code lane costs a worktree (a full checkout) plus the lane install step, and uses CPU, memory and disk while it builds and
tests. The code cap is at most `LANE_CEILING` (`lib/config.mjs`); a machine may set its own in `saf.config.local.json`
(`workflow.lanes.code`, 0 = every card in the main folder on that machine; no environment variable — all sessions must count
the same caps). Lane evidence (`docs/plan/evidence/*.json`) is tracked in git, so on a shared branch a machine counts the open lane cards started
elsewhere toward its own cap and skips their lane numbers (`task:start` also skips the lane labels in its own worktree folder): a
machine with a lower cap can see "code lane is full" because of cards another machine started. Ports matter only per machine
([config-reference.md](config-reference.md#safconfiglocaljson)).

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
- **A cap.** At most `workflow.sideLanes.max` side cards in progress (default 1; a machine may set its own in
  `saf.config.local.json`). It never adds slots: side cards only use lane slots the active milestone leaves free.
  `workflow.sideLanes.enabled: false` turns the feature off (`side_cards` is then ignored).
- **Plan checks.** `task:state --check` fails when `side_cards` lists a card that is not in `cards`, or when a side card
  depends on a card that can never start (not done, not in the active milestone, not a side card).
- **Status.** `STATE.md` shows a "Side lane M3" block after the active milestone (only side cards, counted separately);
  `.saf/plan.md` adds a side-lane task list; the SessionStart hook prints one line per side lane plus its card in
  progress. Side cards never count toward the active milestone's done count or exit gates — they count again when their own
  milestone becomes active.
- **Heavy runs** of a side lane (e2e, perf) go through the same measure lock as everything else.

## Test mode

`workflow.testMode` decides how often the **full** test suite runs ([spec](specs/test-mode.md#2-rules)). A card never
passes without a real test run when its "Done when" names one; the mode only moves the full run to a later step.

| Mode | Main-folder card verify | Lane card verify | `task:merge` | Milestone exit gate |
|---|---|---|---|---|
| `every-card` | all criteria | all criteria | all merge checks | gates as written |
| `targeted` | all criteria | full suite deferred, targeted run instead | all merge checks | gates as written |
| `milestone` (default) | full suite deferred, targeted run instead | full suite deferred, targeted run instead | merge checks without the full suite | gates plus the full suite |

- **What a deferred card carries.** The card's own tests (the test files it changed and the files that name its scenarios,
  run with `stack.commands.testFiles`) run instead of the full suite. Its evidence records the mode and where it came from,
  the commands not run and the files tested, and every place the result appears says "full suite deferred to gate". With no
  `testFiles` command or no targeted files, nothing is deferred: the full suite runs and the evidence says why.
- **In `milestone` mode the exit gate always runs the full suite.** `task:verify <M>` adds a `full-suite` gate for any
  full-suite command the declared gates do not run (the id `full-suite` is reserved), so the suite runs whoever runs the
  gate. In `targeted` mode the gate is as written and the full suite runs when a lane card merges (a main-folder card runs
  it at its own verify); in `every-card` mode it runs at every verify and merge.
- **When the gate fails**, `task:culprit <M>` finds the card: it tests the milestone's committed history in a temporary
  worktree (binary search, the main folder is never touched, nothing is written in `docs/plan/`) and names the card and commit.
  Exit **0** found · **2** already failing before the first card · **3** passes at HEAD (flaky, or already fixed) · **1** error
  (for example no card of the milestone has started). `--cmd "<command>"` picks another command.
- **Per machine.** Pick a mode for your own machine without touching tracked files: `SAF_TEST_MODE=<mode>` for one shell, or an
  untracked `saf.config.local.json` (it may also hold `workflow.lanes.code`, `workflow.sideLanes.max` and `models.effort`; [config-reference.md](config-reference.md#safconfiglocaljson)).
  Mode order: env, local file, `saf.config.json`, default. Generated files never depend on either. `saf.config.local.json` is
  git-ignored, so it is absent inside a lane worktree: engine commands run there, such as a lane card's `task:verify`, use
  the repository's lane caps, and its test mode unless `SAF_TEST_MODE` is set.

Which mode to pick (what it is, good for, cost, pick when) is in the setup question:
[questions.md](../kit/claude/skills/saf-setup/questions.md#test-mode--explain-each-choice-before-asking). SAF's own repository
uses `targeted`, because its cards change the engine that writes the evidence.

## Measure lock

`measure <name> -- <command>` runs heavy commands (full test suite, e2e, perf) one at a time per machine, across all
worktrees. Names marked `idle` also wait until the machine is quiet. Exit **75** = never got the lock or a quiet machine —
nothing was measured; run again later. `measure --status` shows the holder.

## Friction log

When SAF itself gets in the way of a card — a review fails because of a gap in SAF, an engine command fails or does the wrong
thing, a document contradicts the code, or the work needs a step the workflow does not support — record it in
`docs/plan/friction.md`, one append-only file:

- `task:friction add --kind <kind> --area <area> --evidence <text> <summary>` appends one line dated today and prints its id
  (kinds: `review-bounce` · `command-failed` · `doc-drift` · `workaround`; `--card <id>` links a card of the plan)
- `task:friction close <F-id> carded|fixed|dropped <card id or reason>` appends a closing line; an entry that is `fixed` or
  `dropped` cannot be closed again
- `task:friction` alone lists the open and carded entries with the count per status
- lines are never edited or removed; a line that breaks the format is a plan problem that `task:state --check` reports with its
  line number
- the commands only write the file, they never commit — commit it on its own
- inside a lane worktree `add` and `close` are refused: the agent writes a `friction:` line in its report and the main session
  records it
- while an entry is open or carded, the SessionStart summary shows `Friction: <open> open · <carded> carded`
- at milestone end `task:report` adds a Friction section after the gates: every open and carded entry, then a brief with one row
  per kind and area (count, ids, newest evidence). The brief groups only open entries (carded ones appear in the entry list only);
  a group with at least `FRICTION_LIMITS.recurring` (`kit/tools-saf/lib/friction.mjs`) open entries is marked recurring
- `task:friction draft` prints card drafts to the screen and writes nothing: one per recurring group, and — only when
  `workflow.selfFix` is `on` — one per open `command-failed` or `doc-drift` entry. A draft names the milestone (`T-M<n>-??`),
  quotes the evidence under "Why" and leaves `touch` and "Done when" as `TODO`. The engine never adds a card to a plan file: the
  designer writes the cards, or closes the entry `dropped` with a reason

## Hooks

- **SessionStart** prints the milestone, cards done, the card in progress with its criteria and `touch`, the next cards and
  the latest evidence — inside a lane, only that lane's card.
- **Stop** reminds the session when a started card has not passed yet (once per round; `SAF_STOP_HOOK=off` disables it).
- `task:probe` proves the hook works: two fresh `claude -p` sessions without tools — with hooks it must know the card,
  with hooks disabled it must not.
