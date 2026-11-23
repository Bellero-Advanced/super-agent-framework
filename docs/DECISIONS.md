# Decisions

## 0. Precedence (the only precedence rule in this repo)

When two sources disagree, the higher one wins:

1. The latest explicit order from the owner in the conversation
2. This file — rows with status **decided**
3. The topic's home (see [INDEX.md](INDEX.md))

`docs/archive/` is history and never wins. The AI adds new rows as **proposed** or **awaiting owner** — only the
owner turns a row into **decided**. Ids are `D-001`, `D-002`, … and are never reused.

## 1. Decisions

| ID | Date | Decision | Status |
|---|---|---|---|
| D-001 | 2026-11-23 | Work runs through the SAF card system: milestones → cards → `task:verify` evidence → review → commit/merge. The owner says "Go" per milestone. | decided (setup) |
| D-002 | 2026-11-23 | Model preset Balanced: planner/reviewer roles `claude-opus-5-5` · builder roles `claude-sonnet-5-5` · effort fixed per role. | decided (setup) |
| D-003 | 2026-11-23 | Rigor level **standard**: cards S ≤ 150 / M ≤ 400 code lines · merge checks `npm test` · `npm run check-secrets` · `npm run docs:check`. | decided (setup) |
| D-004 | 2026-11-23 | git: push only on owner order · no force-push or history rewrite. Deploy: only on owner order (npm publish (super-agent-framework, create-saf) and GitHub releases). | decided (setup) |
| D-005 | 2026-11-23 | Documents in English · chat in Thai · agents report in English · UI languages en, th. | decided (setup) |
| D-006 | 2026-11-23 | No time estimates — progress is measured by gates, not dates. "Done" needs real run evidence. | decided (setup) |
| D-007 | 2026-11-24 | The engine copies that `test/unit/dogfood.test.mjs` keeps byte-equal to `kit/` (`tools/saf/**` · `.claude/skills/saf-setup/**` · `examples/todo-api/tools/saf/**`) go in `workflow.alwaysAllowed` of `saf.config.json`: cards that change `kit/` need not list them in `touch`, and the size check counts the `kit/` change once instead of three times. Safe because a hand edit of a copy fails `npm test`. No engine change. | proposed |
