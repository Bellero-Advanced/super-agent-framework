# CLAUDE.md — todo-api

A tiny todo HTTP API — the SAF example project.
API / backend · stage: prototype · users: developers reading the SAF example

This file = unbreakable rules + commands + where to start. Everything else lives in [docs/INDEX.md](docs/INDEX.md) — one home per topic.

## Start every session

1. Current work: the SessionStart hook injects a summary into every session (milestone · card in progress · criteria · files you may touch) · full view `docs/plan/STATE.md` · how cards work `docs/plan/README.md`
2. Find the home of your topic in `docs/INDEX.md` and read only that section — do not read everything
3. Conflicting information → precedence in `docs/DECISIONS.md` §0: latest owner order → DECISIONS → the topic's home · `docs/archive/` is history, never a source of truth
4. Path-scoped rules in `.claude/rules/` load by themselves when you touch matching files

## Open a session per role

Agents live in `.claude/agents/` (model + effort fixed per role — `npm run docs:check` verifies) · `/saf <anything in plain words>` routes the work (card loop · plan · bug · test · security · help) · skills in `.claude/skills/` load by themselves.

| Work | Roles | Open the main session with |
|---|---|---|
| design · write cards/specs · review against specs | `designer` · `spec-reviewer` | `claude --model claude-opus-5-5` |
| build cards · test · specialist work | `implementer` · `qa-runner` | `claude --model claude-sonnet-5-5` |

`--model` beats `ANTHROPIC_MODEL` and the value saved by `/model` · a session without `--model` should start with `claude-sonnet-5-5` (set it in .claude/settings.local.json, which git does not track) · `.claude/settings.json` is tracked and must never contain `env`.

## Stack

Node ≥ 20, no dependencies — node:http and node:test

| Item | Value |
|---|---|
| package manager | npm |
| database | none |
| UI languages | en |
| models | preset Balanced · planners `claude-opus-5-5` · builders `claude-sonnet-5-5` |

## Commands (run at the repo root)

```bash
npm test
npm run task:start -- <id>                                                                 # start a card (records the starting point to compare files)
npm run task:verify -- <id>                                                                # the only way a card becomes "done" · task:verify <M> = milestone exit gates
npm run task:abandon -- <id>                                                               # give up an unfinished card
npm run task:review -- <id> pass|fail [--kind <k>[,<k>…]] [--note <text>] [--area <area>]  # record a spec review round: pass, or fail with --kind (a fail reopens the card for verify) — main folder only
npm run task:diff -- <id>                                                                  # write the reviewer's diff of a started card (exactly the files task:verify counts) and print its path
npm run task:state                                                                         # rebuild STATE.md + .saf/plan.md (--check = verify only)
npm run task:probe                                                                         # prove a fresh session knows the current card from the hook
npm run task:report -- <M>                                                                 # milestone report from evidence
npm run task:culprit -- <M>                                                                # the exit gate's full suite failed: find the card that broke it (--cmd "<command>" picks the command)
npm run task:friction                                                                      # the workflow got in the way of a card: log it in docs/plan/friction.md (add · close · no argument lists what is open or carded) — add and close: main folder only
npm run docs:check                                                                         # links · commands · paths in agent docs · agents · settings
npm run spec:matrix                                                                        # acceptance scenarios ↔ tests (--check = started cards must have tests)
npm run check-secrets                                                                      # no secret values in tracked files
```

npm passes arguments after `--`: `npm run task:verify -- T-M1-01`.

## Unbreakable rules

- **Secrets:** never commit `.env` · `.env.local` · `.env.*.local` or any secret value · never print values to the screen or logs · inspect env files by counting key names only
- **git:** commit locally in stages · push only when the owner orders it · never force-push or rewrite history · protected branches: main
- **Deploy:** this project does not deploy
- **Cards:** work happens through cards in `docs/plan/` · a card is "done" only when `npm run task:verify -- <id>` passes · never hand-edit `docs/plan/STATE.md`, `.saf/plan.md` or `docs/plan/evidence/`
- **Evidence:** "done" needs a real run attached — never report done from ticked boxes or guesses
- **No time estimates** — use gates, not dates

## Definition of done

- The card passes `npm run task:verify -- <id>` — evidence lands in `docs/plan/evidence/`
- Every acceptance scenario the card names has a test with the scenario id in its name, and it passes
- Project checks pass with the run attached: `npm test`
- `npm run check-secrets` · `npm run docs:check` pass
- `spec-reviewer` compared the work with the spec (every card)
- Card size: M ≤ 800 · L ≤ 1600 changed code lines (tests: M ≤ 600 · L ≤ 1200) — `task:verify` warns above a cap and fails above 2 × the cap → the designer splits the card

## Repo layout

```
docs/        INDEX · DECISIONS · plan/ (milestones · tasks · evidence · STATE) · specs/ · archive/ (history)
.claude/     agents/ · commands/ (/saf · /saf-plan) · rules/ · skills/ · settings.json (hooks, no env)
.saf/        plan.md (generated mirror) · manifest.json
tools/saf/   workflow engine (vendored, no dependencies) · saf.config.json = its settings
```

## Working with the owner

- Reply in English, plainly, results first · no stack-trace dumps · translate jargon into plain words
- Follow the milestone plan — never invent task lists · the owner says "Go" per milestone · inside a milestone do not stop to ask about things that already have a recommended default
- New owner decisions → a new row in `docs/DECISIONS.md` (the AI never marks a row as decided by itself)
- A question that truly needs the owner: ask once with options and a recommendation, then continue with the parts that do not wait
- Token saving: stay silent on interim agent notifications · non-blocking reviewer notes are batched to the designer at milestone end · give the reviewer a diff file · fix flaky tests before new work · agents report in English
