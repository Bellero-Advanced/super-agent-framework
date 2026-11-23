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
`{{cmd.taskVerifyM}}` runs every gate and writes `docs/plan/evidence/<M>.json`; `{{cmd.taskReport}}` writes the report.

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
- at most {{workflow.sideLanes.max}} side card(s) in progress at a time (`workflow.sideLanes` in `saf.config.json`)
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

- `{{cmd.taskNext}}` lists cards that can start together (no `touch` overlap · caps: code {{workflow.lanes.code}} · main {{workflow.lanes.main}}{{#if workflow.solo}} · solo paths {{workflow.solo}}{{/if}}) and why others wait
- `{{cmd.taskStartLane}}` opens the lane: the card files must be committed first; evidence is committed on the main branch.
  If steps 3–5 fail it exits 6 — fix the cause, then re-run with `--resume`
- inside the lane: work, then `{{cmd.taskVerify}}` (writes evidence on the lane branch only) · `{{cmd.taskEnv}}` prints the lane's ports
- back in the main folder: `{{cmd.taskMerge}}` merges one card, runs the merge checks ({{mergeChecksText}}) and refreshes status.
  Exit 3 = refused (not passed / dirty main) · 4 = conflict (merge rolled back) · 5 = merge checks failed (merge rolled back)
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
{{#if pmNpm}}

npm passes arguments after `--`: `npm run task:start -- T-M1-01`.
{{/if}}
