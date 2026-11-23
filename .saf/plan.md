<!-- Generated from docs/plan/ by npm run task:state — do not edit: change cards in docs/plan/tasks/ or the milestone file, then run the command -->
# Plan: Super Agent Framework — M0 SAF setup works in this repo
Status: active
Source: `docs/plan/milestones/M0.md` · full status: `docs/plan/STATE.md` · a card becomes done only through `npm run task:verify -- <id>`

## Goal
Prove the SAF workflow runs here before real work starts: the plan parses, the docs are true, no secrets are tracked,
and a new session sees the current card.

## Scope
- One card (T-M0-01) that runs the SAF self-checks through the real card loop
- No product code changes

## Done When
- [ ] plan-docs plan, docs and secret checks pass
- [ ] probe a fresh Claude session knows the current card from the SessionStart hook (uses two short model calls)
- [ ] project-checks the project's own checks pass
- [ ] owner the owner has read CLAUDE.md and docs/plan/README.md and agrees with the setup (manual check)

## Task List
- [ ] T-M0-01 SAF self-checks pass through the real card loop

## Side lane (M2)
- [ ] T-M2-04 task:verify reports changed code and test lines against the card's size cap

## Risks
- A project check that was already failing before setup — fix it in its own card, do not weaken the gate
