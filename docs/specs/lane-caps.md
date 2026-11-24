# Spec — lane caps fit the machine: higher ceilings, set per machine

Decision: [D-018](../DECISIONS.md) (decided, owner order 2026-11-24). Cards: T-M2-25 (engine) · T-M2-26 (explanations and docs) · T-M3-23 (rule 13).
Builds on [test-mode.md](test-mode.md) rules 2–7 (the per-machine file `saf.config.local.json`).

## 1. Purpose

Cards already cannot run together when their `touch` lists overlap, so how many may run at once is mostly a question of
the machine: each code lane is a full git worktree plus the lane install step, and it uses CPU, memory and disk while it
builds and tests. Today the code-lane cap and the side-lane cap stop at a low schema maximum and live only in the
tracked `saf.config.json`, so a strong machine cannot use its capacity and a weak one cannot lower the cap without
changing it for the whole team. With this spec both caps go much higher and each person can set them for their own
machine. The main-folder lane stays one card at a time, and the docs say why.

## 2. Rules

### Ceilings

1. `workflow.lanes.code` is an integer from 0 to `LANE_CEILING`; `workflow.sideLanes.max` is an integer from 1 to
   `LANE_CEILING`. `LANE_CEILING` lives in `kit/tools-saf/lib/config.mjs`; the schema's `maximum` of both keys equals it
   (a test fails when they differ).
2. `workflow.lanes.main` stays exactly 1 (schema minimum = maximum = 1). Reason, stated in the docs (rule 12): the
   main-folder lane works in one folder, and `task:verify` attributes changed files to a card by comparing the folder with
   the card's start commit — two cards in one folder cannot be told apart.
3. With worktrees on, `lanePorts.env` not empty and `lanes.code` ≥ 1, the highest lane port
   `lanePorts.base + lanePorts.step × lanes.code` must be ≤ `MAX_PORT` (`config.mjs`, the highest TCP port). Otherwise loading the
   config is an error that names `workflow.lanes.code`, `workflow.lanePorts.base` and `workflow.lanePorts.step` and the
   file the cap came from (`saf.config.json` or `saf.config.local.json`). The check runs after the per-machine file is
   applied, in `loadConfig`.

### Per machine

4. `LOCAL_KEYS` (`config.mjs`) adds `workflow.lanes.code` and `workflow.sideLanes.max` to `workflow.testMode`. Every
   other rule of test-mode.md rule 4 still holds: any other key (including `workflow.lanes.main`,
   `workflow.sideLanes.enabled`, `$schema`) is an error that names it; the file is validated with the same schema.
5. A lane cap comes from the first source that sets it: `saf.config.local.json` → `saf.config.json` → the default.
   There is **no** environment variable for lane caps: `task:next --parallel`, `task:start` and `task:merge` run in
   different shells and sessions, and a cap that one shell sees and another does not would let one start more lanes than
   the other counts. One file per machine keeps every session on that machine on the same caps.
6. `loadConfig` applies every `LOCAL_KEYS` key with one loop (no per-key branch except the test-mode source and its
   environment variable, which stay as in test-mode.md rules 2–3), and records the keys the local file set in
   `config.workflow.localKeys` (an array, empty when there is no local file).
7. When a lane cap stops a card, the reason `task:next --parallel` and `task:start` print ("code lane is full …",
   "side lanes are full …") names `saf.config.local.json` (as `this machine: saf.config.local.json`) when that cap came
   from the local file, and does not name it when the cap came from `saf.config.json` or the default. In the
   `pickParallel` reasons the text ends the reason; `task:start`'s own side-lane refusal carries it inside its
   parentheses. `task:start`'s "no free lane number" refusal does not name the file.
8. Generated files (CLAUDE.md, `docs/plan/README.md`, agents, STATE.md, `.saf/plan.md`) never depend on
   `saf.config.local.json` (test-mode.md rule 6): they show the project's caps from `saf.config.json`.

### Side lanes

9. Side cards still take only lane slots the active milestone leaves free; `workflow.sideLanes.max` limits how many side
   cards are in progress, it never adds slots. A `sideLanes.max` above what the lane caps leave has no further effect.

### Explanations and docs

10. `MACHINE_SWITCHES` (`choices.mjs`) has one line per new `LOCAL_KEYS` key, in en and th, saying it is the cap for
    this machine only.
11. The `lanes` (`on`, `on-custom`) and `side-lanes` (`on`, `on-more`) explanations in `choices.mjs`, en and th, say:
    the cost of each lane is a worktree (a full checkout) plus the lane install step, and CPU, memory and disk while it
    builds and tests; the main-folder lane stays one card at a time because cards there share one folder and verify
    tells cards apart by their start commit; the caps can be set per machine in `saf.config.local.json`. Every sentence
    is true of the code; the setup-choices data rules hold (no digits, ≤ `FIELD_MAX`).
12. `docs/config-reference.md` (`lanes`, `sideLanes` rows and the `saf.config.local.json` section),
    `docs/card-lifecycle.md` (Parallel lanes · Side lanes · Test mode "Per machine"), the plan README template (en, th),
    and the setup skill (`SKILL.md`, `questions.md`) name the three local keys, the ceiling's home (`LANE_CEILING`), the
    absence of an env variable for caps, and why the main lane stays one. No text says the local file holds "only
    `workflow.testMode`" any more.
13. `saf.config.local.json` is git-ignored, so it is absent inside a lane worktree: engine commands run there (a lane
    card's `task:verify`) use the repository's test mode and caps unless `SAF_TEST_MODE` is set. `docs/card-lifecycle.md`
    ("Per machine") and the setup skill (`SKILL.md`) say so in one sentence each.

## 3. Data

- `LANE_CEILING` · `MAX_PORT` · `LOCAL_KEYS` · `loadConfig`: `kit/tools-saf/lib/config.mjs`
- schema maxima: `kit/tools-saf/schema/saf.config.schema.json` (`workflow.lanes.code`, `workflow.sideLanes.max`)
- cap reasons: `pickParallel` in `kit/tools-saf/lib/parallel.mjs`
- explanations and per-machine lines: `CHOICES` · `MACHINE_SWITCHES` in `kit/tools-saf/lib/choices.mjs`

## 4. Edge cases and errors

- Local file sets `workflow.lanes.code: 0` → every card works in the main folder on this machine (as with lanes off)
- Local file sets a cap above `LANE_CEILING` → the schema error names the key and the local file
- Two machines with different caps share a branch: the caps are per machine, but what counts against them is not.
  Lane-start evidence is tracked in git, so `pickParallel` counts every card in progress on the branch
  (`activeCards(plan)`), wherever it was started, and `freeLane` skips the lane numbers in that evidence as well as the
  labels of this machine's worktrees. A machine with a lower cap can therefore see "code lane is full" because of cards
  started on another machine. Only the lane ports are per machine (they are local to each machine's servers)
- Ports: the default `base`/`step` stay far below `MAX_PORT` at `LANE_CEILING`; a custom high `base` is caught by rule 3
- Lowering the cap while more lane cards are in progress than the new cap: nothing is stopped; new cards wait until the
  count drops below the cap (`used ≥ cap` already counts cards in progress)

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| LCAP-AC-01 | the schema and `config.mjs` | the table test runs; a config with `lanes.code` = `LANE_CEILING`, then `LANE_CEILING + 1`, and the same for `sideLanes.max` | both schema maxima equal `LANE_CEILING` and are above today's old maximum; the ceiling values validate, ceiling + 1 fails naming the key; `lanes.main: 2` still fails | unit |
| LCAP-AC-02 | repo `lanes.code: 3`, `sideLanes.max: 1`; local file `lanes.code: 8`, `sideLanes.max: 4` | `loadConfig`; then `pickParallel` on a plan with ten non-overlapping todo code cards, the cap is reached | caps 8 / 4 from the local file, `workflow.localKeys` lists both; without the local file 3 / 1 and `localKeys` is empty; the skip reason of the first card over the cap names `saf.config.local.json` (`pickParallel`: at its end), and with the repo cap it does not | unit |
| LCAP-AC-03 | local file sets `workflow.lanes.main`, then `workflow.sideLanes.enabled`; an env `SAF_LANES=8` | `loadConfig` | the first two are errors naming the key and the local file; the env variable changes nothing | unit |
| LCAP-AC-04 | `lanePorts.base: 65000`, `step: 200`, `lanes.code: 3` in `saf.config.json` (the highest lane port is above `MAX_PORT`); then `lanes.code: 1` in the repo and `8` in the local file | `loadConfig` | error naming `workflow.lanes.code`, `workflow.lanePorts.base`, `workflow.lanePorts.step` and `saf.config.json`; second case names `saf.config.local.json`; with `env: []` no error | unit |
| LCAP-AC-05 | a project with and without a local file that sets both caps | `generate` | the generated files are byte-equal, and `docs/plan/README.md` shows the repo caps | unit |
| LCAP-AC-06 | `choices.mjs`, the docs and the skill | the docs test runs | `MACHINE_SWITCHES` has en and th lines for every `LOCAL_KEYS` key; the `lanes` `on-custom` and `side-lanes` `on-more` explanations (en) name the worktree, the install step and the per-machine file, and a `lanes` explanation says why the main lane stays one; `config-reference.md`, `card-lifecycle.md`, the plan README templates, `SKILL.md` and `questions.md` name `workflow.lanes.code` and `workflow.sideLanes.max` as per-machine keys and none says the local file holds only `workflow.testMode` | unit |
| LCAP-AC-07 | `docs/card-lifecycle.md` and `kit/claude/skills/saf-setup/SKILL.md` | the docs test runs | each says the local file is absent in a lane worktree and that lane verifies then use the repository's mode and caps unless `SAF_TEST_MODE` is set | unit |

## 6. Out of scope

- Side lanes with their own slots beside the active milestone's caps — M3 candidate, see
  [M2-review-notes.md](../plan/notes/M2-review-notes.md#triage-for-the-m2-exit-gate)
- Detecting the machine's CPU, memory or disk and suggesting a cap ("setup suggestions" is a separate roadmap item)
- More than one card in the main folder (rule 2)
- An environment variable for lane caps (rule 5)
