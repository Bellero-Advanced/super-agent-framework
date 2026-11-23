# Work status (generated — do not edit by hand)

> Written by `npm run task:state` · `npm run task:start` · `npm run task:verify` from the files in `docs/plan/` · a card becomes "done" only through `npm run task:verify -- <id>` · how it works: [README.md](README.md)

## M2 Roadmap: next — cards done 13/18

- In progress: none
- Next: T-M2-01 Add a document language by adding a template folder and a text table · T-M2-02 Show what /saf-setup would change before regenerating project docs · T-M2-03 Skill packs from other repositories

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M2-01](tasks/M2/T-M2-01.md) | Add a document language by adding a template folder and a text table | · not started | – |
| [T-M2-02](tasks/M2/T-M2-02.md) | Show what /saf-setup would change before regenerating project docs | · not started | – |
| [T-M2-03](tasks/M2/T-M2-03.md) | Skill packs from other repositories | · not started | – |
| [T-M2-04](tasks/M2/T-M2-04.md) | task:verify reports changed code and test lines against the card's size cap | ✓ passed | [T-M2-04.json](evidence/T-M2-04.json) · passed 2026-11-23 18:42 (2 commands) |
| [T-M2-05](tasks/M2/T-M2-05.md) | Evidence viewer: a static HTML page from docs/plan/evidence/ | · not started | – |
| [T-M2-06](tasks/M2/T-M2-06.md) | Choose how often the full test suite runs, per project and per machine (workflow.testMode) | ✓ passed | [T-M2-06.json](evidence/T-M2-06.json) · passed 2026-11-23 19:28 (4 commands) |
| [T-M2-07](tasks/M2/T-M2-07.md) | task:verify runs the card's own tests instead of the full suite when the test mode defers it | ✓ passed | [T-M2-07.json](evidence/T-M2-07.json) · passed 2026-11-23 19:32 (3 commands) · full suite deferred to gate |
| [T-M2-08](tasks/M2/T-M2-08.md) | task:merge skips the deferred full suite and the milestone gate always runs it | ✓ passed | [T-M2-08.json](evidence/T-M2-08.json) · passed 2026-11-23 19:47 (3 commands) · full suite deferred to gate |
| [T-M2-09](tasks/M2/T-M2-09.md) | task:culprit finds the card that broke the deferred full suite | ✓ passed | [T-M2-09.json](evidence/T-M2-09.json) · passed 2026-11-23 20:03 (3 commands) · full suite deferred to gate |
| [T-M2-10](tasks/M2/T-M2-10.md) | /saf-setup asks for the test mode and the docs explain the three modes and task:culprit | ✓ passed | [T-M2-10.json](evidence/T-M2-10.json) · passed 2026-11-23 20:28 (4 commands) · full suite deferred to gate |
| [T-M2-11](tasks/M2/T-M2-11.md) | The lane guard recognises a lane worktree on Windows too (CI matrix green again) | ✓ passed | [T-M2-11.json](evidence/T-M2-11.json) · passed 2026-11-23 19:17 (4 commands) |
| [T-M2-12](tasks/M2/T-M2-12.md) | saf choices --not-asked lists every setting the interview does not ask, and where to change it | ✓ passed | [T-M2-12.json](evidence/T-M2-12.json) · passed 2026-11-23 20:48 (4 commands) · full suite deferred to gate |
| [T-M2-13](tasks/M2/T-M2-13.md) | saf choices --group explains each option (what · good for · cost · pick it when) for groups 1-4, en and th | ✓ passed | [T-M2-13.json](evidence/T-M2-13.json) · passed 2026-11-23 21:00 (5 commands) · full suite deferred to gate |
| [T-M2-14](tasks/M2/T-M2-14.md) | Option explanations for groups 5-8 and the setup-flow questions, with a test that no asked choice lacks one | ✓ passed | [T-M2-14.json](evidence/T-M2-14.json) · passed 2026-11-23 21:18 (5 commands) · full suite deferred to gate |
| [T-M2-15](tasks/M2/T-M2-15.md) | /saf-setup shows the four lines for every option and lists the settings it did not ask before generating | · not started | – |
| [T-M2-16](tasks/M2/T-M2-16.md) | The milestone gate runs every full-suite command no declared gate runs, and the gate id full-suite is reserved | ✓ passed | [T-M2-16.json](evidence/T-M2-16.json) · passed 2026-11-23 20:30 (4 commands) · full suite deferred to gate |
| [T-M2-17](tasks/M2/T-M2-17.md) | STATE.md, the plan mirror and the milestone report show the full-suite gate and its result | ✓ passed | [T-M2-17.json](evidence/T-M2-17.json) · passed 2026-11-23 20:35 (5 commands) · full suite deferred to gate |
| [T-M2-18](tasks/M2/T-M2-18.md) | saf upgrade adds the engine's new package.json scripts (task:culprit) without touching existing ones | ✓ passed | [T-M2-18.json](evidence/T-M2-18.json) · passed 2026-11-23 20:18 (4 commands) · full suite deferred to gate |

### Exit gates of M2 (checked with `npm run task:verify -- M2`)

| Gate | Criterion | Result |
|---|---|---|
| cards | every card of M2 passed task:verify and the spec review | manual check |
| project-checks | the project's own checks pass on Linux, macOS and Windows (CI matrix green) | not checked |
| owner | the owner tried each item in a fresh project and accepts it | manual check |

## Latest evidence

- T-M2-14 Option explanations for groups 5-8 and the setup-flow questions, with a test that no asked choice lacks one — passed 2026-11-23 21:18 (5 commands) · full suite deferred to gate
- T-M2-13 saf choices --group explains each option (what · good for · cost · pick it when) for groups 1-4, en and th — passed 2026-11-23 21:00 (5 commands) · full suite deferred to gate
- T-M2-12 saf choices --not-asked lists every setting the interview does not ask, and where to change it — passed 2026-11-23 20:48 (4 commands) · full suite deferred to gate
- T-M2-17 STATE.md, the plan mirror and the milestone report show the full-suite gate and its result — passed 2026-11-23 20:35 (5 commands) · full suite deferred to gate
- T-M2-16 The milestone gate runs every full-suite command no declared gate runs, and the gate id full-suite is reserved — passed 2026-11-23 20:30 (4 commands) · full suite deferred to gate

## Other milestones

- M0 SAF setup works in this repo — done
- M1 v0.1.0 public release — done
