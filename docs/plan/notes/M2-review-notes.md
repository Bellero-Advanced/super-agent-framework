# M2 — non-blocking review notes (batched for the designer at milestone end)

One line per note. At M2 end the designer turns the ones worth doing into cards of the next milestone and marks each
line with the card id or "dropped (reason)". Blocking findings never wait here — they become cards at once.

## T-M2-04 (card size check)

- notes 1–2 (lane guard refuses a SAF project in a subfolder / on Windows; prove the top-level check for real) → done as T-M2-11
- other T-M2-04, T-M2-06, T-M2-07 and T-M2-08 notes were not recorded in a file; the T-M2-08 gate gaps became T-M2-16 and T-M2-17

## T-M2-09 (`task:culprit`)

1. Ctrl-C during a run leaves the temporary culprit worktree behind (no signal handler; `finally` does not run)
2. `upgrade` does not add new engine scripts to `package.json` → carded now as T-M2-18
3. the test for the second half of rule 21 (hint only when `deferredCards` is not empty) is weak
4. `FAIL_TAIL = 20` (lines of the failing run shown) is a number outside the `RUN_LIMITS` table
5. `findCulprit` neither checks the milestone id with `requireValid` nor escapes card ids before building a RegExp
6. wording "already fails before the first card" differs from rule 25's message
7. the oldest base is chosen by first-parent commit count — the rule says "oldest ancestor of HEAD"; confirm they agree
8. no `onOutput` streaming — a long run shows nothing until it ends
9. tie order when a commit matches several cards (subject id vs. file overlap) is not specified or tested

## T-M2-18 (review PASS) — notes for the designer

1. a minified one-line `package.json` has no indented line, so adding a script re-expands it to 2-space indent (rule 6 does not cover it; a `""` fallback would keep it minified)
2. a valid JSON root that is not an object (e.g. `[]`) gets the message "package.json is not valid JSON" — behaviour right, wording slightly off
3. a project that ran `init` without answers (stub config) passes validation, `packageManager` defaults to "npm", so upgrade adds the SAF scripts before setup ran — harmless, but the spec does not say so
4. test gaps: BOM keeping · schema-invalid `saf.config.json` · non-object root or `scripts` · "unchanged" asserted only on `scripts`, not on other top-level keys
5. pre-existing: `upgrade()` still calls `JSON.parse` on `saf.config.json` unguarded (install.mjs ~157) — an invalid config warns, then crashes
6. `docs/specs/upgrade-scripts.md` header still says D-010 "(proposed)" — it is decided

## T-M2-10 (review FAIL → fixed → merged) — notes for the designer

A. `docs/card-lifecycle.md` describes the T-M2-16 behaviour (gate covers every full-suite command no declared gate runs; id reserved) before T-M2-16 has merged — re-check if T-M2-16 slips
B. (fixed) "this repo itself uses targeted" in shipped docs → "SAF's own repository"
C. `examples/todo-api/.claude/skills/saf-setup/**` is stale against kit — add it to `workflow.alwaysAllowed` with a dogfood-test pair, or refresh it with a card
D. plan README §1 says the evidence says "full suite deferred to gate"; the evidence JSON carries `deferred`/`targeted`, the words appear in verify output, STATE.md and the session summary
E. several new doc lines run past the ~120-column wrap (README.md:54, README.th.md:53, docs/plan/README.md §1, plan README templates line 33, docs/setup-questions.md §6)
F. the `testFiles` row lists `jest {files}` beyond the card's examples (harmless)
G. the test-mode explanation table in questions.md may overlap T-M2-13/14 (`saf choices --group`) — decide which is the source of truth

## T-M2-16 (review PASS) — notes for the designer

N1. `testmode.mjs:26` comment on `FULL_SUITE_GATE` says its `run` is every full-suite command — now only those no declared gate runs
N2. `testmode.mjs:20-21` comment on `GATE_ADDS_FULL_SUITE` says "when no gate runs it" — out of date after partial coverage
N3. no test for duplicate config values (`test` = `e2e`) or the reverse partial case (gate runs e2e only); code handles both
N4. cosmetic: `const { config } = { config: {...} }` in the coverage test
N5. AC-15 "When" names `task:state --check`; the test checks `loadPlan(...).issues` (what `--check` reports) — no end-to-end exit-code check

## T-M2-17 (review PASS) — notes for the designer

1. `plan.mjs:441` an undeclared gate with `pass === null` shows `- [ ]` without `manualSuffix` while STATE.md and the report say "manual check" — the three views differ slightly for a manual undeclared gate
2. `test-mode-gate-views.test.mjs:163` `!view.includes("old")` is a loose substring check; the no-evidence case checks "g1" is present, not that the gate rows equal exactly the declared rows
3. th wording: `fullSuiteGate` says "การทดสอบทั้งชุด", `deferredToGate` says "test ทั้งชุด" — both correct, slightly inconsistent
4. a declared gate with commands and a null result shows `gateNotRun`, an undeclared one shows `gateManual` — per the card, noted for consistency

## T-M2-12 (review FAIL → fixed → merged) — notes for the designer

1. spec rule 13 uses the shorthand `saf config --check`, which is not an installed command (the npm bin has init/upgrade/version/help) — write `node tools/saf/bin/saf.mjs config --check` → done in the spec (rule 13)
2. `choices.mjs` "exit 75" is a copy of `EXIT_BUSY` (measure.mjs) — interpolate the import so it cannot drift
3. `DOCS_URL#<key>` keeps the key's case; GitHub anchors are lowercase (`tokenSaving`, `firstMilestone`) — T-M2-15 AC-07 must lowercase; `#models` is broken until T-M2-15 adds one heading per top-level key (do not publish in between) → T-M2-15 (rules 13, 19 · AC-07)
4. several not-asked keys (`workflow.review`, `models.overrides`) only reach generated files: editing `saf.config.json` alone does not apply them until setup runs again, and the "where" line does not say so
5. a valid-JSON but schema-invalid `saf.config.json` still gives its `chatLanguage`; the spec edge case "invalid → en" is ambiguous
6. test gaps: snapshot compares names not contents · walking up from a subfolder untested · the `Set` in AC-02 hides a key listed twice · `SKILL_PACKS` compared with itself (compare with the schema enum)
7. unknown extra arguments (`--foo`, `--lang=th`) are silently ignored (exit 0)
8. older: `examples/todo-api/.claude/skills/saf-setup/**` is stale against kit (still `stack.commands.*`, lacks the test-mode rows) — `upgrade` refreshes only the engine copy there

## T-M2-13 (review FAIL → fixed → merged) — notes for the designer

4. api "Adds only the server rule": when i18n is required, `ruleSet` also adds the UI rule (generate.mjs:67)
5. ui-languages "several": not mentioned — it adds the UI rule even for types without one (api, data-ai, library-cli, other), and the interview suggests the content-writer role
6. strict: not mentioned — the interview suggests security-auditor (planner = most expensive model) and the CLAUDE.md "Definition of done" requires a security-auditor review even when the role is not enabled
7. custom-models: "Builders are the rest" ignores custom roles marked planner and per-role `models.overrides`; `resolveConfig` uses `models.planner/builder` with any preset (`||=`), not only Custom
8. ui-languages one/none `cost` "retrofitting later" undersells the UI rule (without i18n it already says text stays in one place, ui.md:12)
9. rigor derived line prints raw ids ("m-cards", "every-card+security"); "Card size S / M" has no unit (code lines)
10. groups 5-8 and flow print one blank line and exit 0 until T-M2-14 (`out("")` adds a newline)
11. AC-05 checks coverage for groups 1-4 only — loop over every question that has entries so T-M2-14 is covered automatically
12. stray positional arguments are accepted silently (`choices foo --group 2`)
13. FIELD_MAX 160, longest field 159 — the next wording edit may need a limit bump or trim
14. FACT for the interview itself: `project.stage` (CLAUDE.md header only), `stack.submodules` (read nowhere) and `stack.monorepo` (one CLAUDE.md line) have almost no effect although the interview asks them — decide: drop the question, mark it "informational", or give it an effect
15. Thai wording written by the implementer and reviewed by an AI only — a native-reader pass before publishing

## T-M2-14 (review FAIL → fixed → merged) — notes for the designer

N1. BUG `templates/agents/release-operator.md:27` `Never push{{#if pushOwner}} without the owner's order{{/if}}` renders "Never push" when `policies.push: allowed` — contradicts CLAUDE.md; needs an `{{else}}` branch (en + th) → T-M2-19 (agent templates are English only; the th `push: allowed` explanation is fixed there)
N2. BUG (T-M2-15 MUST handle before the explanations reach users) the setup skill adds `--adopt` only for "yes"; without a flag `generate` falls back to `detected.adopt` (true for any project with package.json, CLAUDE.md, .claude/, docs/INDEX.md or src/) — so "no" still archives. The skill must pass `--no-adopt` for "no"; Step 1 also never asks the adopt question explicitly → T-M2-15 (rules 21–22 · AC-09)
N3. fallback reason text in `planVerifyRun` (task.mjs) always says "no stack.commands.testFiles command", even when the cause is a missing `{files}` placeholder — misleading
N4. engine enforces NOTHING of push / deploy / protectedBranches / noForcePush / externalServices (text in CLAUDE.md, DECISIONS, release-operator, security-review only; hooks are SessionStart and Stop) — the choices say so; decide whether the product should offer a real guard (hook) later
N5. token saving: only `tokenSaving.enabled` gates the CLAUDE.md line; the habit flags are separate and `off` does not clear them — decide whether `off` should set them false
N6. `deploy allowed`: the release-operator file still describes an order step
N7. `measure` is used only by the `measure` script (task:verify and merge checks never take the lock); `lane ports` / `lane db` only print exports; `perf budgets` only named in qa-runner.md

## T-M2-15 (review FAIL → fixed → merged) — notes for the designer

N1. AC-07: the lowercase change of `DOCS_URL` is never exercised — all current `NOT_ASKED` top-level keys are already lowercase; the test passes without `.toLowerCase()` until a camelCase key (`tokenSaving`, `firstMilestone`) joins `NOT_ASKED`
N2. AC-09 regexes are weak: `/--adopt[^\n]*yes/` on whitespace-collapsed text spans the whole step and `--adopt` also matches inside `--no-adopt`; `/--no-adopt[^\n]*(no|skipped)/` matches almost any later "no…"; AC-08 does not check the word "before" ("before each group")
N3. SKILL: the chat-language question is asked before the language is known, so its options never show the four lines first (gap in spec rule 16); not said whether to skip that table when group 1's output is shown afterwards
N6. the skill and the engine detect a re-run differently (skill: `saf.config.json` holds a full config; engine: `.saf/manifest.json` exists) — if the engine sees a re-run and the skill does not, the adopt question is asked and "yes" archives nothing
G (decided here). the test-mode table in `questions.md` was removed (pointer to `saf choices --group 6` kept under the same heading so card-lifecycle's anchor works); the safety facts live in docs/card-lifecycle.md "Test mode"

## T-M2-19 (review PASS) — notes for the designer

N-a. `release-operator.md:27`/`:31`: with `push: allowed`, `deploy: owner-order` and `autoDeployBranches` set the agent says "Pushing is allowed" but later "Pushing <branches> deploys automatically — treat that push as a release"; consistent if read closely, could add "except branches that deploy automatically" (CLAUDE.md line 80 has the same layout)
N-b. `release-operator.md:3` says live changes only "on an explicit owner order" even with `deploy: allowed` (same as T-M2-14 N6)
N-c. with `push: allowed` the agent line does not mention protected branches (CLAUDE.md carries them) — a short pointer would help

## T-M2-20 (review PASS) — notes for the designer

N1. `generate.mjs:31` the OWNED_DIRS JSDoc is detached from it (the LIVING_FILES comment sits between); OWNED_DIRS (line 36) has no doc comment
N2. test "an unedited living file is still updated" asserts only not-kept/not-warned/not-archived; nothing asserts an actual update (second half of spec rule 5) — assert `report.written.includes("docs/DECISIONS.md")` after changing a setting
N3. the LIVING_FILES test re-implements the matcher (`isLiving` not exported); by rule 3 `docs/plan/tasks/_template.md` counts as living, so an edited template never receives format updates — decide whether `_template.md` should be excluded
N4. `report.kept` mixes plain paths (living files) with decorated strings from `retireUnplanned` — T-M2-02/21 (`planSetup`) should settle on one shape
N5. a non-object `scripts` value is replaced with `{}` when scripts are added (also upgrade's old behaviour); undocumented
N6. evidence records `npm test` as deferred (targeted mode) — the milestone exit gate must run the full suite (137 tests ran by hand)
N7. docs/upgrade.md "your working plan is never reset" is accurate for edited files only (a deleted living file is recreated)

## T-M2-05 (review PASS + hardening S1-S3 done) — notes for the designer

N1. `viewer.mjs:65` `mark(res.pass ?? null)` shows "manual check" when a gate result has no `pass`; `report.mjs:37` shows "failed" — only with broken evidence, make the two agree
N2. `viewer.mjs:69` the `gatesNot` text carries markdown backticks that appear literally in the HTML (cosmetic)
N3. `secrets.mjs:24` the "Claude Code env value" pattern needs a literal `"`; in HTML it becomes `&quot;` so the HTML scan cannot match it (the JSON form `\"` also slips past; run.mjs redacts at capture) — spec §4 treats the HTML scan as a safety net, for this pattern it is not
N4. `viewer.mjs:64` milestone evidence `gates` that is an object, not an array, throws a TypeError (same weakness in `report.mjs` and `undeclaredGates`)
N5. the milestone status is shown raw ("active") on a Thai page
N6. the card Done-when grep for `<script|https?://` in viewer.mjs fails on any harmless future comment — use a narrower check
N7. an evidence tail is never truncated by the viewer (spec §4): a hand-crafted 10 MB tail makes a 10 MB page — tails are capped at capture time (20 pass / 60 fail lines)

## T-M2-02 (review FAIL → fixed → merged) — notes for the designer

DATA-LOSS FOLLOW-UPS (pre-existing behaviour, kept by the refactor):
F1. REAL DATA LOSS — an invalid `.claude/settings.local.json` is silently replaced by `{env}` when `settings.json` has an `env` block that moves (planSettings ~326, `readJson(..., {})`); the user's local settings (permissions, possibly secret env values) are overwritten WITHOUT an archive. Card now (S): archive the invalid local file with `archiveDest` like `settings.json`, show it in the dry-run merges line
F2. adopt on a first run archives everything under `docs/plan` that has no manifest entry (STATE.md, evidence JSON) — with the manifest deleted but the plan intact (reinstall) evidence leaves docs/plan and cards look not done; files are moved not deleted. Needs a DECISIONS row / spec rule (e.g. skip adopt when docs/plan already has SAF's shape)
F3. a `keep-unplanned` file loses its manifest entry in setup (next.files is built fresh) while `refreshKitFiles` keeps it — spec rule next to rule 7
F4. `same` files are rewritten, so a CRLF checkout becomes LF while the dry run says "same" — skip writing `same` files
F5. `planStatus` copies docs/plan to an os.tmpdir() scratch folder (new failure mode if the temp dir is read-only/full; cost on every real setup) — better: `loadPlan(root, config, { read, list })` overlay (touches plan.mjs), no temp folder
OTHER:
N3. no test shows the `saf-plan-*` scratch folder is removed after success or error
N4. test tidy-up: `const bad = cli(empty, "--dry-run")` expects 0 (misleading name); `assert.deepEqual(x.length > 5, true)` → `assert.ok`
N5. `report.kept` still mixes plain paths and decorated strings — T-M2-21/22 should read `plan.actions`
N6. evidence defers `npm test` (targeted mode); the milestone gate must cover the full suite

## T-M2-21 (review PASS) — notes for the designer

1. spec: a `--keep` path planned but MISSING on disk exits 2 ("nothing to keep"); rule 6 says "whatever its state" — make the spec say so (rule 6 or §4 edge cases); the branch has no test
2. `--keep=CLAUDE.md` (the `=` form this CLI uses for `--complete=a,b`) is silently ignored and a real run would then archive and replace CLAUDE.md (recoverable from docs/archive/pre-saf); `--keep ","` keeps nothing silently — refuse `--keep=` and empty lists with the usage line
3. a path containing a comma cannot be kept (no planned file has one) — a spec note
4. an absolute path in Windows 8.3 form, or macOS `/var/…` when cwd is `/private/var/…`, becomes a `../` relative path and exits 2 (safe, confusing)
5. the adopt skip compares paths ignoring case — `--keep docs/plan/README.md` also stops an unplanned `docs/plan/readme.md` being moved aside on a case-sensitive FS (safe direction)
6. property test weak: (a) does not assert `-`/context lines match the old text, (b) never checks `newStart/newLines`, (c) all 200 pairs end with a newline and have no CRLF — add pairs without final newline and a running new-side counter
7. untested: `--keep` on a first run with adopt; `--keep` of a file already equal to the new version ("no differences")
8. cosmetic: JSDoc of `generate()` (~generate.mjs:654) omits `keep`; the saf.mjs header says `[--dry-run [--diff]]`, the error message `[--dry-run] [--diff]`
9. `--diff` prints whatever the person wrote in CLAUDE.md etc. to the terminal and through the T-M2-22 skill into the chat (rule 14, by design) — spec: one-line caution not to keep secrets in those files
10. evidence defers `npm test` (targeted); the milestone gate runs the full suite

## T-M2-22 (review FAIL → fixed → merged) — notes for the designer

EFFORT DATA POINT (D-016): first S card run at implementer effort `medium`; 1 review bounce (docs/upgrade.md corrupted: new paragraph inserted before the old text and a bullet block pasted twice; the test only searched for words and `!includes("T-M2-20")` checked nothing). The SKILL.md logic itself was fully correct. Record review rounds per card (T-M3-02) to judge whether medium pays off.
N5. the skill gives no guidance for quoting paths with spaces (POSIX '…', Windows "…"); the dry-run line separates path and reason with two spaces; a comma inside a path would split the comma form
N6. "yours is archived to docs/archive/pre-saf/" — with an older archive the name gets a `.1`, `.2` suffix; the dry run does not print the target (only the real run's `archived:` lines do)
N7. "without the `same` lines" is slightly unclear (the merges block also prints `<path>: same`)

## T-M2-01 (review FAIL → fixed → merged) — notes for the designer

4. docs/config-reference.md:20 and :52 still list the languages by hand ("`en` or `th`") — add to the "Add a document language" steps or name the source; docs/faq.md:29 is Thai-specific (fine)
5. spec tension: rule 2 says each table has `langName` and `names` but LANG-AC-02's fixture table has only `langName` (code and CONTRIBUTING treat `names` as optional); rule 7 says the report-language text is "worded without naming a language" but the entry says "not English" / "แทนภาษาอังกฤษ" — reword the rules
8. the upgrade path's fallback warning (generate.mjs ~721, `refreshKitFiles`) is not covered by any test
9. the cmp.mjs old-vs-new comparison covers fresh runs only (re-run, adopt, upgrade follow by reading) — a re-run + adopt comparison would complete it

## TRIAGE for the M2 exit gate

Designer pass 2026-11-24. Ids are `<card>/<note>`. Closed already: 09/2 (T-M2-18) · 10/A (T-M2-16 merged) · 10/B ·
10/G · 12/1 · 12/3 · 13/10 (T-M2-14) · 14/N1 (T-M2-19) · 14/N2 (T-M2-15) · 15/G · 18/6 (spec header already says
decided) · 05/N6 (card done). Evidence notes 20/N6 · 02/N6 · 21/10 are closed by the exit gate's full suite.

### 1. Must be a card before M2 closes

- 02/F1 — real data loss (local settings overwritten, no archive) → **T-M2-27**
- owner order (not a note) — lane caps per machine → **T-M2-25 · T-M2-26**
- 13/4 — the `api` explanation says "adds only the server rule"; with i18n the UI rule is added too (setup text that lies)
- 13/7 — `custom-models` says the ids are used "with the Custom preset" and "builders are the rest"; the code uses them
  with any preset and honours custom planner roles and `models.overrides` (setup text that lies)
- → 13/4 and 13/7 → **T-M2-28** (owner order 2026-11-24), after T-M2-26 (same file), with 13/5 · 13/6 · 13/8 · 13/9 ·
  12/2 · 12/4 folded in

### 2. Cheap fix worth doing now (one small card or folded into a card already touching the file)

- 18/5 + refreshKitFiles `{}` default — invalid-JSON `saf.config.json`: refresh renders with defaults silently, then
  `upgrade()` crashes; read with `null`, warn and stop (generate.mjs, src/install.mjs)
- 02/F4 — `same` files are rewritten (CRLF → LF while the dry run says "same"): skip writing them
- 21/2 — `--keep=CLAUDE.md` is silently ignored and the real run archives CLAUDE.md: refuse `--keep=` / empty list
- 10/C + 12/8 — `examples/todo-api/.claude/skills/saf-setup/**` stale on GitHub: refresh it once or add it to
  `workflow.alwaysAllowed`
- 10/D — plan README says the evidence "says" full suite deferred; reword to where the words appear
- 14/N6 + 19/N-b — release-operator says "only on an explicit owner order" even with `deploy: allowed` (template)
- 13/5 · 13/6 · 13/9 — explanation omissions (UI rule for every type with i18n · strict suggests security-auditor ·
  raw rigor ids, no unit) → T-M2-28
- 12/2 — "exit 75" copied in `choices.mjs`: interpolate `EXIT_BUSY` → T-M2-28
- 12/4 — `models.overrides` summary should say it applies only after setup runs again → T-M2-28
- 14/N3 — `planVerifyRun` fallback reason names the wrong cause
- 16/N1 · 16/N2 · 20/N1 — out-of-date code comments
- 09/6 — culprit wording differs from spec rule 25
- 18/2 — "not valid JSON" wording for a non-object root
- 20/N7 — docs/upgrade.md "never reset" true only for edited files
- 05/N2 — literal markdown backticks in the HTML viewer
- 21/1 · 21/9 · 01/5 — spec wording only (designer, no card)

### 3. Deferred to M3

- 02/F2 — adopt on reinstall moves evidence out of docs/plan (moved, not lost) → needs a DECISIONS row; M3 first
- 02/F3 · 02/F5 · 20/N3 · 20/N4/02/N5 · 20/N5 — setup internals (manifest of kept files, temp folder, `_template.md`
  living, `report.kept` shape, non-object `scripts`) → M3 setup hardening card
- 13/8 moved to T-M2-28 (same file, cheap)
- broken `.saf/manifest.json` read as `{ files: {} }` (T-M2-27 Why) → same M3 setup hardening card
- 09/1 · 09/4 · 09/5 · 09/7 · 09/8 · 09/9 · 09/3 — culprit robustness and tests → M3 culprit card
- 14/N4 · 14/N5 · 13/14 — need owner decisions (real push/deploy guard, token-saving `off`, informational questions)
- 13/15 · 17/3 — Thai wording: native-reader pass (the owner's `owner` gate can cover it)
- 05/N1 · 05/N3 · 05/N4 · 05/N5 · 05/N7 — viewer edge cases with broken or hand-made evidence
- 17/1 · 17/2 · 17/4 — gate-view consistency for manual undeclared gates
- 15/N3 · 15/N6 · 19/N-a · 19/N-c · 14/N7 · 13/11 · 13/12 · 13/13 · 22/N5 · 22/N6 · 22/N7 · 21/3 ·
  21/4 · 21/5 · 21/8 · 01/4 · 12/5 · 12/7 — small wording / CLI strictness items
- test gaps: 10/E · 10/F (drop) · 12/6 · 15/N1 · 15/N2 · 16/N3 · 16/N4 · 16/N5 · 18/1 · 18/3 · 18/4 · 20/N2 ·
  21/6 · 21/7 · 02/N3 · 02/N4 · 01/8 · 01/9
- 22/effort — D-016 data point → T-M3-02 (review rounds)
- **side lanes with their own slots** (owner idea 2026-11-24, not in T-M2-25): side cards get slots beside the active
  milestone's caps instead of only the slots it leaves free. Needs a decision row when carded (changes rule "side
  cards never raise the caps", card-lifecycle.md Side lanes); spec home would be lane-caps.md §6
