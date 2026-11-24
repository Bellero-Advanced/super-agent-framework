# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Breaking

- **Card sizes are now M and L; size S is retired.** M is one self-contained subsystem (warning above 800 changed code
  lines and 600 changed test lines), L is one whole feature (1600 and 1200). `task:verify` warns above a cap and **fails above
  twice the cap** — split the card. The caps are one table for every `project.rigor`; light and strict no longer have their own.
  What to do in an existing project: a card of a **planned** milestone with size `S` (or no size) is now a plan problem —
  change it to `M` or `L`; a card that already started, or sits in an active, paused or done milestone, still works and is
  counted as M. An old `workflow.sizes` / `workflow.testCaps` of the shape `{ "S", "M" }` is **ignored with a warning** — write
  `{ "M": …, "L": … }` or remove it. An L card needs a `## Steps` section with numbered steps
- **The full test suite runs at the milestone exit gate by default** (`workflow.testMode: milestone`). Before, `task:verify`
  ran every command at every card and `task:merge` ran the merge checks again. Now a card with a `commands.testFiles` command
  runs its own tests and the evidence says "full suite deferred to gate", `task:merge` skips the full-suite merge checks, and
  the exit gate runs the full suite. To keep the old behaviour set `workflow.testMode` to `every-card` (or
  `SAF_TEST_MODE=every-card` on one machine)

### Added

- **Test mode** — `workflow.testMode` (`every-card` · `targeted` · `milestone`), set per project in `saf.config.json` or per
  machine with `SAF_TEST_MODE` or the untracked `saf.config.local.json`; the exit gate runs every full-suite command no declared
  gate runs (gate id `full-suite`), and `STATE.md`, the plan mirror and the milestone report show it
- **`task:culprit <M>`** — when the full suite fails at the exit gate, finds the card and commit that broke it by testing the
  milestone's history in a temporary worktree (the main folder is never touched)
- **Setup choices** — `saf choices --group <1-8|flow>` explains each option of the setup interview (what it is · good for ·
  cost · pick it when), and `saf choices --not-asked` lists every setting the interview does not ask and where to change it,
  in English and Thai; `/saf-setup` shows these four lines for every option and lists the settings it did not ask before it
  generates anything
- **Guided setup re-run** — `saf setup --dry-run` lists what a run would do and writes nothing, `--dry-run --diff` shows each
  change as a diff, `--keep <path>` keeps an edited file; `/saf-setup` on a project that already has SAF shows the dry run and
  asks per edited file: take the new version, keep mine, or show the diff
- **HTML evidence report** — `task:report <M> --html` writes one self-contained page of the milestone's evidence
- **Document languages** — adding a language is one text-table entry and a template folder; a language with a missing
  template falls back to English with a warning
- **Card size check** — `task:verify` reports the card's changed code and test lines against the cap of its size
- **Friction log** — `task:friction add|close` records where the workflow got in the way in `docs/plan/friction.md`, every
  session starts with the number of open entries, `task:report` lists open friction with a brief for the designer, and
  `task:friction draft` prints card drafts for recurring friction
- **`task:review <id> pass|fail`** — the main session records each spec review round; a failed review reopens the card for
  `task:verify`, and the milestone report shows the rounds
- **`task:diff <id>`** writes the reviewer's diff with exactly the files `task:verify` counts (an L card's diff is split by
  step), and **`task:prerun <id>`** shows which of a card's "Done when" commands already pass before work starts
- **Effort by size** — `models.effort: by-size` (default `fixed`, asked in the setup interview) gives a role a second agent
  file at a lower effort for small cards, checked by `docs:check`; `task:start` names the agent and effort of each card, the
  evidence keeps them, and the report compares review rounds by size and effort
- **Self-fix cards** — with `workflow.selfFix: on` (default `off`) the main session may add a small card for a proven
  framework problem from the friction log to the active milestone without waiting for the owner's Go, inside a cap the engine
  enforces
- **`task:release <M>`** — shows every release guard and the next version without changing anything and stops unless
  `policies.release.auto` is `on` (default `off`); `--prepare` commits and pushes the version bump with the CHANGELOG and a release
  log line, and `--tag` pushes the version tag only after every CI job is green on that commit
- **L cards in steps** — an L card lists numbered steps, is built one commit per step and is resumed at the first step with no
  commit; the plan check demands the steps
- **`roles.lanes`** moves a role to the other lane, so image or copy cards can run in a worktree beside other cards
- **Lane caps up to 32** (was 9), and each machine can set its own `workflow.lanes.code` and `workflow.sideLanes.max` in
  `saf.config.local.json`; the setup explanations say what a lane costs

### Changed

- **`saf upgrade` adds the engine's missing scripts to `package.json`** (for example `task:culprit`); scripts you already
  have are never changed, the file is never created, and nothing is added when `stack.packageManager` is `none`
- **A setup re-run keeps your edited decision log, index, milestone and card files** and leaves `package.json` alone unless a
  script is missing; setup keeps identical files byte for byte, stops on a broken manifest, keeps a `scripts` value it cannot
  read, refuses a `--keep` it cannot read, and a minified `package.json` stays minified
- **Setup and upgrade messages say what happened** — the archive path in every settings warning and dry-run line,
  "not a JSON object" for a valid file that is not an object, and `upgrade` stops cleanly on a broken `saf.config.json` before
  it writes anything; `saf choices` and `config --check` refuse arguments they do not know
- **The `implementer` and `spec-reviewer` agents carry the standing checks** (failing-first tests, evidence size,
  sentence-to-code lists, Windows-safe tests, a checklist per review type), and the designer runs a card's new "Done when"
  commands against the current code before handing it over
- **Every view gives the same word for an exit gate** (`STATE.md`, the plan mirror, the report and the HTML page), and
  broken evidence no longer crashes them
- **Explanations and docs say what the code really does** — the UI rule with i18n, model ids with any preset, strict rigor's
  security review, rigor values with units, keep paths with spaces, lanes without the local file, the document language list
- **`task:merge` accepts a lane card that adds a path to `workflow.alwaysAllowed`**, and `spec:matrix --check` counts a
  started card only in the folder where it is built, so two parallel lane cards with scenarios no longer block each other
- **The `release-operator` agent and `CLAUDE.md` follow the push and deploy policies** — no owner order is asked for when
  deploy or push is allowed

### Fixed

- A lane worktree is recognised on Windows too (short 8.3 names and backslash paths)
- Setup archives an unreadable `.claude/settings.local.json` (and `settings.json`) instead of overwriting it, and never
  replaces a local `env` value or spreads a string `env` into index keys: an `env` block it cannot merge is archived and a
  colliding key keeps the local value
- `task:culprit` cleans up when interrupted, streams its runs, refuses a bad plan or card id and settles ties as documented
- `task:verify`'s fallback names its real cause
- Setup reads the plan without copying it to a temporary folder, and an edited task template gets format updates
- The report viewer escapes every printed field, shows invisible direction marks and sets a stricter content security policy

## 0.1.0 — 2026-11-23

First public release. MIT license.

### Workflow

- **Cards and milestones** in `docs/plan/` — every card lists the files it may touch, the commands that prove it works and
  the acceptance scenarios it covers; one milestone is active at a time and closes through exit gates
- **`task:verify`** is the only way a card becomes done: it runs the card's commands, checks every changed file is inside
  `touch`, checks scenario tests exist, and writes evidence to `docs/plan/evidence/`
- **Generated status** — `STATE.md`, a plan mirror, a SessionStart hook that tells every new session the current card, a
  Stop hook that reminds a session with an unfinished card, and `task:probe` to prove the hook works
- **Parallel lanes** in git worktrees (`task:start --worktree`, `task:next --parallel`, `task:merge` with merge checks and
  full rollback) and **side lanes**: cards of a planned milestone listed in `side_cards` run beside the active milestone,
  same standards, only in free capacity, `workflow.sideLanes.max` at a time
- **Guards** — `docs:check`, `check-secrets` (values never printed), `spec:matrix`, a measure lock for heavy runs

### Setup and commands

- `npx create-saf` / `npm create saf` / `saf init` copy the zero-dependency engine to `tools/saf/`; `/saf-setup` interviews
  you (grouped questions with recommended defaults, English or Thai) and generates CLAUDE.md, docs, the plan, roles, rules,
  skills, commands and hooks; `--answers` sets up without the interview; existing projects are adopted (old files archived,
  never deleted)
- Commands: `/saf` (one entry point — routes a plain request to the card loop, planning, debugging, tests, security or a
  question, and answers "help") · `/saf-plan` · `/saf-setup`
- Roles with fixed models and effort (presets Max · Balanced · Economy · Custom): designer · spec-reviewer (read only) ·
  implementer · qa-runner, plus art-producer · db-guardian · release-operator · security-auditor · data-engineer ·
  content-writer and custom roles
- Skills: core `debug-protocol` · `tdd` · `code-review` · `security-review` · `writing-for-agents` · `handoff` ·
  `evidence-before-done` · `test-runner`; optional packs `ui-frontend` · `db-migrations` · `performance` · `i18n` ·
  `mobile` · `game`
- `saf upgrade` replaces the engine, refreshes commands and skills SAF ships (edited files are kept) and removes ones it no
  longer ships

### Platforms

- Linux, macOS and Windows on Node 20 and 22 (cmd.exe on Windows, CRLF-tolerant state files)
- Example project `examples/todo-api` taken through two milestones with real evidence
