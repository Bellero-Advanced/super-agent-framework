---
description: Plain-language request → find the matching card and role, run it through the card loop, prove it with real runs, report briefly
argument-hint: <what you want, in plain words>
---

# /saf — route work through the card loop

Request: $ARGUMENTS

## 1. Locate

1. Read the injected status (or `docs/plan/STATE.md`): active milestone, cards in progress, next cards.
2. Match the request to a card in `docs/plan/tasks/`:
   - a card exists → use it
   - no card, but it belongs to the active milestone → `designer` writes the card first (`/saf-plan`), then continue
   - not in any milestone → tell the {{owner}} in one line and ask whether to add it; do not invent work
   - a bug → `/saf-fix` · tests only → `/saf-test` · security → `/saf-protect`
3. Check `depends` of the card — an unmet dependency comes first.

## 2. Run the card

| Step | Who | Command |
|---|---|---|
| start | main session | `{{cmd.taskStart}}`{{#if lanesOn}} (code-lane role → `{{cmd.taskStartLane}}`){{/if}} |
| build | the card's `role` agent | touch only files in `touch` |
| verify | same agent | `{{cmd.taskVerify}}` until it passes |
| review | `spec-reviewer` (read only){{#unless reviewEvery}} — size M cards; S cards at the milestone gate{{/unless}} | give it the card id{{#if tokenSaving.reviewerDiff}} and a diff file{{/if}} |
| real tests | `qa-runner` | when the card touches UI · multiplayer · performance |
| land | main session | commit{{#if lanesOn}} · lane card → `{{cmd.taskMerge}}`{{/if}} |

Independent cards may run in parallel{{#if lanesOn}} — `{{cmd.taskNext}}` lists the safe set{{/if}}.

## 3. Report

Reply in {{chatLanguageName}}, results first: what changed for the user · which card · the verify result with the real
numbers · anything the {{owner}} must decide (once, with options and a recommendation). No stack traces.

Never report "done" without a passing `task:verify` run.
