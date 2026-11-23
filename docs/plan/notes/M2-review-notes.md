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
