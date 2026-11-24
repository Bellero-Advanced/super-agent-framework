# Spec — the designer runs every new check against the current code before handing it over

Decision: [D-020](../DECISIONS.md) (proposed). Card: T-M3-30.

## 1. Purpose

A "Done when" command or an acceptance scenario that already passes on the code before the card proves nothing. M2
found one only in review: the first LCAP-AC-04 row of [lane-caps.md](lane-caps.md) (`lanePorts.base` 65000, `step` 100,
`lanes.code` 3) could never fail — the highest port 65300 is below the limit — and nobody noticed until the reviewer did
(M2 review note 25/N1; the row now uses step 200). After this spec the designer role runs each new command before the
hand-over and works out each scenario row against the current code, and `task:prerun <id>` does the command part in one
step.

## 2. Rules

### Role and templates

1. The designer agent template (`kit/tools-saf/templates/agents/designer.md`) gains a rule: before a card or spec is
   handed over, run `task:prerun <id>` for each new card and see every proving command fail, or mark it; for every
   acceptance row with concrete values, work out what the current code does with them — a row that cannot fail is
   rewritten, or the spec says under the table why it passes by design. The rule cites no project-specific example.
2. Mark syntax: in a "Done when" item, text after the backticked command containing `passes by design:` and a
   non-empty reason. `task:verify` ignores it (it reads only the backticked command — `criteriaCommands` unchanged).
3. The card template (`kit/tools-saf/templates/{en,th}/docs/plan/tasks/_template.md` and this repository's
   `docs/plan/tasks/_template.md`) says under "Done when": each command fails before the card (`task:prerun`) or
   carries `— passes by design: <reason>`; guard commands need no mark. The spec template
   (`kit/tools-saf/templates/{en,th}/docs/specs/_template.md` and `docs/specs/_template.md`) says under Acceptance:
   each row must be able to fail on the code before the card — work out its values.
4. `/saf-plan` (`kit/tools-saf/templates/{en,th}/commands/saf-plan.md`, this repository's
   `.claude/commands/saf-plan.md`): the check step runs `task:prerun` for each new card next to `task:state --check`.

### `task:prerun <id>`

5. Read-only: writes no evidence, no `STATE.md`, no mirror. Works in the main folder and in a lane worktree. The card
   must exist and not be started (`todo`); otherwise exit 2 (`started` → the code already changed, the result means
   nothing).
6. Each "Done when" command is classified in order:
   - **guard** — `isFullSuite(config, cmd)` (`testmode.mjs`), an entry of `workflow.mergeChecks`, or the command of an
     engine check script (`spec:matrix`, `docs:check`, `check-secrets`, `task:state`, in the project's command form
     from `scriptCommand`) — printed as `guard — not run`;
   - otherwise it runs with the engine's command runner (the `workflow.commandTimeoutMs` limit, the same runner as
     `task:verify`). Exit ≠ 0 or a timeout → `fails now — expected`. Exit 0 with a mark → `passes by design:
     <reason>`. Exit 0 without a mark → `⚠ passes already — it cannot prove the card`.
7. Before running, the command list with each classification is printed. A card whose commands are all guards prints
   `no command proves this card` as a warning.
8. Exit 0 when no unmarked command passed · 1 when at least one did · 2 on usage errors or refusals.
9. Engine wiring: `ENGINE_SCRIPTS` gets `task:prerun` (`config.mjs`), `generate.mjs` `cmd.taskPrerun`, this
   repository's and the example's `package.json` get the script.

### Why there is no automatic warning

10. `task:state`, `spec:matrix` and the session hook do **not** warn about passing commands: they would have to run
    every command (slow, side effects, every session start runs `task:state`), and without the mark they cannot tell a
    guard from a proof, so they would raise false alarms. Scenario rows are text the engine cannot evaluate. The check
    stays an opt-in command plus the role rule.

## 3. Data

- Guard classification: `isFullSuite` (`testmode.mjs`), `workflow.mergeChecks`, the list of engine check scripts as one
  table in the new `kit/tools-saf/lib/prerun.mjs`.
- The "Done when" items with their raw text: read from the card file by `prerun.mjs` (the plan loader is not changed).

## 4. Edge cases and errors

- A command that needs a file the card will create fails now — that is the expected pre-card state.
- A command that passes today for the wrong reason (for example an argument the current code ignores) is reported as
  passing; the designer rewrites it or relies on the card's test instead.
- An unknown card id → exit 2 naming the id; a plan with problems → exit 2 with `task:state --check`.
- Windows: the runner already spawns commands the way `task:verify` does.

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| PRERUN-AC-01 | a not-started card with Done when: a command that exits 1, one that exits 0, one that exits 0 marked `— passes by design: guard`, and `npm test` (the project's full suite) | `task:prerun <id>` | lines `fails now — expected`, `⚠ passes already`, `passes by design: guard`, `guard — not run`; exit 1; the full-suite command did not run | unit |
| PRERUN-AC-02 | the same card without the unmarked passing command | `task:prerun <id>` | exit 0 | unit |
| PRERUN-AC-03 | a started card · an unknown id · a stray argument | `task:prerun` | exit 2 each, nothing run | unit |
| PRERUN-AC-04 | any run of AC-01 | compare the evidence folder, `STATE.md` and `.saf/plan.md` before and after | unchanged | unit |
| PRERUN-AC-05 | a card whose commands are `spec:matrix -- --check`, `docs:check` and a merge-check entry | `task:prerun <id>` | all three `guard — not run`; warning `no command proves this card`; exit 0 | unit |
| PRERUN-AC-06 | the rendered templates of a temporary project | read the designer agent, the card and spec templates, `/saf-plan` | the designer rule names `task:prerun` and `passes by design:`; the card template's "Done when" line and the spec template's Acceptance line are present (en and th); `/saf-plan` runs `task:prerun` | unit |

## 6. Out of scope

- Running acceptance scenarios automatically (they are text until a card writes their test).
- Blocking `task:start` on a passing command.
