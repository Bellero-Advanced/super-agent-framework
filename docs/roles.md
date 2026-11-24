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

**Tier** picks the model from the preset ([model-presets.md](model-presets.md)). **Lane** is the default lane: it decides
where the role's cards run in parallel mode ([card-lifecycle.md](card-lifecycle.md#parallel-lanes)); a project can move a
role to the other lane, see [Moving a role to the other lane](#moving-a-role-to-the-other-lane).

## Moving a role to the other lane

`roles.lanes` maps a role name to `code` or `main` (default `{}`: every role keeps the lane of the table above):

```json
"roles": { "enabled": ["art-producer"], "lanes": { "art-producer": "code" } }
```

The useful move is into the code lane. Cards of a main-lane role such as `art-producer` (long image generation) work in
the main folder one at a time and block every other main-folder card, although their files are separate. In the code lane
a card started with `task:start <id> --worktree` gets its own git worktree and branch and runs beside other cards. Moving a role into the main lane is allowed too:
its cards then queue in the main folder.

- **Why it is safe.** A code-lane card works in its own worktree on its own branch; `task:verify` there counts files from
  the lane's start commit, so cards cannot mix; `task:merge` brings lanes back one at a time behind the merge checks; cards
  whose `touch` overlaps still wait for each other.
- **What it costs.** One checkout plus the lane install step (`workflow.laneInstall`) per card, disk for large media in
  every worktree, and git cannot merge generated binary files when two branches change the same file (the `touch` check
  prevents that inside the plan, not outside it). Generated media must be committed on the lane branch to reach main
  through `task:merge`; untracked or gitignored output stays in the worktree.
- **Locked roles.** `designer`, `spec-reviewer` and `release-operator` cannot move. The designer edits plan files that the
  main folder reads (cards on a branch stay invisible to `task:state` until merged), the spec-reviewer is read-only and
  runs no cards, and the release-operator acts on live systems and must work from the merged main folder. A custom role
  is not listed in `roles.lanes`: its lane is `roles.custom[].lane`. `saf config --check` and every engine run refuse a
  key that is locked, custom or unknown.
- **What does not change.** The main-folder lane stays one card (`workflow.lanes.main` is 1). With `workflow.worktrees`
  off or `workflow.lanes.code` 0 every card works in the main folder, whatever `roles.lanes` says. A key for a role that
  is not enabled has no effect. A card already in progress keeps its folder; the setting applies to the next start.
  There is no per-machine override.

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
