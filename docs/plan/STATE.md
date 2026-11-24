# Work status (generated — do not edit by hand)

> Written by `npm run task:state` · `npm run task:start` · `npm run task:verify` from the files in `docs/plan/` · a card becomes "done" only through `npm run task:verify -- <id>` · how it works: [README.md](README.md)

## M2 Roadmap: next — cards done 23/25

- In progress: none
- Next: T-M2-26 Setup explanations and docs say what a lane costs, that caps can be set per machine, and why the main lane stays one

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M2-04](tasks/M2/T-M2-04.md) | task:verify reports changed code and test lines against the card's size cap | ✓ passed | [T-M2-04.json](evidence/T-M2-04.json) · passed 2026-11-23 18:42 (2 commands) |
| [T-M2-06](tasks/M2/T-M2-06.md) | Choose how often the full test suite runs, per project and per machine (workflow.testMode) | ✓ passed | [T-M2-06.json](evidence/T-M2-06.json) · passed 2026-11-23 19:28 (4 commands) |
| [T-M2-07](tasks/M2/T-M2-07.md) | task:verify runs the card's own tests instead of the full suite when the test mode defers it | ✓ passed | [T-M2-07.json](evidence/T-M2-07.json) · passed 2026-11-23 19:32 (3 commands) · full suite deferred to gate |
| [T-M2-08](tasks/M2/T-M2-08.md) | task:merge skips the deferred full suite and the milestone gate always runs it | ✓ passed | [T-M2-08.json](evidence/T-M2-08.json) · passed 2026-11-23 19:47 (3 commands) · full suite deferred to gate |
| [T-M2-09](tasks/M2/T-M2-09.md) | task:culprit finds the card that broke the deferred full suite | ✓ passed | [T-M2-09.json](evidence/T-M2-09.json) · passed 2026-11-23 20:03 (3 commands) · full suite deferred to gate |
| [T-M2-10](tasks/M2/T-M2-10.md) | /saf-setup asks for the test mode and the docs explain the three modes and task:culprit | ✓ passed | [T-M2-10.json](evidence/T-M2-10.json) · passed 2026-11-23 20:28 (4 commands) · full suite deferred to gate |
| [T-M2-11](tasks/M2/T-M2-11.md) | The lane guard recognises a lane worktree on Windows too (CI matrix green again) | ✓ passed | [T-M2-11.json](evidence/T-M2-11.json) · passed 2026-11-23 19:17 (4 commands) |
| [T-M2-12](tasks/M2/T-M2-12.md) | saf choices --not-asked lists every setting the interview does not ask, and where to change it | ✓ passed | [T-M2-12.json](evidence/T-M2-12.json) · passed 2026-11-23 20:48 (4 commands) · full suite deferred to gate |
| [T-M2-13](tasks/M2/T-M2-13.md) | saf choices --group explains each option (what · good for · cost · pick it when) for groups 1-4, en and th | ✓ passed | [T-M2-13.json](evidence/T-M2-13.json) · passed 2026-11-23 21:00 (5 commands) · full suite deferred to gate |
| [T-M2-14](tasks/M2/T-M2-14.md) | Option explanations for groups 5-8 and the setup-flow questions, with a test that no asked choice lacks one | ✓ passed | [T-M2-14.json](evidence/T-M2-14.json) · passed 2026-11-23 21:18 (5 commands) · full suite deferred to gate |
| [T-M2-15](tasks/M2/T-M2-15.md) | /saf-setup shows the four lines for every option and lists the settings it did not ask before generating | ✓ passed | [T-M2-15.json](evidence/T-M2-15.json) · passed 2026-11-23 21:32 (4 commands) · full suite deferred to gate |
| [T-M2-16](tasks/M2/T-M2-16.md) | The milestone gate runs every full-suite command no declared gate runs, and the gate id full-suite is reserved | ✓ passed | [T-M2-16.json](evidence/T-M2-16.json) · passed 2026-11-23 20:30 (4 commands) · full suite deferred to gate |
| [T-M2-17](tasks/M2/T-M2-17.md) | STATE.md, the plan mirror and the milestone report show the full-suite gate and its result | ✓ passed | [T-M2-17.json](evidence/T-M2-17.json) · passed 2026-11-23 20:35 (5 commands) · full suite deferred to gate |
| [T-M2-18](tasks/M2/T-M2-18.md) | saf upgrade adds the engine's new package.json scripts (task:culprit) without touching existing ones | ✓ passed | [T-M2-18.json](evidence/T-M2-18.json) · passed 2026-11-23 20:18 (4 commands) · full suite deferred to gate |
| [T-M2-19](tasks/M2/T-M2-19.md) | The release-operator agent says pushing is allowed when policies.push is allowed, and the push explanation says so | ✓ passed | [T-M2-19.json](evidence/T-M2-19.json) · passed 2026-11-23 21:34 (4 commands) · full suite deferred to gate |
| [T-M2-20](tasks/M2/T-M2-20.md) | A setup re-run keeps your edited decision log, index and plan files, and leaves package.json alone unless a script is missing | ✓ passed | [T-M2-20.json](evidence/T-M2-20.json) · passed 2026-11-24 04:40 (5 commands) · full suite deferred to gate |
| [T-M2-05](tasks/M2/T-M2-05.md) | task:report <M> --html writes one self-contained HTML page of the milestone's evidence | ✓ passed | [T-M2-05.json](evidence/T-M2-05.json) · passed 2026-11-24 04:52 (5 commands) · full suite deferred to gate |
| [T-M2-02](tasks/M2/T-M2-02.md) | saf setup --dry-run lists, per file, what a setup run would do — and writes nothing | ✓ passed | [T-M2-02.json](evidence/T-M2-02.json) · passed 2026-11-24 05:05 (5 commands) · full suite deferred to gate |
| [T-M2-21](tasks/M2/T-M2-21.md) | saf setup --dry-run --diff shows each change as a diff, and --keep keeps an edited file instead of replacing it | ✓ passed | [T-M2-21.json](evidence/T-M2-21.json) · passed 2026-11-24 05:09 (5 commands) · full suite deferred to gate |
| [T-M2-22](tasks/M2/T-M2-22.md) | /saf-setup on a re-run shows what would change and asks per edited file: take the new version, keep mine, or show the diff | ✓ passed | [T-M2-22.json](evidence/T-M2-22.json) · passed 2026-11-24 05:17 (5 commands) · full suite deferred to gate |
| [T-M2-01](tasks/M2/T-M2-01.md) | A document language is added with one text-table entry and a template folder; missing templates fall back to English with a warning | ✓ passed | [T-M2-01.json](evidence/T-M2-01.json) · passed 2026-11-24 05:27 (5 commands) · full suite deferred to gate |
| [T-M2-27](tasks/M2/T-M2-27.md) | Setup archives an unreadable .claude/settings.local.json (git-ignored) instead of silently overwriting it | ✓ passed | [T-M2-27.json](evidence/T-M2-27.json) · passed 2026-11-24 05:51 (5 commands) · full suite deferred to gate |
| [T-M2-25](tasks/M2/T-M2-25.md) | Lane caps go up to a high ceiling and each machine can set its own in saf.config.local.json | ✓ passed | [T-M2-25.json](evidence/T-M2-25.json) · passed 2026-11-24 05:53 (6 commands) · full suite deferred to gate |
| [T-M2-26](tasks/M2/T-M2-26.md) | Setup explanations and docs say what a lane costs, that caps can be set per machine, and why the main lane stays one | · not started | – |
| [T-M2-28](tasks/M2/T-M2-28.md) | Setup explanations say what the code really does: the UI rule with i18n, model ids with any preset, strict's security review, rigor values with units | · not started | – |

### Exit gates of M2 (checked with `npm run task:verify -- M2`)

| Gate | Criterion | Result |
|---|---|---|
| cards | every card of M2 passed task:verify and the spec review | manual check |
| project-checks | the project's own checks pass on Linux, macOS and Windows (CI matrix green) | not checked |
| owner | the owner tried each item in a fresh project and accepts it | manual check |

## Latest evidence

- T-M2-25 Lane caps go up to a high ceiling and each machine can set its own in saf.config.local.json — passed 2026-11-24 05:53 (6 commands) · full suite deferred to gate
- T-M2-27 Setup archives an unreadable .claude/settings.local.json (git-ignored) instead of silently overwriting it — passed 2026-11-24 05:51 (5 commands) · full suite deferred to gate
- T-M2-01 A document language is added with one text-table entry and a template folder; missing templates fall back to English with a warning — passed 2026-11-24 05:27 (5 commands) · full suite deferred to gate
- T-M2-22 /saf-setup on a re-run shows what would change and asks per edited file: take the new version, keep mine, or show the diff — passed 2026-11-24 05:17 (5 commands) · full suite deferred to gate
- T-M2-21 saf setup --dry-run --diff shows each change as a diff, and --keep keeps an edited file instead of replacing it — passed 2026-11-24 05:09 (5 commands) · full suite deferred to gate

## Other milestones

- M0 SAF setup works in this repo — done
- M1 v0.1.0 public release — done
- M3 SAF builds itself — planned
