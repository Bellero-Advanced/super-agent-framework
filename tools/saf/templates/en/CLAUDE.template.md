# CLAUDE.md — {{project.name}}

{{#if project.pitch}}
{{project.pitch}}
{{/if}}
{{typeLabel}} · stage: {{project.stage}}{{#if project.domain}} · domain: {{project.domain}}{{/if}}{{#if project.users}} · users: {{project.users}}{{/if}}

This file = unbreakable rules + commands + where to start. Everything else lives in [docs/INDEX.md](docs/INDEX.md) — one home per topic.

## Start every session

1. Current work: the SessionStart hook injects a summary into every session (milestone · card in progress · criteria · files you may touch) · full view `docs/plan/STATE.md` · how cards work `docs/plan/README.md`
2. Find the home of your topic in `docs/INDEX.md` and read only that section — do not read everything
3. Conflicting information → precedence in `docs/DECISIONS.md` §0: latest {{owner}} order → DECISIONS → the topic's home · `docs/archive/` is history, never a source of truth
4. Path-scoped rules in `.claude/rules/` load by themselves when you touch matching files

## Open a session per role

Agents live in `.claude/agents/` (model + effort fixed per role — `{{cmd.docsCheck}}` verifies) · `/saf <anything in plain words>` routes the work (card loop · plan · bug · test · security · help) · skills in `.claude/skills/` load by themselves.

| Work | Roles | Open the main session with |
|---|---|---|
{{#each sessionRows}}
| {{.work}} | {{.roles}} | `claude --model {{.model}}` |
{{/each}}

`--model` beats `ANTHROPIC_MODEL` and the value saved by `/model` · a session without `--model` should start with `{{models.sessionDefault}}` (set it in .claude/settings.local.json, which git does not track) · `.claude/settings.json` is tracked and must never contain `env`.

## Stack

{{#if stack.summary}}
{{stack.summary}}

{{/if}}
| Item | Value |
|---|---|
| package manager | {{stack.packageManager}}{{#if stack.monorepo}} (monorepo){{/if}} |
| database | {{stack.database}} |
| UI languages | {{uiLanguagesText}}{{#if people.i18nRequired}} — every user-facing string goes through i18n{{/if}} |
| models | preset {{presetName}} · planners `{{models.planner}}` · builders `{{models.builder}}` |

## Commands (run at the repo root)

```bash
{{#each readyCommands}}
{{.cmd}}
{{/each}}
{{cmd.taskStart}}            # start a card (records the starting point to compare files)
{{cmd.taskVerify}}           # the only way a card becomes "done" · task:verify <M> = milestone exit gates
{{cmd.taskAbandon}}          # give up an unfinished card
{{#if lanesOn}}
{{cmd.taskStartLane}}        # open a lane in its own worktree (code-lane cards)
{{cmd.taskMerge}}            # merge one lane card back (exit 3 refused · 4 conflict · 5 merge checks failed)
{{cmd.taskNext}}             # read only: cards that can start together
{{cmd.taskEnv}}              # export lines (ports) for servers you start by hand inside a lane
{{/if}}
{{cmd.taskState}}            # rebuild STATE.md + .saf/plan.md (--check = verify only)
{{cmd.taskProbe}}            # prove a fresh session knows the current card from the hook
{{cmd.taskReport}}           # milestone report from evidence
{{cmd.taskCulprit}}          # the exit gate's full suite failed: find the card that broke it (--cmd "<command>" picks the command)
{{cmd.docsCheck}}            # links · commands · paths in agent docs · agents · settings
{{cmd.specMatrix}}           # acceptance scenarios ↔ tests (--check = started cards must have tests)
{{cmd.checkSecrets}}         # no secret values in tracked files
{{#if measureOn}}
{{cmd.measure}}              # heavy commands one at a time on this machine (exit 75 = not measured, run later)
{{/if}}
```

{{#if pendingCommands}}
Not set up yet (add the script, then re-run setup): {{#each pendingCommands}}{{.key}} → {{.cmd}}{{#unless @last}} · {{/unless}}{{/each}}

{{/if}}
{{#if pmNpm}}
npm passes arguments after `--`: `npm run task:verify -- T-M1-01`.

{{/if}}
## Unbreakable rules

- **Secrets:** never commit {{envFilesText}} or any secret value · never print values to the screen or logs · inspect env files by counting key names only
- **git:** commit locally in stages · {{#if pushOwner}}push only when the {{owner}} orders it{{else}}push is allowed{{/if}}{{#if policies.noForcePush}} · never force-push or rewrite history{{/if}}{{#if policies.protectedBranches}} · protected branches: {{policies.protectedBranches}}{{/if}}{{#if policies.autoDeployBranches}} · pushing {{policies.autoDeployBranches}} deploys automatically{{/if}}
- **Deploy:** {{#if deployNone}}this project does not deploy{{else}}{{#if deployOwner}}only when the {{owner}} orders it{{else}}allowed{{/if}}{{#if policies.deploy.target}} · target: {{policies.deploy.target}}{{/if}}{{#if policies.deploy.exceptions}} · exceptions: {{policies.deploy.exceptions}}{{/if}}{{/if}}
- **Cards:** work happens through cards in `docs/plan/` · a card is "done" only when `{{cmd.taskVerify}}` passes · never hand-edit `docs/plan/STATE.md`, `.saf/plan.md` or `docs/plan/evidence/`
- **Evidence:** "done" needs a real run attached — never report done from ticked boxes or guesses
- **No time estimates** — use gates, not dates
{{#if policies.forbiddenPaths}}
- **Never touch:** {{policies.forbiddenPaths}}
{{/if}}
{{#if policies.ownerOnlyPaths}}
- **{{owner}} only (never edit or move):** {{policies.ownerOnlyPaths}}
{{/if}}
{{#if policies.externalServices}}
- **External services you may touch:** {{policies.externalServices}} — nothing else
{{/if}}
{{#if people.i18nRequired}}
- **i18n:** every user-facing string goes through i18n keys ({{uiLanguagesText}})
{{/if}}

## Definition of done

- The card passes `{{cmd.taskVerify}}` — evidence lands in `docs/plan/evidence/`
- Every acceptance scenario the card names has a test with the scenario id in its name, and it passes
{{#if projectChecks}}
- Project checks pass with the run attached: {{#each projectChecks}}`{{this}}`{{#unless @last}} · {{/unless}}{{/each}}
{{/if}}
- `{{cmd.checkSecrets}}` · `{{cmd.docsCheck}}` pass
{{#if reviewEvery}}
- `spec-reviewer` compared the work with the spec (every card){{#if reviewSecurity}} · `security-auditor` reviewed the milestone before its exit gate{{/if}}
{{else}}
- `spec-reviewer` compared size-M cards with the spec; size-S cards are reviewed together at the milestone gate
{{/if}}
- Card size: S ≤ {{sizeS}} · M ≤ {{sizeM}} changed code lines (tests: S ≤ {{testS}} · M ≤ {{testM}}) — bigger → the designer splits the card

## Repo layout

```
docs/        INDEX · DECISIONS · plan/ (milestones · tasks · evidence · STATE) · specs/ · archive/ (history)
.claude/     agents/ · commands/ (/saf · /saf-plan) · rules/ · skills/ · settings.json (hooks, no env)
.saf/        plan.md (generated mirror) · manifest.json
tools/saf/   workflow engine (vendored, no dependencies) · saf.config.json = its settings
```

## Working with the {{owner}}

- Reply in {{chatLanguageName}}, plainly, results first · no stack-trace dumps · translate jargon into plain words
- Follow the milestone plan — never invent task lists · the {{owner}} says "Go" per milestone · inside a milestone do not stop to ask about things that already have a recommended default
- New {{owner}} decisions → a new row in `docs/DECISIONS.md` (the AI never marks a row as decided by itself)
- A question that truly needs the {{owner}}: ask once with options and a recommendation, then continue with the parts that do not wait
{{#if tokenSaving.enabled}}
- Token saving: {{#if tokenSaving.silentInterim}}stay silent on interim agent notifications · {{/if}}{{#if tokenSaving.batchReviewerNotes}}non-blocking reviewer notes are batched to the designer at milestone end · {{/if}}{{#if tokenSaving.reviewerDiff}}give the reviewer a diff file · {{/if}}{{#if tokenSaving.fixFlakyFirst}}fix flaky tests before new work · {{/if}}agents report in {{reportLanguageName}}
{{/if}}
