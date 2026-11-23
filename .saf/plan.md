<!-- Generated from docs/plan/ by npm run task:state — do not edit: change cards in docs/plan/tasks/ or the milestone file, then run the command -->
# Plan: Super Agent Framework — M1 v0.1.0 public release
Status: active
Source: `docs/plan/milestones/M1.md` · full status: `docs/plan/STATE.md` · a card becomes done only through `npm run task:verify -- <id>`

## Goal
Anyone can run `npx create-saf` and get 0.1.0 from npm; the GitHub release, tag and social preview match it; the first
outside feedback is read and sorted into fixes and roadmap items.

## Scope
- T-M1-01 publish both npm packages (owner's `npm login`, then `release-operator` on the owner's order)
- T-M1-02 tag and GitHub release v0.1.0 with the CHANGELOG entry
- T-M1-03 social preview upload (owner, in the GitHub settings — there is no API for it)
- T-M1-04 triage the first trial feedback from friends into issues, CHANGELOG fixes and ROADMAP items

## Done When
- [ ] cards every card of M1 passed task:verify (manual check)
- [ ] project-checks the project's own checks pass on the released commit
- [ ] published both packages on npm, tag and GitHub release v0.1.0 exist, social preview uploaded
- [ ] owner the owner installed 0.1.0 from npm into a fresh folder (npx create-saf) and accepts the release (manual check)

## Task List
- [ ] T-M1-01 Publish super-agent-framework and create-saf 0.1.0 to npm
- [ ] T-M1-02 Tag v0.1.0 and publish the GitHub release
- [ ] T-M1-03 Upload the social preview image
- [ ] T-M1-04 Sort the first trial feedback into fixes and roadmap items

## Side lane (M2)
- [ ] T-M2-04 task:verify reports changed code and test lines against the card's size cap

## Risks
- `create-saf` depends on `super-agent-framework@0.1.0` — publish the main package first or `npx create-saf` fails
- Package names are free on npm today; if one is taken before publishing, stop and ask the owner
