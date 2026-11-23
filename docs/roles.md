# Roles

Each enabled role becomes `.claude/agents/<role>.md` with a full model id, an effort level and (for restricted roles) a
tool list. `docs:check` fails when an agent's model differs from `saf.config.json`.

| Role | Tier | Lane | Effort | Tools | Does |
|---|---|---|---|---|---|
| `designer` (core) | planner | main | high | Read · Grep · Glob · Write · Edit · Bash | milestones, cards, specs; never product code |
| `spec-reviewer` (core) | planner | main | high | Read · Grep · Glob (read only) | compares a passed card with its spec; pass/fail + every mismatch |
| `implementer` (core) | builder | code | high | all | one card: tests first, code inside `touch`, `task:verify` until it passes |
| `qa-runner` (core) | builder | code | medium | Read · Grep · Glob · Bash | real runs and real numbers; never fixes code to pass |
| `art-producer` | builder | main | medium | Read · Grep · Glob · Write · Edit · Bash | briefs → generation → post-processing → asset log |
| `db-guardian` | builder | code | high | all | migrations, access rules, data fixes rehearsed on test databases |
| `release-operator` | builder | main | medium | Read · Grep · Glob · Write · Edit · Bash | the only role that touches live systems, on explicit owner order |
| `security-auditor` | planner | main | high | Read · Grep · Glob · Bash | audits by severity; fixes go through cards |
| `data-engineer` | builder | code | high | all | pipelines, evaluations, model integrations with measured results |
| `content-writer` | builder | main | medium | Read · Grep · Glob · Write · Edit | user-facing copy and translations through i18n |

**Tier** picks the model from the preset ([model-presets.md](model-presets.md)). **Lane** decides where the role's cards
run in parallel mode ([card-lifecycle.md](card-lifecycle.md#parallel-lanes)).

## Custom roles

```json
"roles": {
  "enabled": ["db-guardian"],
  "custom": [{ "name": "level-designer", "description": "Designs levels: layout, pacing and encounters.", "tier": "planner", "lane": "main", "effort": "high", "focus": "playable greybox first" }]
}
```

`name` is lower-case with dashes. `tools` (comma list) restricts tools; `readOnly: true` makes `docs:check` enforce
Read/Grep/Glob only. Per-role model or effort: `models.overrides: { "qa-runner": { "effort": "low" } }`.

## Reports

Agents report in `roles.reportLanguage` (English by default — fewer tokens); the main session talks to you in your chat
language.
