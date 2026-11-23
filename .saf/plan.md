<!-- Generated from docs/plan/ by npm run task:state — do not edit: change cards in docs/plan/tasks/ or the milestone file, then run the command -->
# Plan: Super Agent Framework — M2 Roadmap: next
Status: active
Source: `docs/plan/milestones/M2.md` · full status: `docs/plan/STATE.md` · a card becomes done only through `npm run task:verify -- <id>`

## Goal
The "Next" items of [ROADMAP.md](../../../ROADMAP.md): more document languages, a guided upgrade of project docs, skill
packs from other repositories, a card size check and an evidence viewer. Plus (owner order 2026-11-24) a setup
interview that explains every option and shows every setting it does not ask.

## Scope
- Drafted from the roadmap; the designer rewrites the cards with `/saf-plan M2` after M1 feedback, and the owner says Go
- T-M2-04 (card size check) is a **side card**: it touches only the verify step, its tests and the engine copies that
  `npm run saf:refresh` rewrites, so it may run in a side lane while M1 is active. It also fixes the lane guard that
  refuses a SAF project in a subfolder (`examples/todo-api`) inside any lane worktree — without that fix `npm test`
  cannot pass in a lane, and a separate card could not start (one side lane at a time, same `touch` files)
- T-M2-06 … T-M2-10 (test mode, [spec](../../specs/test-mode.md), decision D-008 decided) let each person choose how
  often the full test suite runs; the default runs it once, at the milestone exit gate, and `task:culprit` finds the
  card that broke it. They are **side cards** in a chain (each depends on the one before, so one side lane at a time is
  enough): they touch only `kit/` engine and setup files, user docs and this repo's config — nothing an M1 card
  touches
- Cards that change `kit/` (T-M2-06 … T-M2-10) refresh the engine copies with `npm run saf:refresh` and
  `node bin/cli.mjs upgrade --dir examples/todo-api`; the copies are in `workflow.alwaysAllowed` (D-007), so they are
  not listed in `touch` and not counted in the size check
- T-M2-11 (lane guard on Windows) is a **side card** with no dependencies: CI on `windows-latest` is red since
  `72ad81c` and the `project-checks` gate needs the matrix green. It shares `touch` files with T-M2-06 … T-M2-09, so it
  runs before the chain or between its cards, never in parallel with one of them; its final proof is the CI run on the
  pushed commit (push on the owner's order)
- T-M2-12 … T-M2-15 (setup choices, [spec](../../specs/setup-choices.md), decision D-009 decided): `/saf-setup`
  shows "what it is · good for · cost · pick it when" for every option, in en or th, from one data table in the engine
  (`saf choices`), and before generating lists every setting it did not ask with where to change it (project file,
  per-machine file, env variable). A chain of regular cards (M2 is active, so not side cards) that **starts after
  T-M2-10**: T-M2-12 compares the interview keys with `questions.md`, which T-M2-10 extends with the test-mode rows,
  and it shares `kit/tools-saf/bin/saf.mjs` with T-M2-09; T-M2-15 edits the same skill and docs files as T-M2-10.
  "Setup suggestions" from the roadmap stays a separate later item
- T-M2-16 and T-M2-17 close two safety gaps the spec review of T-M2-08 found in the `milestone`-mode exit gate
  ([spec rules 19, 28–30](../../specs/test-mode.md#the-full-suite-gate-in-the-plan-files)). T-M2-16: the
  `full-suite` gate holds every full-suite command that no declared gate runs (today a gate that runs only `npm test`
  means e2e never runs in `milestone` mode), and the id `full-suite` is reserved. T-M2-17: STATE.md, `.saf/plan.md`
  and `task:report` show evidence gates that the milestone file does not declare, so a failed `full-suite` gate can
  never look green. Regular cards in a chain after T-M2-09 (T-M2-09 adds the culprit hint to the same exit-gate path;
  T-M2-16 and T-M2-17 share `plan.mjs` and `testmode.mjs`). Both must pass `task:verify` and the spec review before
  `npm run task:verify -- M2` (the `cards` gate); they change only `kit/tools-saf/lib/` and test-mode tests, so they
  may run beside T-M2-10 and T-M2-12 … T-M2-15 (no shared `touch`)
- T-M2-18 closes a gap the spec review of T-M2-09 found ([spec](../../specs/upgrade-scripts.md), decision D-010
  proposed): `saf upgrade` never added new engine scripts to `package.json`, so existing projects had no
  `task:culprit` while the exit-gate hint prints `npm run task:culprit -- <M>`. Upgrade now adds missing
  `ENGINE_SCRIPTS` keys and never changes an existing script (chosen over printing the raw `node tools/saf/bin/saf.mjs`
  form: one fix covers every future engine command, and the docs keep one command style). A regular card after
  T-M2-09; **T-M2-10 waits for it** because T-M2-10 puts `{{cmd.taskCulprit}}` in the generated CLAUDE.md. It shares
  `generate.mjs` and `docs/upgrade.md` with the draft cards T-M2-02 and T-M2-03, so those cannot run beside it

- T-M2-15 also closes review note N2 of T-M2-14 before the explanations reach users: the skill asks the adopt
  question and passes `--no-adopt` for "no" (without a flag `setup` archives by detection), and it lowercases the
  `DOCS_URL` anchor (note 3 of T-M2-12). T-M2-19 (note N1 of T-M2-14) makes the generated release-operator agent say
  pushing is allowed when `policies.push` is `allowed` and corrects the `push: allowed` explanation. It is its own
  card, not part of T-M2-15: it changes a template and explanation text in `choices.mjs`, a different outcome than
  the interview wiring. It **waits for T-M2-15** because both touch `choices.mjs`

## Done When
- [ ] cards every card of M2 passed task:verify and the spec review (manual check)
- [ ] project-checks the project's own checks pass on Linux, macOS and Windows (CI matrix green)
- [ ] owner the owner tried each item in a fresh project and accepts it (manual check)

## Task List
- [ ] T-M2-01 Add a document language by adding a template folder and a text table
- [ ] T-M2-02 Show what /saf-setup would change before regenerating project docs
- [ ] T-M2-03 Skill packs from other repositories
- [x] T-M2-04 task:verify reports changed code and test lines against the card's size cap — passed 2026-11-23 18:42 (2 commands)
- [ ] T-M2-05 Evidence viewer: a static HTML page from docs/plan/evidence/
- [x] T-M2-06 Choose how often the full test suite runs, per project and per machine (workflow.testMode) — passed 2026-11-23 19:28 (4 commands)
- [x] T-M2-07 task:verify runs the card's own tests instead of the full suite when the test mode defers it — passed 2026-11-23 19:32 (3 commands) · full suite deferred to gate
- [x] T-M2-08 task:merge skips the deferred full suite and the milestone gate always runs it — passed 2026-11-23 19:47 (3 commands) · full suite deferred to gate
- [x] T-M2-09 task:culprit finds the card that broke the deferred full suite — passed 2026-11-23 20:03 (3 commands) · full suite deferred to gate
- [x] T-M2-10 /saf-setup asks for the test mode and the docs explain the three modes and task:culprit — passed 2026-11-23 20:28 (4 commands) · full suite deferred to gate
- [x] T-M2-11 The lane guard recognises a lane worktree on Windows too (CI matrix green again) — passed 2026-11-23 19:17 (4 commands)
- [x] T-M2-12 saf choices --not-asked lists every setting the interview does not ask, and where to change it — passed 2026-11-23 20:48 (4 commands) · full suite deferred to gate
- [x] T-M2-13 saf choices --group explains each option (what · good for · cost · pick it when) for groups 1-4, en and th — passed 2026-11-23 21:00 (5 commands) · full suite deferred to gate
- [x] T-M2-14 Option explanations for groups 5-8 and the setup-flow questions, with a test that no asked choice lacks one — passed 2026-11-23 21:18 (5 commands) · full suite deferred to gate
- [x] T-M2-15 /saf-setup shows the four lines for every option and lists the settings it did not ask before generating — passed 2026-11-23 21:32 (4 commands) · full suite deferred to gate
- [x] T-M2-16 The milestone gate runs every full-suite command no declared gate runs, and the gate id full-suite is reserved — passed 2026-11-23 20:30 (4 commands) · full suite deferred to gate
- [x] T-M2-17 STATE.md, the plan mirror and the milestone report show the full-suite gate and its result — passed 2026-11-23 20:35 (5 commands) · full suite deferred to gate
- [x] T-M2-18 saf upgrade adds the engine's new package.json scripts (task:culprit) without touching existing ones — passed 2026-11-23 20:18 (4 commands) · full suite deferred to gate
- [ ] T-M2-19 The release-operator agent says pushing is allowed when policies.push is allowed, and the push explanation says so

## Risks
- M1 feedback may reorder or replace these cards — that is expected; this is a draft
- **Test mode and this repo (dogfooding):** cards here change the engine that runs `task:verify` and writes the
  evidence. If one card breaks the engine and the full suite only runs at the gate, every later card is verified by a
  broken tool and its evidence cannot be trusted. So this repo's tracked `saf.config.json` pins
  `workflow.testMode: "targeted"` (T-M2-06), not the product default `milestone`: every card still gets exactly one
  full run before it reaches `main` (at verify for main-folder cards, at `task:merge` for lane cards) — half of
  today's runs for lane cards, none of the traceability lost. A person can still set `milestone` in their own
  `saf.config.local.json`; the evidence records the mode and its source, and the spec-reviewer flags a `kit/` card
  verified in `milestone` mode (a repo-level floor is an open question on D-008)
- **Bootstrapping:** T-M2-07 … T-M2-09 change verify, merge and the gate while being verified by them. Until T-M2-07
  lands every mode behaves like `every-card`; each card's own `npm test` (run in full in `targeted` mode at verify or
  merge) is the guard
- **Setup choices text drifts from the engine:** an explanation that names a number or a model goes stale when a code
  table changes — the data test forbids digits and model ids in the text and the CLI appends the real values; the
  coverage test fails when a schema key or an enum value has no explanation or not-asked line
- **Default `milestone` trade-off:** a card can pass while it breaks another card's test; the break shows up at the
  exit gate, later cards may build on it, and fixing it waits until the milestone ends. `task:culprit` (T-M2-09) brings
  back "which card" in a few runs; the milestone cannot close while the gate fails
- **Fixing merged behaviour:** T-M2-16 changes what T-M2-08 shipped (a declared gate that runs only part of the full
  suite no longer suppresses the extra gate) and adjusts the one T-M2-08 test whose expectation encoded the gap;
  reserving `full-suite` turns an existing gate with that id into a plan problem — the error names the id, so the fix
  is a rename
- **Upgrade now edits `package.json`:** until T-M2-18, `upgrade` promised to touch only kit-owned files. Adding a
  missing script is the one exception (D-010, proposed); it never overwrites, never creates the file and never
  rewrites it when nothing is missing, so a project that customised a SAF script keeps it
- **Batched review notes:** the non-blocking notes of the spec reviews (T-M2-09: 9 notes, note 2 became T-M2-18)
  are listed one line each in [M2-review-notes.md](../notes/M2-review-notes.md) and go to the designer at milestone
  end, who turns the ones worth doing into cards of the next milestone — they do not block M2
