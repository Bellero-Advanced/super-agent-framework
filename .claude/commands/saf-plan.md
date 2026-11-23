---
description: Plan a milestone — the designer breaks it into cards and specs, shows the owner, then stops and waits for Go
argument-hint: <milestone id or goal>
---

# /saf-plan — plan a milestone

Target: $ARGUMENTS

1. Hand the work to the `designer` agent. Give it: the milestone id (or the goal), `docs/plan/README.md`, the existing
   milestone file if any, and the specs in `docs/specs/` it touches.
2. The designer writes or updates:
   - `docs/plan/milestones/M<n>.md` — goal · scope · risks · exit gates · ordered `cards:` · `status: planned`
   - one card per step in `docs/plan/tasks/M<n>/` (copy `docs/plan/tasks/_template.md`) — size S ≤ 150 / M ≤ 400
     code lines, explicit `touch`, a "Done when" list of commands, `scenarios` from the spec
   - specs with acceptance scenarios in `docs/specs/` when a system is new
3. Run `npm run task:state -- --check` and `npm run docs:check`; fix every issue they report.
4. Show the owner a short summary: goal · card list (id · title · size · role) · open questions with a recommendation.
5. **Stop.** Do not start any card until the owner says Go. Only the owner sets `status: active`.
