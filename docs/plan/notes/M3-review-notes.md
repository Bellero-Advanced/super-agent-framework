# M3 review notes (non-blocking findings, batched for the designer)

Same rules as M2-review-notes.md; M3 findings that are workflow friction also go to `docs/plan/friction.md` once the
log exists (T-M3-01).

## T-M3-01 (review FAIL → fixed → merged) — hardening candidates for the friction log

H1. stale-lock takeover race (friction.mjs ~117): two processes can both see a lock older than 15 s as stale, A removes it and creates its own, B's rmSync deletes A's new lock and B creates another → both run the critical section and may take the same id (duplicate id = permanent plan issue); the finally block also removes the other process's lock — take over by rename, or re-check mtime/pid before removing
H2. rule 12 / alwaysAllowed means verify and merge never check the log: a card can rewrite or delete old lines and nothing reports it — append-only is enforced only inside the commands; add a verify/merge check that the old content is a prefix of the new content
H3. SPEC GAP: any broken line (crash mid-append, hand edit) is a plan issue that blocks start, verify and merge while rule 6 forbids the only repair (editing the line) — define a repair path, or make friction issues fail only `task:state --check`
H4. secrets: `add` writes free text into a tracked file committed outside the card loop (no verify/check-secrets before the rule-11 commit); rules 5-8 do not require secret rejection — add to rule 7: refuse a field matching SECRET_PATTERNS (secrets.mjs, already exported)
H5. untrusted text: ESC/ANSI, U+2028/2029, U+0085, tabs and very long fields are accepted and `task:friction` prints summaries raw; the "unknown kind" issue echoes the raw kind; T-M3-07/08 copy summaries into card drafts — treat that text as data, not instructions; consider stripping control characters and a length cap
H6. a closing line whose ref contains " · " is flagged but still changes the status; hand-written closings with a ref that is not a card id or closing after fixed/dropped are not flagged
H7. `refuseInLane` is exported (task.mjs:200), only `laneLabel` is private: the custom message copies laneLabel's text and can drift; the CARD regex in friction.mjs duplicates CARD_ID from plan.mjs (avoids a cycle) and can drift
H8. rule 4 says area is "one short token" but spaces and any length are accepted — weakens the kind+area grouping planned for T-M3-07
H9. nextId also counts `- F-<n>` bullets above the marker; a huge id can lose Number precision (harmless)
H10. docs/plan/README.md jumps from §5 to §7 (older gap); the new §8 continues it
H11. size: evidence says code 388/400 for the card (the implementer's first report said 294) — use evidence numbers

## T-M3-02 (review PASS) — notes for the designer

R1. plan.mjs:332 `verifySummary` ignores `reviewFailed`: a reopened card shows status "failed" beside "passed <time> · N checks" in STATE.md, .saf/plan.md, the session hook, the stop hook and the startCard refusal — say "review round n failed — verify again" (plan.mjs was off limits for T-M3-02)
R2. lane asymmetry after a failed review (reviews.mjs ~293-300): the old passed evidence on the branch stays valid, so `pass` can be recorded at once with the same branch head and no new verify, and `task:merge` still accepts it — option: refuse a round whose `head` equals the head of the last failed round
R3. partial writes (reviews.mjs ~309-324): friction append → reviews file → reopenCard are not atomic (a failure between steps leaves a friction entry without a round, or a fail round on a card still `done` — a second `fail` then records a duplicate); the reviews file has no lock (two `task:review` runs on one card can lose a round)
R4. reviews.mjs:209 comment says kind descriptions are "shown in usage and errors" but only keys are printed
R5. /saf lane step (en+th): on a lane `fail` the text says fix and verify again but not to commit the fix + evidence on the card branch, nor the friction file after `--kind framework` (the CLI output says both)
R6. Thai saf.md:42-43 "คำสั่งนี้ไม่ commit ให้" + line break + "commit ไฟล์รอบรีวิว…" renders as one run-on sentence — add "—" or "·"
R7. docs/INDEX.md has a friction row but none for review rounds / `task:review`
R8. CLAUDE.md and the CLAUDE templates show `<id> pass|fail …` only; the listing form `task:review <id>` is visible in card-lifecycle only
R9. reviews.mjs:297 does not check that the branch evidence `lane` matches the main evidence (task:merge precheck does)
R10. FRICTION: `saf:refresh` and the example upgrade rewrite `.saf/manifest.json` and `examples/todo-api/.saf/manifest.json`, which are not in touch or alwaysAllowed → the first verify fails until reverted by hand (same class as F-001, F-006)

## T-M3-27 (review FAIL ×1 → fixed → merged) — notes for the designer

C1. data-loss crash window: the restore snapshot lives only in memory; Ctrl-C during step (b) kills script and upgrade so the restore never runs, and (b) has already deleted/re-copied examples/todo-api/.claude/skills/saf-setup/ — write the snapshot under .saf/memory/ before (b) and restore from it on the next run
C2. no lock: two runs in the same folder can interleave (user bytes not lost; verify would show it); lanes are separate folders so parallel lanes are safe
C3. an emptied-folder removal now uses rmdirSync (fixed in the card, no red proof); folders are not recorded, so a folder empty before the run that got a file from the upgrade is removed with the file
C4. symlinks: `listFiles` treats a symlink to a folder as a file → readFileSync crashes with EISDIR before any upgrade runs (nothing written); writing back through a file symlink follows the link (example has none today)
C5. rule 4 edge: a card whose touch lists examples/todo-api/.claude/** but not examples/todo-api/.saf/manifest.json keeps the new .claude bytes while the manifest is put back → next upgrade treats those files as "edited — kept"; the spec edge case should pair the manifest with .claude/**
C6. SPEC DEFECT rule 7 / AC-05: a second real run rewrites saf.md/SKILL.md again and restores them (restored: 2), not "nothing to restore" — reword: the example's bytes after run 2 equal those after run 1 (the test now does this with the same fake upgrade twice)
C7. untested: rule 9 (restore after step (b) fails, exit 1 naming the step), "an example file the upgrade deletes is written back", rmdirSync cleanup
C8. the snapshot also reads tools/saf/** into memory though the spec excludes it (no behaviour difference); restored deleted files lose the executable bit; EACCES during restore gives a stack trace
C9. F-007 half fixed: the example manifest is restored with .claude (must be), the ROOT .saf/manifest.json is still rewritten by step (a) and must be in kit cards' touch or this repo's alwaysAllowed — restoring it would make the next upgrade treat the refreshed /saf commands as edited (designer action)
C10. CLAUDE.md:97 gap fixed together with CONTRIBUTING: the command needs a card in progress, else the two by-hand upgrade commands

## T-M3-28 (review FAIL ×1 → fixed → merged) — notes for the designer

D1. SPEC GAP: in-progress cards are counted by their CURRENT role lane (parallel.mjs:57 `laneOf`, not the evidence lane): after a role moves while one of its cards runs, `task:next --parallel` miscounts until that card finishes (moved main→code while a main card X runs: X takes a code slot on paper; code→main while lane card L is open: L fills the main slot on paper). No deadlock, no real double use (startCard/openLane refuse); count by evidence (`ev.lane`) instead — parallel.mjs was dont_touch; RLANE-AC-05's second test locks in today's behaviour
D2. schema.mjs `props[k]` has the same inherited-property weakness (`constructor: "side"` under roles.lanes gets only the 'unknown' error) — outside touch
D3. card-lifecycle "By default the roles … run in the main folder" — submodule cards can never move (fixed in the card)
D4. wording polish applied in the card; SKILL.md:36 (outside touch) does not name role-lanes in the group 6 list (it also omits solo and ports) — `choices --group 6` prints the question anyway
D5. FRICTION F-008 hit again: `spec:matrix --check` in a lane fails while ANOTHER lane's started card has its tests only on its own branch — T-M3-28 and T-M3-29 blocked each other (deadlock); broken by `task:abandon` of T-M3-29 (non-destructive for lanes: worktree and branch stay) then restart. Fix: the check must count a lane card's gaps only in its own lane (and cards in progress in the main folder only in the main folder) — carded below

## T-M3-29 (review PASS at round 1; 4 shipped-text notes fixed before merge) — notes for the designer

A1. docs/specs/agent-instructions.md rule 4 `text` names "English and Thai" and "setup-choices.md rule 8 (no run of two digits)"; the shipped template correctly says "every language" and "never copies a number or model id from a data table" (a shipped file cannot name SAF's own spec) — update the spec wording; this repo's reviews lose the literal "no two-digit run" check unless the main session states it in the prompt
A2. spec-reviewer.md "the dry run says what apply does" is weaker than the spec's "what the dry run says equals what apply does"
A3. no test renders the reviewer with `tokenSaving.reviewerDiff: false` (spec §4) — the `{{else}}` branch is unpinned
A4. `examples/todo-api/.claude/agents/implementer.md` is stale against its own templates (only the example's engine copy is refreshed; outside touch, same as T-M3-28)
A5. F-008 did not recur after the restart — the cross-lane `spec:matrix` deadlock is real only while two started cards both have scenarios and neither has merged

## T-M3-30 (review FAIL ×1 → fixed → merged) — notes for the designer

P1. a thrown error in prerun now exits 2 (rule 8: 1 = some command passes); the stray-mark warning is advisory (exit code unchanged)
P2. control characters are not stripped from printed command/reason (verify prints `▶ ${c}` raw — no worse); the time-limit wording depends on a tail line starting with `<stopped:` (`r.exit === 124` + marker would be stricter)
P3. a marked command that fails shows "fails now — expected": the designer is not told the mark is now wrong (matches the spec; a hint would help)
P4. the card template has a prose line under "Done when" while the designer rule says Done-when "items" are "never prose" (only list items count)
P5. task:prerun is not in the generated CLAUDE.md / plan README command lists nor this repo's CLAUDE.md (the spec does not require it)
P6. untested: the plan-with-problems refusal and yarn/bun command forms
P7. the card's own `npm run saf:refresh -- --check` mark is redundant in this repo (it is a merge check and so already a guard)
P8. /tmp diff file omitted examples/todo-api/package.json — build review diffs from verified.files.changed (T-M3-31 `task:diff` does this)

## T-M3-31 (review PASS at round 1) — notes for the designer

Q1. reviewdiff.mjs ~220/233: for a lane card run from the MAIN folder `cardFiles`/`cardSize` use the main folder's `ctx.config` (incl. local overrides), verify in the worktree uses the worktree's config — a card that changes `workflow.alwaysAllowed` or the size caps (or local overrides) can make the main-folder diff differ from verify and from the worktree run (AC-03 "same content") — load the config from the worktree
Q2. reviewdiff.mjs ~190: a file in both the tracked diff and the untracked list (existed at base, `git rm --cached` but kept on disk) is shown as a brand-new file instead of a diff against the base (list complete, one file's content misleading)
Q3. the /saf sentence says "files task:verify counted" but the command recomputes at run time — a header line saying whether the files match `verified.files.hashes` would close it
Q4. submodule card: the header shows only the root base, not the submodule `repoBase`
Q5. saf.mjs:60 "1 git failed" but a failed write/rename also exits 1; the AC-04 exit-1 test goes through the generic error path (3 stack lines); `runGit`'s DiffError path (incl. output-too-large) is untested
Q6. a merged lane card whose worktree was removed gets `--worktree --resume` advice (wrong for a merged card; the spec mandates the wording for a missing worktree)
Q7. en "none fits → none" vs th "ไม่มีข้อไหนตรง → ไม่ระบุ" say slightly different things
Q8. examples/todo-api/.claude/commands/saf.md and its CLAUDE.md are stale against the templates; no sync test for this repo's `.claude/commands/*` vs the rendered templates (agents have one) — F-009 root cause: card
Q9. AC-04 refusal inside a lane does not check that nothing was written in the lane folder

## T-M3-32 (review PASS at round 1; one docs sentence made precise before merge) — notes for the designer

M1. CI/PR checkout of an unfinished lane branch: the checkout is detached and has no label (gitignored), so laneFolder returns null and the run is treated as the main folder → that lane card's in-progress gaps are skipped there and counted only in the lane worktree (by design, rule 5 "only the evidence decides"; matters only if lane branches are pushed before they are verified) — say so in the spec
M2. main folder checked out on a card branch: laneFolder (task.mjs:176) returns null so that card is skipped in the one folder holding its tests — rare, no spec rule
M3. spec rule 9 and a test comment suggested spec:matrix is a merge check; it is NOT in the default mergeChecks (config.mjs:208) nor this repo's saf.config.json — nothing escapes (lane verify + milestone gate), word it "if listed in mergeChecks" (comment fixed in the card)
M4. the lane-label fallback stderr line embeds the TaskError text "every command is refused here" then "— checking every started card" (follows rule 6, confusing to read)
M5. two extra tests carry the MSCOPE-AC-04 id but test the merge path and rule 2/10 selection
M6. spec §4 says submodule cards' evidence carries `lane` — `--worktree` refuses cards outside the root repo (task.mjs:374), so submodule cards are always main-folder cards (wording)
M7. FRICTION candidate: on Node 22 `node --test <existing file> <missing file>` exits 0 → a combined Done-when command hides a missing new test file (task:prerun caught it on T-M3-33)

## T-M3-33 (review PASS at round 1) — notes for the designer

R1. by-hand route incomplete: the refusal text `BY_HAND` (scripts/refresh-copies.mjs ~91) and CONTRIBUTING give two `upgrade` commands, which do not do the example re-render — a kit change to agent/CLAUDE.md templates refreshed that way leaves COPIES-AC-15 red (wording; CLAUDE.md and CONTRIBUTING sentences fixed by the main session after the merge)
R2. both manifests are now committed, ignored by parallel overlap and by merge's post-verify check: two kit lanes in parallel will often conflict on adjacent hash lines in `.saf/manifest.json` and `examples/todo-api/.saf/manifest.json` (`task:merge` exit 4); a change to these files after verify goes unnoticed
R3. a `create` action (missing example agent or CLAUDE.md) is neither written nor printed; AC-15 only rules out `update`
R4. the "kept (edited)" label can mislead: a file whose manifest entry is missing or whose manifest is unparsable becomes `replace-edited` and is printed as kept although nobody edited it
R5. the re-render is skipped silently without an example config (not even `example re-rendered: 0`); old-style fixtures AC-01..05, AC-09 never run it
R6. `TABLE.rerender.only` and `TABLE.ownedGlobs` overlap and nothing checks the re-render paths stay inside ownedGlobs (a one-line assertion in AC-12 would lock it)
R7. AC-10 asserts the edited agent's manifest entry only as "not equal to the edited file's hash" — assert equality with the seeded entry
R8. the script re-implements sha1 instead of reusing setup's `sha` (generate.mjs does not export it); only AC-10 would catch a change of setup's hash

## T-M3-34 (merge allowed globs) — non-blocking
- S1 docs/card-lifecycle.md:100 sentence lacks the condition "only when the branch's saf.config.json is the one the lane verified"; also ~170-char line.
- S2 no test for a malformed/missing branch config (rule 5) or rule 3 alone.
- S3 spec wording: a lane with unchanged config uses the base list, slightly wider than "nothing new is skipped".

## T-M3-22 (release-operator text) — non-blocking from round 1
- N1 choices.mjs:205 deploy:allowed cost text still says the agent "describes an order step" (false now; needs a card, rule 24 en+th). N2 config.mjs:57 role summary "only on an explicit owner order" ignores deploy:allowed (also docs/roles.md:14).
- N4 multiple auto-deploy branches read "that push"; N6 spec: what "except to main" means under deploy:allowed; N7 owner-order push text changed when auto-deploy branches exist.

## T-M3-16 (setup keeps) — non-blocking
- K1 "nothing was changed" is false after `saf init --answers` on a broken manifest (copyKit/.gitignore run before generate throws); check before copyKit or scope the sentence; maybe with T-M3-26.
- K2 setup report counts `same` files as written ("generated N file(s)"). K3 duplicate helper isObject vs mergeable. K4 upgrade prints a kept path twice. K5 UPG-AC-07 does not run dry-run CLI. K6 no direct test for keep-unplanned in refresh.
- T-M3-22 round 2: with deploy:none steps 2-5 still render after "stop" (wrap in unless deployNone); test name "owner-order keeps its text" misleading; owner-order wording differs a little between agent file and CLAUDE.md git line; "owner" hardcoded in agent description (pre-existing); Thai "ยกเว้น push ไป main" reads more naturally.

## T-M3-18 (culprit) — non-blocking
- interrupted line says "test run … worktree removed" (removal is best effort; signal may land between runs) → neutral wording. docs/card-lifecycle.md:163 exit list lacks 2 (bad id), 130/143 → needs a card. Run output on stdout vs headers on stderr separate when one is redirected. culprit-robust test:262 kill(pid,0) zombie flake risk; :290-295 redundant rev-parse.

## T-M3-23 (docs wording) — non-blocking
- SKILL.md:46,105,119 lines over ~120 cols; docs/plan/README.md:34 rendered 127 cols (wrap via template). Stray comma "saf.config.local.json, (at most" in en/th plan README templates (+docs/plan/README.md:97). SKILL.md:51-52 "ask that question first … show its table" order unclear. "use the repository's test mode and lane caps unless SAF_TEST_MODE is set" can read as env overriding caps. SKILL.md:50 hand-made language list (en/th).
- T-M3-23 round 2: SKILL.md:217 still ~165 cols; docs/plan/README.md:98 127 cols (rendered cmd); th plan README:98 stray "·" before "(ไม่เกิน" (Thai reader pass).
- T-M3-18 round 2 (pass): narrow gap left — one setImmediate may not reach a poll phase, so Ctrl-C during install before run 2+ can still end exit 1; harden with two turns `setImmediate(()=>setImmediate(r))` or use spawnSync(...).signal in runSync (needs a small card, rule 24 has no exception).

## T-M3-20 (strict CLI args) — non-blocking
- saf.mjs:591-594 bare catch reports unreadable/EISDIR config as "not valid JSON". text.mjs:264 Thai viewer wraps an English-only fallback reason (make reasons text keys?). Spec test-mode rule 13 does not say which cause wins when several apply (code: command, placeholder, files).

## T-M3-17 (setup reads plan, no temp copy) — non-blocking from round 1
- setup-rerun.test.mjs:73-74 (RERUN-AC-01) copies the old isLiving and asserts _template.md is living (contradicts rule 33; outside touch → later card). readFriction in friction.mjs now used only by its test. setup-plan-read.test.mjs:85 missing semicolon.
- T-M3-17 round 2 (pass): parity helper in setup-plan-read test compares default io with itself (real proof = fixed expected values); setup now skips a friction.md that is a folder (old threw EISDIR; outside rule 32); on Windows os.tmpdir() ignores TMPDIR so the tmpdir check may flake.

## T-M3-21 (setup messages) — non-blocking
- adopt-moved replace-edited lines have no `→` (target only on the adopt line); set `to` from adoptMoves. Multi-line package.json with no indentation collapses to one line when a script is added (spec edge). readJson catch reports EACCES/dir as "not valid JSON" (pre-existing). setup-messages test:136-137 weak check ("is not valid JSON" vs "not valid JSON"). Designer checklist: run the card's Done-when test files against the new rules and list any that must change in `touch` (happened for T-M3-18 and T-M3-21).

## T-M3-19 (gate words in every view) — non-blocking
- Spec evidence-viewer §4 "no evidence → every gate not checked" contradicts rule 10 (declared gate without run reads manual); fix the §4 line. "Passed" word differs by view (STATE shows time) — decide if literal. bin/saf.mjs:161 task:verify <M> summary decides gate marks itself (outside touch). Still crash on: gate commands entry null (page block()), invalid verified.at (formatTime RangeError in STATE/report) — card title "never crashes" is broader than rules 10–14 → small card. Rule 12 covers only text table (card titles with backticks show literally). Test gaps: undeclared gate commands [] pass false; STATE passed check uses startsWith.

## T-M3-25 (pin choices/gate-coverage/lane caps) — non-blocking
- Card labels: snapshot/walk-up tests are SETUP-AC-03 (card lists AC-01; add AC-03 to scenarios). Spec setup-choices rule 14 lacks "found by walking up from a subfolder". TMODE-AC-15 test: `task state --check` child ignores `mode` (pass SAF_TEST_MODE in env). LCAP-AC-02: repo cap and local cap both 1 — use repo 3 / local 1 to prove local value is read. TMODE-AC-14 test name "runs once" checks only gate list.

## T-M3-24 (pin setup/upgrade behaviour) — non-blocking from round 1
- doc-languages LANG-AC-02 test cannot tell "fallback rendered English" from "file left alone" (project generated in en); comment "shipped engine has no xx" misleading. upgrade-scripts:49-50 messages say UPG-AC-04 inside UPG-AC-01 test; :122-136 non-object cases are UPG-AC-07's rules but named UPG-AC-05. No idempotence (second run) check for settings-root archive cases and `.1`.

## T-M3-03 (effort by size) — non-blocking from round 1
- docs.mjs:177 and generate.mjs:280 hard-code the effort list; build from EFFORTS. AC-01 loop covers core roles only (release-operator never exercised). config-reference.md:43 row: "effort table" undefined, "yet" leaks plan state, no mention of extra agent files — T-M3-05 covers (rule 14). config-reference.md:96-99 "first source that sets it" covers only test mode and lane caps. SKILL.md:40 opens "Test mode and the two lane caps…" then lists four keys; questions.md:104 "only those three keys and models.effort" awkward. No test that a second upgrade/setup leaves variants unchanged. Variant model not checked against config in docs:check (rule 9 does not ask). MISSING_VARIANTS_WARNING says files "do not exist" though an edited variant may remain.
- T-M3-03 round 2 (pass): no test runs the `!roleTable(...)` clause in generate.mjs:451 (custom role named like a real variant, e.g. designer-medium while designer has an override); NOT_ASKED text omits that upgrade also rewrites changed unedited variants; SKILL.md:40 lacks the by-size-only-if-tracked condition (T-M3-05); effort.mjs:372 warning says variant files "do not exist" though an edited one may stay.

## T-M3-04 (task:start names agent/effort; report table) — non-blocking
- Card's last bullet `git checkout -- examples/todo-api/.claude` contradicts refresh-copies ownedGlobs; drop from card templates. card-lifecycle.md:19-23: says evidence records size (it stores agent/effort/mode/source only) and "without variants it prints a warning" (only when wanted effort ≠ role effort). A card with no role gets no agent line (report row `—`). Report counts a card with unreadable review file as reviewed 0/rounds 0 without "?". report.mjs:93 "SM" literal vs SIZES. Generated files still say "effort fixed per role" in by-size mode: templates/{en,th}/docs/DECISIONS.md D-002 row, questions.md:61; /saf roles table shows only role effort; /saf template line 29 names designer even in by-size. effort-shown test checks only Thai title, not header row/effortNone.

## T-M3-05 (/saf-setup effort question) — non-blocking from round 1
- roles.md:62-64 quotes variant description "use it only when task:start names it" but /saf-plan uses designer-medium without task:start (rule 7 text vs rule 5; needs a card). roles.md:69 says upgrade "writes missing" — also rewrites unedited variants. Several sentences say by-size lowers effort "for small cards"; table lowers designer M too (what fields/config-reference correct). roles.md:60 copies variant names from the table (test keeps in step). docs link to D-016 in DECISIONS.md — SAF's own log, never shipped to users (works on GitHub). Generated DECISIONS.md D-002 row says "effort fixed per role" always (templates; own card). Thai by-size "when": "models.overrides ยังชนะ…" literal → native-reader pass.
- T-M3-05 round 2 (pass): roles.md:66 hard-codes `designer-medium` (pinned only by regex; list at :59 is test-kept); rest of round-1 notes carried.

## T-M3-07 (friction brief + draft) — non-blocking from round 1
- Spec rule 15 ambiguous: "N open entries" — code groups only open entries; pin one reading. Report hides malformed friction lines (draft prints them to stderr). noDrafts wording with selfFix off ("workflow.selfFix is off"). YAML tests lack `:`/`"`/`\` summaries; parseCard check loose. `T-M?-??` fallback and active-over-planned untested. frictionNone literally false when only fixed/dropped entries exist. Thai test checks English heading absent, not Thai present; Status cells untranslated in th. Draft lacks "Out of scope"; recurring self-fix group yields group draft + per-entry drafts (rule 16 literal). Step 9 does not say to close with `task:friction close <F-id> carded <card>` after a draft becomes a card.

## T-M3-06 (this repo on by-size) — non-blocking
- Card wording: "— task:start names the agent" tail cannot match the template (kit dont_touch); "/saf re-rendered with by-size wording" but /saf template has none. designer-medium description says "use it only when task:start names it" yet /saf-plan sends plan work to it (product text; rule 7 prefix per role) → friction F-013. /saf template line 29 "designer writes the card first" and its Help role table (one Effort per role) do not reflect by-size. CLAUDE template "(model + effort by card size …)" reads as if the model varies. Reviewer note: no test pins CLAUDE.md line 17 (COPIES-AC-14 compares only the Commands block).

## T-M3-08 (self-fix) — non-blocking from round 1
- Cap 3 per milestone has no number in D-017 or the spec (owner approved "3 per milestone" in session): designer writes 3 into the spec / proposes a DECISIONS row. Spec rule 19 gap: a passed card keeps history (entry fixed by it, also during reopen after a failed review; milestone closed). Re-verify after a failed review logs a misleading "! F-… was not closed" (skip quietly when last close is fixed by this card; no test for reopen→re-verify). Removing `self_fix:` from a done card frees a slot (evidence does not record self_fix; task:start could). /saf section: use c("task:friction","draft") (→ `npm run task:friction -- draft`), say replace `T-M<n>-??` with next id, say to commit friction.md after the auto close (next task:merge refuses a dirty main). Test names promise more than they test (other milestones; verify refusal; exit 4). "Done when names the test file" is a substring check (D-017 says "runs"). card-lifecycle.md:223 and :208 point to kit/tools-saf/lib/friction.mjs; user projects have tools/saf/lib/friction.mjs.
- T-M3-08 round 2 (pass): spec rule 19 needs the "a passed card keeps its history" clause; code also accepts an entry fixed by this card before it passed (after a manual close fixed); Thai step 4 "ให้ … ให้" awkward → "…ปิดรายการเป็น fixed ใน `docs/plan/friction.md` แล้ว commit ไฟล์นั้นลำพังทันที"; card-lifecycle.md:208 kit/ path pinned by friction-triage test (outside touch); a log that turns unreadable mid-run is the same race as any plan file.

## T-M3-35 (card sizes M/L engine) — non-blocking from round 1
- T-M3-36 MUST merge before the M3 gate or any release: /saf self-fix text still says "size S card" and "size M … waits" (saf.md en:82,95 th:81,93) vs rule 13; choices.mjs:192-193 size-caps option still says "S and M cards … a warning, not a failure" and light-rigor option promises "larger cards", reviewWords "m-cards" text mentions S; CLAUDE template line 112 "size-S cards reviewed together at the gate". examples/todo-api/docs/DECISIONS.md:20 and shipped DECISIONS D-003 (user projects) still say S ≤150 / M ≤400 — add a superseding row or update; template DECISIONS "Rigor level X: cards M ≤ … / L ≤ …" sounds as if rigor sets caps (add "one table for every rigor"). implementer.md:19 / plan-files.md:10 do not say verify fails only above 2× cap. Setup not writing caps (null) needs a sentence in spec rule 2 + a test; setup re-run writes back a legacy {S,M} value silently (report could say so). stop line prints twice (stderr+stdout). countedSize note "no size — counted as M" wrong for XL/lowercase (unreachable). stopCard unused plan param; task.mjs:582 `!ev.lane` vs `!lane`. SIZE-AC-07/03 vacuous-ish checks. Tests not run on this card (targeted): side-lanes, lane-caps, role-lanes, generate, setup-rerun, evidence-viewer depend on helpers card() default "M" — the M3 gate run must confirm.

## T-M3-36 (sizes text) — non-blocking from round 1
- card-lifecycle.md:34 and config-reference.md:67 state the legacy-S batch review at the gate as fact; no gate step tells anyone to do it (convention) — add a gate step or say it is the convention CLAUDE.md asks for. card-lifecycle.md:19-20 "records the same in the evidence" (started.effort has no size). "twice" in texts repeats HARD_STOP_FACTOR in words, no test ties it. config-reference.md:43 and questions.md:67 credit the effort table to D-016 only (M/L values from D-021; EFFORT-AC-08 pins "D-016"). Thai: "ตก" vs "ล้ม" for fail; th /saf:93 "เกินเพดาน" (self-fix cap) vs size cap; session-default planner cost "งานการ์ดเล็ก ๆ" vs en. size-caps en cost opens with a fact "The same for every rigor." card-sizes-text.test LEGACY regexes lack word boundaries (hold/threshold, คงเดิม). Outside touch: examples DECISIONS D-003, shipped DECISIONS D-003 "Rigor level X: cards M ≤ … / L ≤ …", implementer.md:19 / plan-files.md:10 (verify fails above 2×), README.md:8,66 and README.th.md:7,64 "small cards" vs D-021.

## T-M3-37 (L cards in steps) — non-blocking from round 1
- Submodule cards: all-submodule-file cards make step commits inside the submodule so stepEnds (root history) always falls back to whole diff; unchanged submodule file adds a "no change against the base" placeholder forcing the last section; untrackedIn(root) runs twice. Spec silent on submodule cards — designer decides. plan.mjs accepts `1)` items (rule 19 names `1.`); findSection matches heading prefixes (`## Steps to reproduce` counts). Rule 21 says "a card with steps" is split but D-021 and the reviewer text say "an L card": an M card keeping the template's two placeholder steps gets a `# steps` header — pick one. Plan README does not mention the two fallbacks nor the omitted empty last section.
- T-M3-37 round 2 (pass): step counting gap — first numbered item indented 1–3 spaces with later steps at col 0 counts only the first; docs/spec do not say nested numbered lists are not steps. Manifest hashes of the five repo files + two example files written by a one-off script (F-014) — the next saf:refresh/upgrade will show if wrong.
