# Example — todo-api

A tiny real project (Node ≥ 20, no dependencies) set up with SAF and taken through two milestones with the real engine:

- **M0** — the SAF setup gate: card `T-M0-01` and every exit gate, including the probe that proves a fresh Claude session
  learns the current card from the SessionStart hook
- **M1** — a todo HTTP API in three small cards (store → HTTP → validation), each started with `task:start`, built
  test-first and closed by `task:verify`

Nothing in `docs/plan/evidence/` was written by hand. Every file there is the engine's own record of a real run.

## What to look at

| Look at | What it shows |
|---|---|
| [docs/plan/STATE.md](docs/plan/STATE.md) | the generated status — never edited by hand |
| [docs/plan/milestones/M1.md](docs/plan/milestones/M1.md) | a milestone: goal, ordered cards, exit gates with commands |
| [docs/plan/tasks/M1/](docs/plan/tasks/M1/) | three cards: `touch` (files the card may change), `depends`, `scenarios`, "Done when" commands |
| [docs/specs/todos.md](docs/specs/todos.md) | the spec with acceptance scenarios `TODO-AC-01` … `TODO-AC-05` |
| [docs/plan/evidence/T-M1-01.json](docs/plan/evidence/T-M1-01.json) | a card's evidence: start commit, every command with exit code and output tail, changed files, scenario tests. `attempts: 2` — the first verify ran before the code existed (the red step of test-first) and failed; the engine keeps that history |
| [docs/plan/evidence/M0.json](docs/plan/evidence/M0.json) | milestone gates, including the probe result |
| [docs/plan/reports/M1.md](docs/plan/reports/M1.md) | the milestone report, generated from evidence |
| [CLAUDE.md](CLAUDE.md) · [.claude/](.claude/) | what SAF generated: rules, `/saf` commands, roles with models, skills, hooks |
| [saf.config.json](saf.config.json) | the settings the generator used |

## How it was made

```bash
saf init --answers answers.json     # project: api · npm · standard rigor · lanes off (one folder) · English
npm run task:start -- T-M0-01 && npm run task:verify -- T-M0-01
npm run task:verify -- M0           # plan/docs/secrets · probe (two short claude -p calls) · npm test
# the designer wrote docs/specs/todos.md and three cards; the owner said Go (M1 status: active)
npm run task:start -- T-M1-01       # write the tests, verify (fails), write the code, verify (passes), commit
npm run task:start -- T-M1-02       # … same loop
npm run task:start -- T-M1-03
npm run task:verify -- M1 && npm run task:report -- M1
```

The project was built in its own git repository (in a temporary folder — that path shows up in the output of the failing
red-step runs) and then copied here without its `.git` folder, so the commit ids inside
the evidence refer to that history:

```
a7acb59 docs(plan): M1 report; owner accepted M0 and M1
078feff feat(api): T-M1-03 bad input gets a 400 with a reason code (TODO-AC-04)
d195bb0 feat(api): T-M1-02 HTTP API — GET /todos, POST /todos, PATCH /todos/:id/done (TODO-AC-03 · TODO-AC-05)
b0cc889 feat(store): T-M1-01 in-memory todo store — add, list, mark done (TODO-AC-01 · TODO-AC-02)
85908b9 docs(plan): M1 todo API — spec and three cards (owner: Go)
2807f78 chore(plan): M0 exit gates passed (task:verify M0)
4d7662f chore(plan): T-M0-01 passed
21a89bf chore: SAF setup
87fdbda chore: empty todo-api project
```

The manual gates (the owner's acceptance and the spec review) were done by the maintainer and are marked "manual check".

## Run it

```bash
cd examples/todo-api
npm test                            # 7 tests
npm run task:state -- --check       # the plan and the generated status still agree
npm run spec:matrix                 # every scenario ↔ its test
npm start                           # http://localhost:3000/todos
```

The SAF repository's own test suite runs these checks too, so the example cannot silently drift from the engine.
