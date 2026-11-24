# How the plan works — milestones · cards · evidence

Status is never typed by hand. It is computed from three kinds of files:

| File | What it holds | Who writes it |
|---|---|---|
| `docs/plan/milestones/M<n>.md` | goal · scope · exit gates · ordered card list · `status` (one `active` at a time) | designer · {{owner}} approves |
| `docs/plan/tasks/M<n>/T-M<n>-<nn>.md` | one card: frontmatter + a "Done when" list whose items are commands | designer |
| `docs/plan/evidence/<id>.json` | start point · command results · files changed | the engine only (`task:start` · `task:verify`) |

`docs/plan/STATE.md` and `.saf/plan.md` are generated from those files (`{{cmd.taskState}}`). Never edit them.

## 1. The card loop

```
{{owner}} says Go on a milestone
  → designer writes cards (+ specs with acceptance scenarios)            /saf-plan
  → for each card, in order:
      {{cmd.taskStart}}                       records the starting commit and pre-existing changes
      implementer does the card (touch only the listed files)
      {{cmd.taskVerify}}                      runs every "Done when" command · checks files ⊆ touch · scenario tests exist
      spec-reviewer compares the work with the spec (read only)
      qa-runner runs real tests when the card touches UI / multiplayer / performance
      commit (or {{cmd.taskMerge}} for a lane card)
  → {{cmd.taskVerifyM}}                       exit gates → report → the {{owner}} closes the milestone
```

A card is **done** only when `task:verify` passes. A failed verify keeps the card open and records why (failed commands ·
files outside `touch` · files in `dont_touch` · scenarios without a test).

How often the **full** test suite runs is `workflow.testMode` (`every-card` · `targeted` · `milestone`; default `milestone`).
In the deferred modes a card proves itself with its own tests, its evidence says "full suite deferred to gate", and the
in `milestone` mode the exit gate always runs the full suite, and in `targeted` mode it runs when a lane card merges (when the gate fails, `{{cmd.taskCulprit}}` finds the card that broke it). Each person can override the mode with `SAF_TEST_MODE` or an untracked
`saf.config.local.json` (it may hold `workflow.testMode`, `workflow.lanes.code` and `workflow.sideLanes.max`; any other key, including `$schema`, is refused). Lane caps have no environment variable (every session must count the same caps) and are at most `LANE_CEILING` in `tools/saf/lib/config.mjs`.

## 2. Card format

Copy [tasks/_template.md](tasks/_template.md). Frontmatter fields:

| Field | Meaning |
|---|---|
| `id` · `milestone` · `title` | `T-M1-01` · `M1` · one line; the file name equals the id, the folder equals the milestone |
| `spec` | spec files this card implements (`docs/specs/…`) |
| `depends` | cards that must pass first |
| `size` | `S` (≤ {{sizeS}} code lines, tests ≤ {{testS}}) or `M` (≤ {{sizeM}}, tests ≤ {{testM}}) — bigger → split |
| `role` | who does it: {{roleNames}} |
| `repo` | `.` (default) or a git submodule path — one submodule per card |
| `touch` | globs of files the card may change (required) |
| `dont_touch` | globs that must stay unchanged even if `touch` matches |
| `scenarios` | acceptance scenario ids (`AUTH-AC-01`) — each needs a test with the id in its name |

The "Done when" section: every list item is one command (a leading backticked command, or the whole line). All must exit 0.

## 3. Milestones and exit gates

A milestone file has `status: planned | active | paused | done`, a `cards:` list (order = work order) and `gates:`.
Each gate has `id`, `text` and optional `run:` commands — a gate without commands is a manual check by the {{owner}}.
`{{cmd.taskVerifyM}}` runs every gate and writes `docs/plan/evidence/<M>.json`; `{{cmd.taskReport}}` writes the report (`--html` also writes a page for people who do not read JSON).

Only the {{owner}} moves a milestone to `active` ("Go") or `done`.
{{#if sideOn}}

### Side lanes

Work that does not depend on the active milestone (a landing page, community setup, docs site) can run beside it.
The designer lists those cards in `side_cards:` of their **planned** milestone (each must also be in `cards:`):

```yaml
status: planned
cards: [T-M3-01, T-M3-02, T-M3-03]
side_cards: [T-M3-01]
```

- side cards start, verify, merge and get reviewed exactly like other cards — same spec, `touch`, `depends`, size caps and evidence
- the active milestone always comes first: `{{cmd.taskNext}}` lists its cards before side cards (tagged `[side lane M<n>]`),
  and a side card starts only in capacity the active milestone leaves free
- at most {{workflow.sideLanes.max}} side card(s) in progress at a time (`workflow.sideLanes` in `saf.config.json` — the project's cap; a machine may set its own `workflow.sideLanes.max` in `saf.config.local.json`, and it never adds slots the lane caps do not leave; at most `LANE_CEILING`, no environment variable)
- a side card may depend only on cards that are done or can start themselves
- `docs/plan/STATE.md` and the session summary show each side lane in its own block; side cards never count toward the
  active milestone's done count or its exit gates — they count when their own milestone becomes active
- heavy test runs of a side lane go through the same measure lock as everything else
{{/if}}

## 4. Specs and acceptance scenarios

Specs live in `docs/specs/` (copy [../specs/_template.md](../specs/_template.md)). The "Acceptance" section lists
scenarios with ids like `AUTH-AC-01`. `{{cmd.specMatrix}}` maps scenarios to tests; `{{cmd.specMatrixCheck}}` fails when a
started card lacks a test for one of its scenarios.
{{#if lanesOn}}

## 5. Parallel lanes

Cards whose role works in a **code lane** ({{#each roles}}{{#eq .lane "code"}}`{{.name}}` {{/eq}}{{/each}}) can run in
parallel, each in its own git worktree under `{{workflow.worktreeDir}}/` on branch `{{workflow.branchPrefix}}<id>`.
Other cards run in the main folder, one at a time.

- `{{cmd.taskNext}}` lists cards that can start together (no `touch` overlap · caps: code {{workflow.lanes.code}} · main {{workflow.lanes.main}}{{#if workflow.solo}} · solo paths {{workflow.solo}}{{/if}}) and why others wait — these are the project's caps; a machine may set its own `workflow.lanes.code` in `saf.config.local.json`, (at most `LANE_CEILING` in `tools/saf/lib/config.mjs`; there is no environment variable for caps). The main-folder lane stays one card because `{{cmd.taskVerify}}` counts every file changed in the folder since a card's start commit as that card's, so two cards there cannot be told apart
- `{{cmd.taskStartLane}}` opens the lane: the card files must be committed first; evidence is committed on the main branch.
  If steps 3–5 fail it exits 6 — fix the cause, then re-run with `--resume`
- inside the lane: work, then `{{cmd.taskVerify}}` (writes evidence on the lane branch only) · `{{cmd.taskEnv}}` prints the lane's ports
- back in the main folder: `{{cmd.taskMerge}}` merges one card, runs the merge checks ({{mergeChecksText}}) and refreshes status.
  Exit 3 = refused (not passed / dirty main) · 4 = conflict (merge rolled back) · 5 = merge checks failed (merge rolled back)
- with `workflow.testMode` = `milestone` the merge checks skip the full test suite (the gate runs it); when the gate fails,
  `{{cmd.taskCulprit}}` finds the card that broke it
{{/if}}
{{#if measureOn}}

## 6. Measure lock

Heavy commands (full test run · e2e · perf) run one at a time on this machine: `{{cmd.measure}}`.
Exit 75 = the lock was busy and nothing was measured — run it again later. `{{cmd.measureStatus}}` shows who holds it.
{{/if}}

## 7. Evidence rules

- "Done" means a real run: attach the command output, never a guess or a ticked box
- `docs/plan/evidence/` is written by the engine; never edit or delete it by hand
- If a check is flaky, fix the flakiness first — never retry until green and call it done

## 8. Friction log

When the workflow itself gets in the way of a card, record it in `docs/plan/friction.md` — one append-only file. Kinds:
`review-bounce` (a spec review failed because of a gap in SAF, not in the card's work) · `command-failed` (an engine command
failed, crashed or did the wrong thing) · `doc-drift` (a document, card or template contradicted the code) · `workaround`
(the work needed a step the workflow does not support).

- add: `{{cmd.taskFrictionAdd}}` appends one line dated today (in `people.timeZone`) and prints its id. `--card <id>` links a card of the plan; `area` says where the friction lives (for example `task:merge` or a file path); no field may contain ` · ` or a line break
- close: `{{cmd.taskFrictionClose}}` appends a closing line: `carded` and `fixed` need a card id of the plan, `dropped` needs a reason. An entry that is `fixed` or `dropped` cannot be closed again
- `{{cmd.taskFriction}}` without an argument lists the open and carded entries and the count per status
- lines are never edited or removed: a mistake is closed with `dropped` (and, if needed, a new entry). A line that breaks the format is a plan problem — `{{cmd.taskStateCheck}}` names its line number
- the commands only write the file and never commit: commit it on its own, `git commit -m "chore(plan): friction F-<nnn>" -- docs/plan/friction.md`
{{#if lanesOn}}
- `add` and `close` are refused inside a lane worktree: an agent in a lane puts a `friction:` line in its report and the main session records it
{{/if}}
- while an entry is open or carded the session summary shows `Friction: <open> open · <carded> carded`
{{#if pmNpm}}

npm passes arguments after `--`: `npm run task:start -- T-M1-01`.
{{/if}}
