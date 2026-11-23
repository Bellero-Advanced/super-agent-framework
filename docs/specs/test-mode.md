# Spec — test mode (when the full test suite runs)

Decision: [D-008](../DECISIONS.md) (decided). Cards: T-M2-06 … T-M2-10, T-M2-16, T-M2-17.

## 1. Purpose

Today the full test suite runs on every card's `task:verify` and again on `task:merge`. On a weak machine that is
the slowest part of the card loop. `workflow.testMode` lets each person choose how often the full suite runs. The
default is the fastest mode: each card proves itself with the tests it touches, and the full suite runs once, at the
milestone exit gate ("collect the problems once and fix them before the milestone closes"). When that gate fails,
`task:culprit` finds the card that broke it.

## 2. Rules

### Settings

1. `workflow.testMode` is one of the modes in the `TEST_MODES` table in `kit/tools-saf/lib/config.mjs`:
   `every-card` · `targeted` · `milestone`. The default value lives in the same file (`milestone`).
2. The resolved mode comes from the first source that sets it: environment variable `SAF_TEST_MODE` → the per-user
   file `saf.config.local.json` (project root, not tracked by git) → `saf.config.json` → the default.
3. The engine records the resolved mode and its source (`env` · `local` · `repo` · `default`) together.
4. `saf.config.local.json` may only set keys listed in the `LOCAL_KEYS` table in `config.mjs` (today:
   `workflow.testMode`). Any other key is an error that names the key — never silently ignored. The file is validated
   with the same schema as `saf.config.json`.
5. An invalid `SAF_TEST_MODE` value is an error that lists the valid modes.
6. Generated files (CLAUDE.md, docs, agents, STATE.md layout) never depend on `saf.config.local.json` or
   `SAF_TEST_MODE`; only engine runs (`task:*`) read them.
7. The installer adds `saf.config.local.json` to `.gitignore` (the `GITIGNORE_LINES` table in `generate.mjs`).
8. `stack.commands.testFiles` is a command that runs only some test files; `{files}` is replaced by the file paths,
   each quoted for the shell. Empty (the default) means the project has no such command.

### Which commands are "the full suite"

9. A command is a full-suite command when, trimmed, it equals the non-empty value of a `stack.commands` key listed in
   the `FULL_SUITE_KEYS` table in `config.mjs` (today `test` and `e2e`). Cards keep writing `npm test` in "Done when";
   the mode decides whether it runs at verify.

### Card verify (`task:verify <card>`)

10. The targeted files of a card are: test files the card changed that exist at verify time, plus test files that
    contain one of the card's scenario ids (the same match `spec:matrix` uses).
11. A **targeted run** is `stack.commands.testFiles` with the targeted files. It is recorded in the evidence like any
    criteria command (exit code, time, output tail).
12. When a full-suite command is **deferred**, verify does not run it; the card's other criteria run as written, and
    one targeted run replaces all deferred commands.
13. If a targeted run is impossible (no `testFiles` command, or no targeted files), nothing is deferred: the full-suite
    commands run at verify and the evidence records why (`fallback`). A card never passes without a real test run
    when its "Done when" names one.
14. A card whose "Done when" names no full-suite command runs exactly as written in every mode.
15. Per mode:

    | mode | main-folder card verify | lane card verify | `task:merge` | milestone exit gate |
    |---|---|---|---|---|
    | `every-card` | all criteria | all criteria | all `mergeChecks` | gates as written |
    | `targeted` | all criteria | full suite deferred → targeted run | all `mergeChecks` | gates as written |
    | `milestone` | full suite deferred → targeted run | full suite deferred → targeted run | `mergeChecks` without full-suite commands | gates + the full suite (rule 19) |

    `targeted` runs the full suite once per card, at the step where the card reaches the main branch. `milestone` runs
    it once per milestone.
16. Card evidence (`verified`) carries `testMode` (`{ mode, source }`) and, when anything was deferred,
    `deferred` (the commands not run) and `targeted` (`{ files }` or `{ fallback }`).
17. A card that passed with deferred commands is shown everywhere its result appears (verify output, STATE.md, the
    session summary) with the words "full suite deferred to gate" (text table `kit/tools-saf/lib/text.mjs`, en and th).

### Merge and the exit gate

18. In `milestone` mode `task:merge` skips the full-suite commands of `mergeChecks`, runs the rest, and prints which
    commands it skipped and why.
19. In `milestone` mode `task:verify <M>` makes sure every full-suite command runs: it adds a gate `full-suite`
    holding the full-suite commands (rule 9, in `FULL_SUITE_KEYS` order) that no declared gate's `run:` contains. When
    the declared gates already run every full-suite command, no gate is added. The gate decides pass or fail like any
    other gate.
20. Milestone evidence carries `testMode` and `deferredCards` (the milestone's cards whose evidence has `deferred`).
21. When a gate that runs a full-suite command fails and `deferredCards` is not empty, the output names the next step:
    `task:culprit <M>`.

### The `full-suite` gate in the plan files

28. The gate id `full-suite` is reserved in every mode: a milestone file that declares a gate with that id is a plan
    problem that names the id and the file (`task:state --check` fails, `task:verify <M>` refuses). The id lives in
    `FULL_SUITE_GATE` in `kit/tools-saf/lib/testmode.mjs`.
29. STATE.md (exit-gate table), `.saf/plan.md` ("Done When") and the `task:report <M>` gate table show, after the
    gates declared in the milestone file, every gate of the milestone evidence whose id is not declared, with its
    result marked like a declared gate (passed · failed). `full-suite` is shown with its text from the text table
    (`kit/tools-saf/lib/text.mjs`, en and th); any other undeclared id is shown with the "not in the milestone file"
    text from the same table.
30. Rule 29 reads only the tracked milestone evidence, never the current test mode, so these files stay the same on
    every machine (rule 6). Before the first `task:verify <M>` run only the declared gates are shown.

### Finding the card that broke the suite (`task:culprit <M>`)

22. The range is the first-parent commits from the oldest `started.base` of the milestone's cards (an ancestor of
    HEAD) to HEAD. Only committed history is tested; uncommitted changes in the main folder are reported and ignored.
23. The command is the first full-suite command (`--cmd "<command>"` overrides).
24. Every run happens in a temporary detached git worktree under `workflow.worktreeDir`; the main folder is never
    checked out or changed. `workflow.laneInstall` runs in the worktree before each run when it is set. The worktree
    is removed when the command ends, also on error.
25. Order: run at HEAD — passes → exit 3 ("passes at HEAD — flaky or already fixed"); run at the base — fails → exit 2
    ("already failing before the first card"); otherwise binary search for the first failing commit. At most
    2 + ⌈log2(commits)⌉ runs.
26. The failing commit maps to a card: a card id of the milestone in the commit subject (lane merges are
    `merge(M<n>): <id> …`), else the card whose evidence `files.changed` overlaps the commit's files most, else
    "no card". Output: card id and title, commit and subject, the tail of the failing run. Exit 0 when a commit was found.
27. `task:culprit` writes nothing in `docs/plan/`.

## 3. Data

- `TEST_MODES` · default mode · `LOCAL_KEYS` · `FULL_SUITE_KEYS` · the env variable name — `kit/tools-saf/lib/config.mjs`
- schema: `workflow.testMode` · `stack.commands.testFiles` — `kit/tools-saf/schema/saf.config.schema.json`
- targeted-file selection and the mode table of rule 15 — `kit/tools-saf/lib/testmode.mjs`
- "full suite deferred to gate" text · the `full-suite` gate text · the "not in the milestone file" text —
  `kit/tools-saf/lib/text.mjs`
- the reserved gate id (`FULL_SUITE_GATE`) — `kit/tools-saf/lib/testmode.mjs`
- culprit search — `kit/tools-saf/lib/culprit.mjs` · script name `task:culprit` — `ENGINE_SCRIPTS` in `config.mjs`

## 4. Edge cases and errors

- `saf.config.local.json` is not valid JSON → the same error style as `saf.config.json`, naming the local file
- the targeted file list is long → passed as one command; the runner's timeout applies as for any criteria command
- a lane card verified in `targeted` mode whose merge checks fail → the merge is rolled back (exit 5), as today
- `task:culprit` in a lane worktree → refused, like other main-folder-only commands
- `task:culprit` on a milestone with no started cards → error "no card of <M> has started"
- the declared gates run some full-suite commands but not all (for example `npm test` but not the e2e command) →
  the `full-suite` gate holds only the missing ones (rule 19)
- a milestone gate was removed from the milestone file after `task:verify <M>` ran → it stays visible from the
  evidence with the "not in the milestone file" text until the gates run again (rule 29)
- people on one team use different modes → each card's evidence shows its own mode and source; the exit gate runs
  the full suite in `milestone` mode whoever runs it

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| TMODE-AC-01 | no `testMode` in any source | config loads | mode `milestone`, source `default` | unit |
| TMODE-AC-02 | repo `targeted`, local file `every-card` | config loads; then with `SAF_TEST_MODE=milestone` | `every-card` from `local`; then `milestone` from `env` | unit |
| TMODE-AC-03 | local file sets `workflow.lanes`; or `SAF_TEST_MODE=fast` | config loads | error naming `workflow.lanes`; error listing the valid modes | unit |
| TMODE-AC-04 | a project with and without `saf.config.local.json` | `init` / `upgrade` generate files | generated files are byte-equal; `.gitignore` lists `saf.config.local.json` | unit |
| TMODE-AC-05 | `milestone` mode, card criteria `npm test` + another command, the card changed one test file | `task:verify` | the other command and one targeted run of that file run, `npm test` does not; evidence has `testMode`, `deferred`, `targeted.files`; STATE.md says "full suite deferred to gate" | unit |
| TMODE-AC-06 | `milestone` mode, no `testFiles` command (or no targeted files) | `task:verify` | the full suite runs; evidence has `targeted.fallback`; nothing deferred | unit |
| TMODE-AC-07 | `targeted` mode | `task:verify` of a lane card and of a main-folder card | lane card: targeted run; main-folder card: full suite | unit |
| TMODE-AC-08 | `every-card` mode | `task:verify` | criteria run exactly as written; no `deferred` in evidence | unit |
| TMODE-AC-09 | `milestone` mode, `mergeChecks` with `npm test` | `task:merge` | `npm test` skipped and reported; the other checks run | unit |
| TMODE-AC-10 | `milestone` mode, no gate runs the full suite | `task:verify <M>` | an extra `full-suite` gate runs it; evidence has `testMode` and `deferredCards` | unit |
| TMODE-AC-11 | a repo with four card commits, the third breaks the suite | `task:culprit <M>` | names the third card and its commit; at most 2 + ⌈log2 4⌉ runs; temporary worktree gone; `docs/plan/` unchanged | unit |
| TMODE-AC-12 | the suite fails before the first card; or passes at HEAD | `task:culprit <M>` | exit 2; exit 3 | unit |
| TMODE-AC-13 | the full-suite gate fails and a card has `deferred` evidence | `task:verify <M>` | output names `task:culprit <M>` | unit |
| TMODE-AC-14 | `milestone` mode, `test` and `e2e` commands set, the only declared gate runs `npm test`; then gates that run both | `task:verify <M>` | an extra `full-suite` gate runs only the e2e command (`npm test` runs once); then no extra gate | unit |
| TMODE-AC-15 | a milestone file declares a gate with id `full-suite` | `task:state --check`; `task:verify <M>` | a plan problem naming `full-suite` and the file; verify refuses before running any gate | unit |
| TMODE-AC-16 | milestone evidence with a failed `full-suite` gate and a passed gate that is not in the milestone file, doc language en and th | STATE.md, `.saf/plan.md` and `task:report <M>` are written | each shows a `full-suite` row marked failed with the text-table text in that language, and the other row with the "not in the milestone file" text; with no milestone evidence only the declared gates show | unit |

## 6. Out of scope

- running only tests "affected" by changed source files (dependency graphs) — targeted means changed test files and
  scenario tests only
- a repo-level floor that a per-user setting cannot go below (open question on D-008)
- other per-user keys (lane caps, measure lock) — `LOCAL_KEYS` can grow later, one decision per key
