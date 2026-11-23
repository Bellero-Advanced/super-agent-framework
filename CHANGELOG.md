# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.0

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
