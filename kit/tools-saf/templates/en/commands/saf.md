---
description: Say what you want in plain words — SAF routes it (build through the card loop · plan · bug · test · security · question · how to use SAF), proves it with real runs and reports briefly
argument-hint: <what you want, in plain words — or "help">
---

# /saf — one entry point

Request: $ARGUMENTS

## 1. Route

Read the injected status (or `docs/plan/STATE.md`) first, then pick **one** route:

| The request is… | Route |
|---|---|
| empty, "help", "how do I use this", "what can you do" | **Help** (section 4) — answer it yourself, change nothing |
| a question about this project ("where is…", "why does…", "what's the status") | answer from `docs/INDEX.md` → the topic's home and the code · change nothing |
| plan a milestone, or new work that is in no milestone yet | `/saf-plan` — never invent work: ask the {{owner}} once whether to add it |
| a bug, error, crash, flaky test | the `debug-protocol` skill — root cause with evidence before any edit |
| "run the tests", "is it working", numbers | the `test-runner` skill (hand it to `qa-runner`) |
| security, secrets, "is this safe" | the `security-review` skill{{#if hasRole.security_auditor}} (hand it to `security-auditor`){{/if}} |
| build or change something | the card loop (section 2) |

Unclear between two routes → ask one short question with a recommendation.

## 2. Card loop (build or change)

1. Match the request to a card in `docs/plan/tasks/` of the active milestone. No card yet but it belongs to the active
   milestone → `designer` writes the card first, then continue. Unmet `depends` come first.
2. Run it:

| Step | Who | Command |
|---|---|---|
| start | main session | `{{cmd.taskStart}}`{{#if lanesOn}} (code-lane role → `{{cmd.taskStartLane}}`){{/if}} |
| build | the card's `role` agent | touch only files in `touch` |
| verify | same agent | `{{cmd.taskVerify}}` until it passes |
| review | `spec-reviewer` (read only){{#unless reviewEvery}} — size M cards; S cards at the milestone gate{{/unless}} | the card id{{#if tokenSaving.reviewerDiff}} and a diff file{{/if}} |
| real tests | `qa-runner` | when the card touches UI · multiplayer · performance |
| land | main session | commit{{#if lanesOn}} · lane card → `{{cmd.taskMerge}}`{{/if}} |

Independent cards may run in parallel{{#if lanesOn}} — `{{cmd.taskNext}}` lists the safe set{{/if}}.

## 3. Report

Reply in {{chatLanguageName}}, results first: what changed for the user · which card · the verify result with real
numbers · anything the {{owner}} must decide (once, with options and a recommendation). No stack traces.
Never say "done" without real run output (the `evidence-before-done` skill).

## 4. Help (answer this yourself)

Show the {{owner}}, in {{chatLanguageName}}:

- **Commands:** `/saf <anything>` (this) · `/saf-plan <M or goal>` (designer writes cards and specs, then waits for Go) ·
  `/saf-setup` (change settings — re-runs the interview)
- **Skills load by themselves** when the work matches: {{skillNamesText}}
- **Roles:**

| Role | Model | Effort | Does |
|---|---|---|---|
{{#each roles}}
| `{{.name}}` | `{{.model}}` | {{.effort}} | {{.summary}} |
{{/each}}

- **Open a session per role:**
{{#each sessionRows}}
  - {{.work}} ({{.roles}}): `claude --model {{.model}}`
{{/each}}
- **Card commands:** `{{cmd.taskStart}}` → work → `{{cmd.taskVerify}}` → review → commit · status `docs/plan/STATE.md` ·
  how it works `docs/plan/README.md`
- **Try:** `/saf what is the next card?` · `/saf the login page crashes on submit` · `/saf run the tests`
