# Work status (generated — do not edit by hand)

> Written by `npm run task:state` · `npm run task:start` · `npm run task:verify` from the files in `docs/plan/` · a card becomes "done" only through `npm run task:verify -- <id>` · how it works: [README.md](README.md)

## M1 v0.1.0 public release — cards done 3/4

- In progress: none
- Next: T-M1-04 Sort the first trial feedback into fixes and roadmap items

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M1-01](tasks/M1/T-M1-01.md) | Publish super-agent-framework and create-saf 0.1.0 to npm | ✓ passed | [T-M1-01.json](evidence/T-M1-01.json) · passed 2026-11-23 18:52 (2 commands) |
| [T-M1-02](tasks/M1/T-M1-02.md) | Tag v0.1.0 and publish the GitHub release | ✓ passed | [T-M1-02.json](evidence/T-M1-02.json) · passed 2026-11-23 19:09 (2 commands) |
| [T-M1-03](tasks/M1/T-M1-03.md) | Upload the social preview image | ✓ passed | [T-M1-03.json](evidence/T-M1-03.json) · passed 2026-11-23 19:09 (1 commands) |
| [T-M1-04](tasks/M1/T-M1-04.md) | Sort the first trial feedback into fixes and roadmap items | · not started | – |

### Exit gates of M1 (checked with `npm run task:verify -- M1`)

| Gate | Criterion | Result |
|---|---|---|
| cards | every card of M1 passed task:verify | manual check |
| project-checks | the project's own checks pass on the released commit | not checked |
| published | both packages on npm, tag and GitHub release v0.1.0 exist, social preview uploaded | not checked |
| owner | the owner installed 0.1.0 from npm into a fresh folder (npx create-saf) and accepts the release | manual check |

## Side lane M2 Roadmap: next — cards done 1/6

- In progress: none
- Next: T-M2-06 Choose how often the full test suite runs, per project and per machine (workflow.testMode)

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M2-04](tasks/M2/T-M2-04.md) | task:verify reports changed code and test lines against the card's size cap | ✓ passed | [T-M2-04.json](evidence/T-M2-04.json) · passed 2026-11-23 18:42 (2 commands) |
| [T-M2-06](tasks/M2/T-M2-06.md) | Choose how often the full test suite runs, per project and per machine (workflow.testMode) | · not started | – |
| [T-M2-07](tasks/M2/T-M2-07.md) | task:verify runs the card's own tests instead of the full suite when the test mode defers it | · not started | – |
| [T-M2-08](tasks/M2/T-M2-08.md) | task:merge skips the deferred full suite and the milestone gate always runs it | · not started | – |
| [T-M2-09](tasks/M2/T-M2-09.md) | task:culprit finds the card that broke the deferred full suite | · not started | – |
| [T-M2-10](tasks/M2/T-M2-10.md) | /saf-setup asks for the test mode and the docs explain the three modes and task:culprit | · not started | – |

## Latest evidence

- T-M1-02 Tag v0.1.0 and publish the GitHub release — passed 2026-11-23 19:09 (2 commands)
- T-M1-03 Upload the social preview image — passed 2026-11-23 19:09 (1 commands)
- T-M1-01 Publish super-agent-framework and create-saf 0.1.0 to npm — passed 2026-11-23 18:52 (2 commands)
- T-M2-04 task:verify reports changed code and test lines against the card's size cap — passed 2026-11-23 18:42 (2 commands)
- T-M0-01 SAF self-checks pass through the real card loop — passed 2026-11-23 17:34 (3 commands)

## Other milestones

- M0 SAF setup works in this repo — done
- M2 Roadmap: next — planned
