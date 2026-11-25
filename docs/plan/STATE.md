# Work status (generated — do not edit by hand)

> Written by `npm run task:state` · `npm run task:start` · `npm run task:verify` from the files in `docs/plan/` · a card becomes "done" only through `npm run task:verify -- <id>` · how it works: [README.md](README.md)

## M3 SAF builds itself — cards done 36/36

- In progress: none
- Next: none — all cards done, check the exit gates with npm run task:verify -- M3

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M3-01](tasks/M3/T-M3-01.md) | Agents log where the workflow got in the way in docs/plan/friction.md, and every session starts with the open count | ✓ passed | [T-M3-01.json](evidence/T-M3-01.json) · passed 2026-11-24 07:36 (8 commands) · full suite deferred to gate |
| [T-M3-02](tasks/M3/T-M3-02.md) | The main session records every spec review with task:review, a failed review reopens the card, and the report shows rounds | ✓ passed | [T-M3-02.json](evidence/T-M3-02.json) · passed 2026-11-24 08:09 (6 commands) · full suite deferred to gate |
| [T-M3-27](tasks/M3/T-M3-27.md) | npm run saf:refresh refreshes this repository and the example in one step and puts back the example files the card does not own; --check reports stale copies in a second | ✓ passed | [T-M3-27.json](evidence/T-M3-27.json) · passed 2026-11-24 08:55 (5 commands) · full suite deferred to gate |
| [T-M3-28](tasks/M3/T-M3-28.md) | A project can move a role to the other lane with roles.lanes, so image or copy cards can run in a worktree beside other cards; setup explains it in English and Thai | ✓ passed | [T-M3-28.json](evidence/T-M3-28.json) · passed 2026-11-24 09:05 (5 commands) · full suite deferred to gate |
| [T-M3-29](tasks/M3/T-M3-29.md) | The implementer and spec-reviewer agents carry the checks every prompt used to repeat: failing-first tests, evidence size, sentence-to-code lists, Windows-safe tests, and per-type review checklists | ✓ passed | [T-M3-29.json](evidence/T-M3-29.json) · passed 2026-11-24 09:12 (5 commands) · full suite deferred to gate |
| [T-M3-30](tasks/M3/T-M3-30.md) | The designer runs every new Done-when command against the current code before handing a card over, and task:prerun <id> shows which commands already pass | ✓ passed | [T-M3-30.json](evidence/T-M3-30.json) · passed 2026-11-24 09:26 (6 commands) · full suite deferred to gate |
| [T-M3-31](tasks/M3/T-M3-31.md) | task:diff <id> writes the reviewer's diff file with exactly the card's files, and the /saf review step hands the reviewer the card id, review types and that path | ✓ passed | [T-M3-31.json](evidence/T-M3-31.json) · passed 2026-11-24 09:35 (7 commands) · full suite deferred to gate |
| [T-M3-32](tasks/M3/T-M3-32.md) | spec:matrix --check counts a started card only in the folder where it is built, so two parallel lane cards with scenarios no longer block each other | ✓ passed | [T-M3-32.json](evidence/T-M3-32.json) · passed 2026-11-24 09:57 (8 commands) · full suite deferred to gate |
| [T-M3-33](tasks/M3/T-M3-33.md) | This repository's /saf commands and CLAUDE.md commands block stay equal to the templates (a test fails when they drift), and saf:refresh keeps the example's commands, skills, agents and CLAUDE.md current | ✓ passed | [T-M3-33.json](evidence/T-M3-33.json) · passed 2026-11-24 10:03 (9 commands) · full suite deferred to gate |
| [T-M3-34](tasks/M3/T-M3-34.md) | task:merge accepts a lane card that adds an always-allowed glob: the post-verify check uses the main folder's list and the branch's | ✓ passed | [T-M3-34.json](evidence/T-M3-34.json) · passed 2026-11-24 16:19 (8 commands) · full suite deferred to gate |
| [T-M3-16](tasks/M3/T-M3-16.md) | Setup leaves same files byte-identical, never forgets a kept file, stops on a broken manifest, and never replaces a scripts value it cannot read | ✓ passed | [T-M3-16.json](evidence/T-M3-16.json) · passed 2026-11-24 16:26 (5 commands) · full suite deferred to gate |
| [T-M3-17](tasks/M3/T-M3-17.md) | Setup reads the plan without copying it to a temp folder, and an edited task template gets format updates | ✓ passed | [T-M3-17.json](evidence/T-M3-17.json) · passed 2026-11-24 16:50 (5 commands) · full suite deferred to gate |
| [T-M3-18](tasks/M3/T-M3-18.md) | task:culprit cleans up when interrupted, streams its runs, refuses a bad plan or id, and settles ties the spec names | ✓ passed | [T-M3-18.json](evidence/T-M3-18.json) · passed 2026-11-24 16:39 (5 commands) · full suite deferred to gate |
| [T-M3-19](tasks/M3/T-M3-19.md) | STATE.md, the plan mirror, the report and the HTML page give every exit gate the same result word, and broken evidence never crashes them | ✓ passed | [T-M3-19.json](evidence/T-M3-19.json) · passed 2026-11-24 16:55 (5 commands) · full suite deferred to gate |
| [T-M3-20](tasks/M3/T-M3-20.md) | saf choices and config --check refuse arguments they do not know, and a verify fallback names its real cause | ✓ passed | [T-M3-20.json](evidence/T-M3-20.json) · passed 2026-11-24 16:44 (5 commands) · full suite deferred to gate |
| [T-M3-21](tasks/M3/T-M3-21.md) | Setup messages say what happened: "not a JSON object" for a valid non-object file, the archive path in every settings warning and dry-run line, and a minified package.json stays minified | ✓ passed | [T-M3-21.json](evidence/T-M3-21.json) · passed 2026-11-24 16:55 (5 commands) · full suite deferred to gate |
| [T-M3-22](tasks/M3/T-M3-22.md) | The release-operator agent and CLAUDE.md agree with the deploy and push policies: no owner order asked when deploy is allowed, auto-deploy branches named as the exception | ✓ passed | [T-M3-22.json](evidence/T-M3-22.json) · passed 2026-11-24 16:28 (5 commands) · full suite deferred to gate |
| [T-M3-23](tasks/M3/T-M3-23.md) | The setup skill and the user docs say exactly what the code does: keep paths with spaces, the chat-language question, lanes without the local file, upgrade's plan promise, the language list | ✓ passed | [T-M3-23.json](evidence/T-M3-23.json) · passed 2026-11-24 16:39 (5 commands) · full suite deferred to gate |
| [T-M3-24](tasks/M3/T-M3-24.md) | Tests pin the setup and upgrade behaviour the M2 reviews found untested (BOM, settings roots, real updates, diff properties, keep with adopt) | ✓ passed | [T-M3-24.json](evidence/T-M3-24.json) · passed 2026-11-24 17:06 (5 commands) · full suite deferred to gate |
| [T-M3-25](tasks/M3/T-M3-25.md) | Tests pin the setup-choices, gate-coverage and lane-cap behaviour the M2 reviews found weakly tested | ✓ passed | [T-M3-25.json](evidence/T-M3-25.json) · passed 2026-11-24 17:02 (5 commands) · full suite deferred to gate |
| [T-M3-03](tasks/M3/T-M3-03.md) | models.effort: by-size gives a role a second agent file at a lower effort for small cards, checked by docs:check | ✓ passed | [T-M3-03.json](evidence/T-M3-03.json) · passed 2026-11-24 17:23 (8 commands) · full suite deferred to gate |
| [T-M3-04](tasks/M3/T-M3-04.md) | task:start names the agent and effort for each card, the evidence keeps them, and the report compares review rounds by size and effort | ✓ passed | [T-M3-04.json](evidence/T-M3-04.json) · passed 2026-11-24 17:32 (5 commands) · full suite deferred to gate |
| [T-M3-05](tasks/M3/T-M3-05.md) | /saf-setup asks fixed or by-size effort and explains the trade-off in English and Thai, true to the code | ✓ passed | [T-M3-05.json](evidence/T-M3-05.json) · passed 2026-11-24 17:38 (5 commands) · full suite deferred to gate |
| [T-M3-06](tasks/M3/T-M3-06.md) | SAF's own repository builds S cards with a medium-effort implementer and writes plans with a medium-effort designer | ✓ passed | [T-M3-06.json](evidence/T-M3-06.json) · passed 2026-11-24 17:45 (4 commands) · full suite deferred to gate |
| [T-M3-07](tasks/M3/T-M3-07.md) | At milestone end task:report lists open friction with a brief for the designer, and task:friction draft prints card drafts for recurring friction | ✓ passed | [T-M3-07.json](evidence/T-M3-07.json) · passed 2026-11-24 17:46 (6 commands) · full suite deferred to gate |
| [T-M3-08](tasks/M3/T-M3-08.md) | With workflow.selfFix on, a small proven framework bug becomes a self-fix card in the active milestone without waiting, inside a cap the engine enforces | ✓ passed | [T-M3-08.json](evidence/T-M3-08.json) · passed 2026-11-24 18:07 (7 commands) · full suite deferred to gate |
| [T-M3-35](tasks/M3/T-M3-35.md) | Card sizes are M and L: task:verify warns above the cap and fails above twice it, old S cards count as M, and every generated file shows the new caps | ✓ passed | [T-M3-35.json](evidence/T-M3-35.json) · passed 2026-11-24 18:52 (10 commands) · full suite deferred to gate |
| [T-M3-36](tasks/M3/T-M3-36.md) | Setup explanations and the user docs describe sizes M and L, the hard stop and legacy S cards, in English and Thai, true to the code | ✓ passed | [T-M3-36.json](evidence/T-M3-36.json) · passed 2026-11-24 19:08 (8 commands) · full suite deferred to gate |
| [T-M3-37](tasks/M3/T-M3-37.md) | An L card lists its steps: the plan check demands them, task:diff splits the review diff by step commit, and the agents build and review step by step | ✓ passed | [T-M3-37.json](evidence/T-M3-37.json) · passed 2026-11-24 19:25 (9 commands) · full suite deferred to gate |
| [T-M3-09](tasks/M3/T-M3-09.md) | task:release <M> shows every release guard and the next version without changing anything, and stops when the kill switch is off | ✓ passed | [T-M3-09.json](evidence/T-M3-09.json) · passed 2026-11-24 19:54 (6 commands) · full suite deferred to gate |
| [T-M3-10](tasks/M3/T-M3-10.md) | task:release --prepare commits and pushes the version bump with the CHANGELOG and release log, and --tag pushes the tag only after every CI job is green on that commit | ✓ passed | [T-M3-10.json](evidence/T-M3-10.json) · passed 2026-11-24 20:52 (6 commands) · full suite deferred to gate |
| [T-M3-11](tasks/M3/T-M3-11.md) | A v* tag publishes both npm packages through trusted publishing and creates the GitHub release, after release-check confirms every guard again | ✓ passed | [T-M3-11.json](evidence/T-M3-11.json) · passed 2026-11-24 20:30 (7 commands) · full suite deferred to gate |
| [T-M3-12](tasks/M3/T-M3-12.md) | CHANGELOG Unreleased lists every user-visible change since 0.1.0, so the first automatic release computes 0.2.0 | ✓ passed | [T-M3-12.json](evidence/T-M3-12.json) · passed 2026-11-24 21:03 (3 commands) |
| [T-M3-13](tasks/M3/T-M3-13.md) | A documented skill-pack format, and saf pack show <path> lists everything a pack would install before anyone trusts it | ✓ passed | [T-M3-13.json](evidence/T-M3-13.json) · passed 2026-11-24 21:22 (6 commands) · full suite deferred to gate |
| [T-M3-38](tasks/M3/T-M3-38.md) | task:culprit still reports an interrupt (exit 130 / 143) when Ctrl-C arrives during the blocking install step on Node 20 | ✓ passed | [T-M3-38.json](evidence/T-M3-38.json) · passed 2026-11-25 16:55 (6 commands) · full suite deferred to gate |
| [T-M3-39](tasks/M3/T-M3-39.md) | The COPIES-AC-10 and -11 test fixture no longer depends on how cpSync filters paths, so it passes on Windows with Node 20 | ✓ passed | [T-M3-39.json](evidence/T-M3-39.json) · passed 2026-11-25 17:05 (4 commands) |

### Exit gates of M3 (checked with `npm run task:verify -- M3`)

| Gate | Criterion | Result |
|---|---|---|
| cards | every card of M3 passed task:verify and the spec review (a pass round recorded with task:review from T-M3-02 on) | manual check |
| matrix | every acceptance scenario of the M3 specs has a passing test | ✓ passed 2026-11-25 17:09 |
| release-workflow | the release workflow publishes only through npm trusted publishing on a v* tag, after the guards step | ✓ passed 2026-11-25 17:09 |
| project-checks | the project's own checks pass on Linux, macOS and Windows (CI matrix green) | ✓ passed 2026-11-25 17:09 |
| owner-setup | the owner finished the one-time trusted-publishing setup listed under 'Owner setup' below (npmjs.com for both packages, GitHub environment npm, tag ruleset, gh login on the releasing machine) | manual check |
| owner | the owner tried the friction log, review rounds, effort by size, a self-fix card and a release dry run (task:release M3) in this repository and accepts them | manual check |

## Latest evidence

- T-M3-39 The COPIES-AC-10 and -11 test fixture no longer depends on how cpSync filters paths, so it passes on Windows with Node 20 — passed 2026-11-25 17:05 (4 commands)
- T-M3-38 task:culprit still reports an interrupt (exit 130 / 143) when Ctrl-C arrives during the blocking install step on Node 20 — passed 2026-11-25 16:55 (6 commands) · full suite deferred to gate
- T-M3-13 A documented skill-pack format, and saf pack show <path> lists everything a pack would install before anyone trusts it — passed 2026-11-24 21:22 (6 commands) · full suite deferred to gate
- T-M3-12 CHANGELOG Unreleased lists every user-visible change since 0.1.0, so the first automatic release computes 0.2.0 — passed 2026-11-24 21:03 (3 commands)
- T-M3-10 task:release --prepare commits and pushes the version bump with the CHANGELOG and release log, and --tag pushes the tag only after every CI job is green on that commit — passed 2026-11-24 20:52 (6 commands) · full suite deferred to gate

## Other milestones

- M0 SAF setup works in this repo — done
- M1 v0.1.0 public release — done
- M2 Roadmap: next — done
- M4 Skill packs and reinstall — planned
