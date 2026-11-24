<!-- Generated from docs/plan/ by npm run task:state — do not edit: change cards in docs/plan/tasks/ or the milestone file, then run the command -->
# Plan: Super Agent Framework — M2 Roadmap: next
Status: active
Source: `docs/plan/milestones/M2.md` · full status: `docs/plan/STATE.md` · a card becomes done only through `npm run task:verify -- <id>`

## Goal
The "Next" items of [ROADMAP.md](../../../ROADMAP.md): more document languages, a guided upgrade of project docs, a card
size check and an evidence viewer (skill packs from other repositories moved to [M3](M3.md) by D-013). Plus (owner
order 2026-11-24) a setup interview that explains every option and shows every setting it does not ask.

## Scope
- The four roadmap items were rewritten with `/saf-plan M2` (2026-11-24) into specs and chains of S/M cards, listed in
  work order after the merged cards; their decisions D-011 … D-014 are decided (owner order 2026-11-24)
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
  decided): `saf upgrade` never added new engine scripts to `package.json`, so existing projects had no
  `task:culprit` while the exit-gate hint prints `npm run task:culprit -- <M>`. Upgrade now adds missing
  `ENGINE_SCRIPTS` keys and never changes an existing script (chosen over printing the raw `node tools/saf/bin/saf.mjs`
  form: one fix covers every future engine command, and the docs keep one command style). A regular card after
  T-M2-09; **T-M2-10 waits for it** because T-M2-10 puts `{{cmd.taskCulprit}}` in the generated CLAUDE.md.

- T-M2-15 also closes review note N2 of T-M2-14 before the explanations reach users: the skill asks the adopt
  question and passes `--no-adopt` for "no" (without a flag `setup` archives by detection), and it lowercases the
  `DOCS_URL` anchor (note 3 of T-M2-12). T-M2-19 (note N1 of T-M2-14) makes the generated release-operator agent say
  pushing is allowed when `policies.push` is `allowed` and corrects the `push: allowed` explanation. It is its own
  card, not part of T-M2-15: it changes a template and explanation text in `choices.mjs`, a different outcome than
  the interview wiring. It **waits for T-M2-15** because both touch `choices.mjs`

- **Guided upgrade** ([spec](../../specs/setup-rerun.md), D-011): T-M2-20 first — a re-run keeps edited living files
  (decision log, index, milestone and card files) instead of archiving them and writing the template back (reproduced:
  an active `M1.md` returned to `planned`), and leaves `package.json` byte-identical unless a script is missing (one
  merge function shared with `saf upgrade`). Then T-M2-02 (`planSetup` + `setup --dry-run`, one code path with the real
  run) → T-M2-21 (`--diff` with an in-engine line diff, `--keep <path>`) → T-M2-22 (`/saf-setup` asks per edited
  file). A chain: all share `generate.mjs` / `saf.mjs` / the setup skill
- **Evidence viewer** ([spec](../../specs/evidence-viewer.md), D-012): T-M2-05 — `task:report <M> --html`, one file,
  no JavaScript, no network, no dependency. No `touch` overlap with T-M2-20, so the two can run in parallel lanes;
  T-M2-02 waits for both (`saf.mjs`, `generate.mjs`)
- **Document languages** ([spec](../../specs/doc-languages.md), D-014): T-M2-01 — the mechanism only (registry, English
  fallback with a warning, explanations that cover any language, contributor steps); no third language ships. After
  T-M2-21 and T-M2-05 (`generate.mjs`, `text.mjs`); may run beside T-M2-22
- **Skill packs** ([spec](../../specs/skill-packs.md), D-013 decided: **deferred**): the three cards moved to
  [M3](M3.md) as T-M3-13 … T-M3-15 (were T-M2-03 · T-M2-23 · T-M2-24) — no M2 card depends on them
- Every new card that changes `kit/` runs `npm run saf:refresh` and the example upgrade, then restores
  `examples/todo-api/.claude` and `examples/todo-api/package.json` (the stale example skill copy is review note C,
  batched for milestone end)

## Done When
- [ ] cards every card of M2 passed task:verify and the spec review (manual check)
- [ ] project-checks the project's own checks pass on Linux, macOS and Windows (CI matrix green)
- [ ] owner the owner tried each item in a fresh project and accepts it (manual check)

## Task List
- [x] T-M2-04 task:verify reports changed code and test lines against the card's size cap — passed 2026-11-23 18:42 (2 commands)
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
- [x] T-M2-19 The release-operator agent says pushing is allowed when policies.push is allowed, and the push explanation says so — passed 2026-11-23 21:34 (4 commands) · full suite deferred to gate
- [x] T-M2-20 A setup re-run keeps your edited decision log, index and plan files, and leaves package.json alone unless a script is missing — passed 2026-11-24 04:40 (5 commands) · full suite deferred to gate
- [x] T-M2-05 task:report <M> --html writes one self-contained HTML page of the milestone's evidence — passed 2026-11-24 04:52 (5 commands) · full suite deferred to gate
- [x] T-M2-02 saf setup --dry-run lists, per file, what a setup run would do — and writes nothing — passed 2026-11-24 05:05 (5 commands) · full suite deferred to gate
- [x] T-M2-21 saf setup --dry-run --diff shows each change as a diff, and --keep keeps an edited file instead of replacing it — passed 2026-11-24 05:09 (5 commands) · full suite deferred to gate
- [x] T-M2-22 /saf-setup on a re-run shows what would change and asks per edited file: take the new version, keep mine, or show the diff — passed 2026-11-24 05:17 (5 commands) · full suite deferred to gate
- [x] T-M2-01 A document language is added with one text-table entry and a template folder; missing templates fall back to English with a warning — passed 2026-11-24 05:27 (5 commands) · full suite deferred to gate

## Risks
- **Re-run behaviour changes** (T-M2-20): a person who expected an edited `DECISIONS.md` to be replaced by the
  template now keeps theirs; the setup output warns per kept file that the new settings did not reach it, and the
  dry run (T-M2-02 … T-M2-21) shows the difference
- **Refactoring `generate()`** (T-M2-02): setup and upgrade both run through it; the refactor must keep every existing
  generate, e2e and upgrade test green unchanged, and RERUN-AC-04 proves the dry run equals the real run. It does not
  change `task:verify`, so the dogfooding risk of the test-mode cards does not apply
- **HTML from evidence** (T-M2-05): output tails are untrusted text — one escape function for every value, no script,
  a CSP meta tag; AC-02 checks it
- **Languages and the schema** (T-M2-01): the schema enums stay static; a test fails when they differ from the
  registry, so a contributor cannot add half a language unnoticed
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
  missing script is the one exception (D-010, decided); it never overwrites, never creates the file and never
  rewrites it when nothing is missing, so a project that customised a SAF script keeps it
- **Batched review notes:** the non-blocking notes of the spec reviews (T-M2-09: 9 notes, note 2 became T-M2-18)
  are listed one line each in [M2-review-notes.md](../notes/M2-review-notes.md) and go to the designer at milestone
  end, who turns the ones worth doing into cards of the next milestone — they do not block M2
