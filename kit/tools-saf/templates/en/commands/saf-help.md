---
description: All /saf commands, the agent roles, and how to open a session per role
---

# /saf-help

Show the {{owner}} this, in {{chatLanguageName}}:

## Commands

| Command | Short | What it does |
|---|---|---|
| `/saf <request>` | — | plain request → card → role → verify → short report |
| `/saf-plan <M or goal>` | `/saf-p` | designer writes the milestone, cards and specs, then waits for Go |
| `/saf-fix <problem>` | `/saf-f` | root cause with evidence, then a fix with a proving test |
| `/saf-test [scope]` | `/saf-t` | real test runs with real numbers |
| `/saf-protect [scope]` | `/saf-pt` · `/saf-audit` | security review by severity |
| `/saf-help` | `/saf-h` | this page |

## Roles

| Role | Model | Effort | Does |
|---|---|---|---|
{{#each roles}}
| `{{.name}}` | `{{.model}}` | {{.effort}} | {{.summary}} |
{{/each}}

## Open a session per role

{{#each sessionRows}}
- {{.work}} ({{.roles}}): `claude --model {{.model}}`
{{/each}}

## Card commands

`{{cmd.taskStart}}` → work → `{{cmd.taskVerify}}` → review → commit · status: `docs/plan/STATE.md` · how it works: `docs/plan/README.md`
