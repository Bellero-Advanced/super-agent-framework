# Decisions

## 0. Precedence (the only precedence rule in this repo)

When two sources disagree, the higher one wins:

1. The latest explicit order from the {{owner}} in the conversation
2. This file — rows with status **decided**
3. The topic's home (see [INDEX.md](INDEX.md))

`docs/archive/` is history and never wins. The AI adds new rows as **proposed** or **awaiting {{owner}}** — only the
{{owner}} turns a row into **decided**. Ids are `D-001`, `D-002`, … and are never reused.

## 1. Decisions

| ID | Date | Decision | Status |
|---|---|---|---|
| D-001 | {{today}} | Work runs through the SAF card system: milestones → cards → `task:verify` evidence → review → commit/merge. The {{owner}} says "Go" per milestone. | decided (setup) |
| D-002 | {{today}} | Model preset {{presetName}}: planner/reviewer roles `{{models.planner}}` · builder roles `{{models.builder}}` · effort fixed per role. | decided (setup) |
| D-003 | {{today}} | Rigor level **{{project.rigor}}**: cards M ≤ {{sizeM}} / L ≤ {{sizeL}} code lines · merge checks {{mergeChecksText}}. | decided (setup) |
| D-004 | {{today}} | git: {{#if pushOwner}}push only on {{owner}} order{{else}}push allowed{{/if}}{{#if policies.noForcePush}} · no force-push or history rewrite{{/if}}. Deploy: {{#if deployNone}}none{{else}}{{#if deployOwner}}only on {{owner}} order{{else}}allowed{{/if}}{{#if policies.deploy.target}} ({{policies.deploy.target}}){{/if}}{{/if}}. | decided (setup) |
| D-005 | {{today}} | Documents in {{docLanguageName}} · chat in {{chatLanguageName}} · agents report in {{reportLanguageName}} · UI languages {{uiLanguagesText}}. | decided (setup) |
| D-006 | {{today}} | No time estimates — progress is measured by gates, not dates. "Done" needs real run evidence. | decided (setup) |
