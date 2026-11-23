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
| D-007 | 2026-11-24 | The engine copies that `test/unit/dogfood.test.mjs` keeps byte-equal to `kit/` (`tools/saf/**` · `.claude/skills/saf-setup/**` · `examples/todo-api/tools/saf/**`) go in `workflow.alwaysAllowed` of `saf.config.json`: cards that change `kit/` need not list them in `touch`, and the size check counts the `kit/` change once instead of three times. Safe because a hand edit of a copy fails `npm test`. No engine change. | decided (owner order 2026-11-24) |
| D-008 | 2026-11-24 | Test mode — how often the full test suite runs ([spec](specs/test-mode.md), cards T-M2-06 … T-M2-10). New setting `workflow.testMode`: `every-card` (today: full suite at every card verify and again at merge) · `targeted` (each card runs its own changed/scenario tests; the full suite runs once per card, where the card reaches `main`) · `milestone` (each card runs its own tests; merge skips the full suite; the full suite runs once at the milestone exit gate). **Product default `milestone`** — the fastest mode that still gives every card a real test run, marked "full suite deferred to gate" in its evidence; `task:culprit <M>` finds the breaking card by binary search when the gate fails. Per machine: `SAF_TEST_MODE` → untracked `saf.config.local.json` (only keys in `LOCAL_KEYS`) → `saf.config.json` → default. **This repo pins `targeted`** in `saf.config.json` because its cards change the engine that writes the evidence. | decided (owner order 2026-11-24) |
| D-009 | 2026-11-24 | Setup choices ([spec](specs/setup-choices.md), cards T-M2-12 … T-M2-15). Every option `/saf-setup` offers carries "what it is · good for · cost · pick it when" in en and th, and the confirm step lists every setting the interview does not ask with where to change it. The text lives in **one data table in the engine** (`kit/tools-saf/lib/choices.mjs`), printed per group and language by `saf choices` — not in the skill's markdown — so tests can prove that every schema key is asked or listed and every option is explained, and the setup session reads only its group in its language. No new per-machine keys (`LOCAL_KEYS` unchanged). "Setup suggestions" (ROADMAP) stays a separate item. | decided (owner order 2026-11-24) |
| D-010 | 2026-11-24 | `saf upgrade` adds the engine's package.json scripts that are missing (new `ENGINE_SCRIPTS` keys such as `task:culprit`) and never changes, removes or reformats an existing script; it skips projects with `packageManager: "none"` and never creates `package.json` ([spec](specs/upgrade-scripts.md), card T-M2-18). Chosen over making hints and templates fall back to `node tools/saf/bin/saf.mjs …`: one fix covers every future engine command and the docs keep one command style. Recommended default — T-M2-18 follows it unless the owner says otherwise. | decided (owner order 2026-11-24) |
