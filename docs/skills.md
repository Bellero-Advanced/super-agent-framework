# Skills

Skills live in `.claude/skills/<name>/SKILL.md` in your project. Claude loads one by itself when the work matches its
description, so there is nothing to type — `/saf` routes a request and the right skill comes with it. Descriptions are kept
short because every description sits in the context of every session.

Skills are rendered from templates with your settings, so they show your real commands (for example `test-runner` lists
the project's own test, lint and typecheck commands).

## Core — always installed

| Skill | Loads when |
|---|---|
| `debug-protocol` | a bug, error, crash or flaky test — root cause with evidence before any edit, then a fix with a proving test |
| `tdd` | building a feature or fixing a bug test-first |
| `code-review` | reviewing a card, branch or work in progress against the spec and the repo rules |
| `security-review` | anything security — quick pass while building, full audit before a gate or release |
| `writing-for-agents` | editing CLAUDE.md, agents, rules, commands, skills, cards or specs |
| `handoff` | delegating or ending a session mid-card |
| `evidence-before-done` | before any "done", "fixed" or "passes" — real run output or it did not happen |
| `test-runner` | "run the tests", "is it working", gates — the project's real checks, in order, with real numbers |

## Optional packs — chosen in `/saf-setup`

Key: `skills.packs` in `saf.config.json`. Leaving it out uses the recommendation from your answers.

| Pack | Recommended when | Covers |
|---|---|---|
| `ui-frontend` | web app · mobile · game · ERP | every state (loading · empty · error), keyboard and focus, design tokens, overflow, screenshot evidence |
| `db-migrations` | a database is set | forward-only expand → migrate → contract, rehearsal on a `_test` database, backfills, production only on order |
| `performance` | game | budgets, measure-before-change, one change per measurement, before/after numbers |
| `i18n` | more than one UI language | keys not strings, whole sentences, plurals and formats by locale, overflow checks |
| `mobile` | mobile | touch targets, offline and lifecycle, permissions, device matrix, store builds on order |
| `game` | game | balance in data tables, server authority, deterministic simulation, frame and asset budgets, playtest evidence |

Change packs by re-running `/saf-setup` (or `node tools/saf/bin/saf.mjs setup --answers …`). A pack you drop is removed
if you did not edit it; edited skill files are kept. Your own skills in `.claude/skills/` are never touched.
