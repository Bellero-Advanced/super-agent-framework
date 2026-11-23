# Index — one home per topic

Each topic has exactly one home. Other files link to it instead of copying it. When information conflicts, follow
[DECISIONS.md](DECISIONS.md) §0. Add a row here whenever a new topic gets a home.

## 1. Start here

| Topic | Home |
|---|---|
| Unbreakable rules · commands | [CLAUDE.md](../CLAUDE.md) |
| Current work and status (generated) | [plan/STATE.md](plan/STATE.md) |
| How cards, milestones, lanes and evidence work | [plan/README.md](plan/README.md) |
| Decisions and precedence | [DECISIONS.md](DECISIONS.md) |

## 2. Product

| Topic | Home |
|---|---|
| What we build and for whom | [CLAUDE.md](../CLAUDE.md) (pitch) — move to its own doc when it grows |
| System specs with acceptance scenarios | `docs/specs/` (template [specs/_template.md](specs/_template.md)) |

## 3. How the AI team works

| Topic | Home |
|---|---|
| Roles, models and effort | `.claude/agents/` |
| Slash commands: `/saf` (one entry point — also answers "help") · `/saf-plan` · `/saf-setup` | `.claude/commands/` |
| Path-scoped rules | `.claude/rules/` |
| Skills — load by themselves when the work matches: `debug-protocol` · `tdd` · `code-review` · `security-review` · `writing-for-agents` · `handoff` · `evidence-before-done` · `test-runner` | `.claude/skills/` |
| SAF settings (schema-validated) | [saf.config.json](../saf.config.json) · schema `tools/saf/schema/saf.config.schema.json` |
| Card template | [plan/tasks/_template.md](plan/tasks/_template.md) |

## 4. Code is the truth

Numbers, data tables and behaviour live in code. Documents point to the code; they never hold a second copy.

## 5. History

`docs/archive/` is history only — never a source of truth. Files SAF replaced during setup are kept there.
