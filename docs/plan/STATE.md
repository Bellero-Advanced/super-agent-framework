# Work status (generated — do not edit by hand)

> Written by `npm run task:state` · `npm run task:start` · `npm run task:verify` from the files in `docs/plan/` · a card becomes "done" only through `npm run task:verify -- <id>` · how it works: [README.md](README.md)

## M3 SAF builds itself — cards done 1/26

- In progress: none
- Next: T-M3-02 The main session records every spec review with task:review, a failed review reopens the card, and the report shows rounds

| Card | Work | Status | Evidence |
|---|---|---|---|
| [T-M3-01](tasks/M3/T-M3-01.md) | Agents log where the workflow got in the way in docs/plan/friction.md, and every session starts with the open count | ✓ passed | [T-M3-01.json](evidence/T-M3-01.json) · passed 2026-11-24 07:36 (8 commands) · full suite deferred to gate |
| [T-M3-02](tasks/M3/T-M3-02.md) | The main session records every spec review with task:review, a failed review reopens the card, and the report shows rounds | · not started | – |
| [T-M3-16](tasks/M3/T-M3-16.md) | Setup leaves same files byte-identical, never forgets a kept file, stops on a broken manifest, and never replaces a scripts value it cannot read | · not started | – |
| [T-M3-17](tasks/M3/T-M3-17.md) | Setup reads the plan without copying it to a temp folder, and an edited task template gets format updates | · not started | – |
| [T-M3-18](tasks/M3/T-M3-18.md) | task:culprit cleans up when interrupted, streams its runs, refuses a bad plan or id, and settles ties the spec names | · not started | – |
| [T-M3-19](tasks/M3/T-M3-19.md) | STATE.md, the plan mirror, the report and the HTML page give every exit gate the same result word, and broken evidence never crashes them | · not started | – |
| [T-M3-20](tasks/M3/T-M3-20.md) | saf choices and config --check refuse arguments they do not know, and a verify fallback names its real cause | · not started | – |
| [T-M3-21](tasks/M3/T-M3-21.md) | Setup messages say what happened: "not a JSON object" for a valid non-object file, the archive path in every settings warning and dry-run line, and a minified package.json stays minified | · not started | – |
| [T-M3-22](tasks/M3/T-M3-22.md) | The release-operator agent and CLAUDE.md agree with the deploy and push policies: no owner order asked when deploy is allowed, auto-deploy branches named as the exception | · not started | – |
| [T-M3-23](tasks/M3/T-M3-23.md) | The setup skill and the user docs say exactly what the code does: keep paths with spaces, the chat-language question, lanes without the local file, upgrade's plan promise, the language list | · not started | – |
| [T-M3-24](tasks/M3/T-M3-24.md) | Tests pin the setup and upgrade behaviour the M2 reviews found untested (BOM, settings roots, real updates, diff properties, keep with adopt) | · not started | – |
| [T-M3-25](tasks/M3/T-M3-25.md) | Tests pin the setup-choices, gate-coverage and lane-cap behaviour the M2 reviews found weakly tested | · not started | – |
| [T-M3-03](tasks/M3/T-M3-03.md) | models.effort: by-size gives a role a second agent file at a lower effort for small cards, checked by docs:check | · not started | – |
| [T-M3-04](tasks/M3/T-M3-04.md) | task:start names the agent and effort for each card, the evidence keeps them, and the report compares review rounds by size and effort | · not started | – |
| [T-M3-05](tasks/M3/T-M3-05.md) | /saf-setup asks fixed or by-size effort and explains the trade-off in English and Thai, true to the code | · not started | – |
| [T-M3-06](tasks/M3/T-M3-06.md) | SAF's own repository builds S cards with a medium-effort implementer and writes plans with a medium-effort designer | · not started | – |
| [T-M3-07](tasks/M3/T-M3-07.md) | At milestone end task:report lists open friction with a brief for the designer, and task:friction draft prints card drafts for recurring friction | · not started | – |
| [T-M3-08](tasks/M3/T-M3-08.md) | With workflow.selfFix on, a small proven framework bug becomes a self-fix card in the active milestone without waiting, inside a cap the engine enforces | · not started | – |
| [T-M3-09](tasks/M3/T-M3-09.md) | task:release <M> shows every release guard and the next version without changing anything, and stops when the kill switch is off | · not started | – |
| [T-M3-10](tasks/M3/T-M3-10.md) | task:release --prepare commits and pushes the version bump with the CHANGELOG and release log, and --tag pushes the tag only after every CI job is green on that commit | · not started | – |
| [T-M3-11](tasks/M3/T-M3-11.md) | A v* tag publishes both npm packages through trusted publishing and creates the GitHub release, after release-check confirms every guard again | · not started | – |
| [T-M3-12](tasks/M3/T-M3-12.md) | CHANGELOG Unreleased lists every user-visible change since 0.1.0, so the first automatic release computes 0.2.0 | · not started | – |
| [T-M3-13](tasks/M3/T-M3-13.md) | A documented skill-pack format, and saf pack show <path> lists everything a pack would install before anyone trusts it | · not started | – |
| [T-M3-14](tasks/M3/T-M3-14.md) | Setup and upgrade install skill packs named in skills.external only when their content hash matches | · not started | – |
| [T-M3-15](tasks/M3/T-M3-15.md) | /saf-setup asks for skill packs from a folder, shows what each would install, and installs only after an explicit yes | · not started | – |
| [T-M3-26](tasks/M3/T-M3-26.md) | Reinstalling SAF into a project that already has a plan keeps docs/plan and its evidence in place (waits for D-019) | · not started | – |

### Exit gates of M3 (checked with `npm run task:verify -- M3`)

| Gate | Criterion | Result |
|---|---|---|
| cards | every card of M3 passed task:verify and the spec review (a pass round recorded with task:review from T-M3-02 on) | manual check |
| matrix | every acceptance scenario of the M3 specs has a passing test | not checked |
| release-workflow | the release workflow publishes only through npm trusted publishing on a v* tag, after the guards step | not checked |
| project-checks | the project's own checks pass on Linux, macOS and Windows (CI matrix green) | not checked |
| owner-setup | the owner finished the one-time trusted-publishing setup listed under 'Owner setup' below (npmjs.com for both packages, GitHub environment npm, tag ruleset, gh login on the releasing machine) | manual check |
| owner | the owner tried the friction log, review rounds, effort by size, a self-fix card and a release dry run (task:release M3) in this repository and accepts them | manual check |

## Latest evidence

- T-M3-01 Agents log where the workflow got in the way in docs/plan/friction.md, and every session starts with the open count — passed 2026-11-24 07:36 (8 commands) · full suite deferred to gate
- T-M2-30 Setup never overwrites a local env value or spreads a string env into index keys: an env block it cannot merge is archived, a colliding key keeps the local value — passed 2026-11-24 06:51 (5 commands) · full suite deferred to gate
- T-M2-29 setup refuses a --keep it cannot read, and upgrade stops cleanly on a broken saf.config.json before writing anything — passed 2026-11-24 06:46 (5 commands) · full suite deferred to gate
- T-M2-28 Setup explanations say what the code really does: the UI rule with i18n, model ids with any preset, strict's security review, rigor values with units — passed 2026-11-24 06:19 (7 commands) · full suite deferred to gate
- T-M2-26 Setup explanations and docs say what a lane costs, that caps can be set per machine, and why the main lane stays one — passed 2026-11-24 06:08 (6 commands) · full suite deferred to gate

## Other milestones

- M0 SAF setup works in this repo — done
- M1 v0.1.0 public release — done
- M2 Roadmap: next — done
