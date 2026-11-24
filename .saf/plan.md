<!-- Generated from docs/plan/ by npm run task:state — do not edit: change cards in docs/plan/tasks/ or the milestone file, then run the command -->
# Plan: Super Agent Framework — M3 SAF builds itself
Status: active
Source: `docs/plan/milestones/M3.md` · full status: `docs/plan/STATE.md` · a card becomes done only through `npm run task:verify -- <id>`

## Goal
SAF is developed with SAF, so the framework should notice where it gets in the way, fix the small things itself and
ship its own releases (owner order 2026-11-24). After M3: every friction with the workflow is logged with evidence ·
every spec review is recorded per card · effort follows card size and its cost is measured · small proven framework
bugs become self-fix cards inside the active milestone without waiting · a closed milestone is released to npm and
GitHub by the engine behind guards and a kill switch. The skill-pack chain deferred from M2 (D-013) starts here with
the format and `saf pack show` (T-M3-13); installing packs, the interview question and the reinstall fix moved to
[M4](M4.md) by owner order 2026-11-25 so 0.2.0 can be released (T-M3-14 → T-M4-01 · T-M3-15 → T-M4-02 · T-M3-26 →
T-M4-03).

## Scope
- **Friction log** ([spec](../../specs/friction-log.md), D-017): T-M3-01 — `docs/plan/friction.md`, append-only,
  written by `task:friction add|close`, checked by `task:state --check`, open count in the session summary; seeded
  with the workflow friction M2 already showed (manual example restores, lost review notes, review fail needs
  `--restart`, a doc that contradicts the evidence). The other M2 review notes stay in
  [M2-review-notes.md](../notes/M2-review-notes.md) for the designer's batch at M2 end, as agreed — the log's header
  points to them
- **Review rounds** ([spec](../../specs/review-rounds.md), D-017): T-M3-02 — `task:review <id> pass|fail --kind …`
  stores each round in `docs/plan/evidence/reviews/<id>.json`; a fail reopens a main-folder card without `--restart`;
  kind `framework` logs friction; the report shows rounds per card
- **Workflow efficiency** (owner order 2026-11-24 — fewer tokens and less wall time, same quality; D-020 proposed,
  recommended defaults, the cards follow them unless the owner says otherwise): T-M3-27 … T-M3-31 run right after
  T-M3-02 because they make every later card cheaper. Evidence: about sixty M2/M3 card and review prompts repeated
  the same manual steps and ~400-word instructions.
  - T-M3-27 ([spec](../../specs/refresh-copies.md), friction F-001): `npm run saf:refresh` refreshes this repository
    and the example in one step and puts back the example files outside the card's `touch`; `-- --check` reports
    stale copies in a second and is the first merge check here (repository-only, `scripts/` does not ship)
  - T-M3-28 ([spec](../../specs/role-lanes.md)): `roles.lanes` moves a role to the other lane (image or copy cards in a
    worktree); `designer`, `spec-reviewer`, `release-operator` are locked; the main lane stays one card (D-018)
  - T-M3-29 ([spec](../../specs/agent-instructions.md)): the implementer and spec-reviewer agents carry the checks
    every prompt repeated (failing-first tests, evidence size, sentence → code, Windows-safe tests, friction line;
    review types `text` · `data` · `security` · `refactor` with checklists); a test keeps this repository's agent
    files equal to the templates' rendering
  - T-M3-30 ([spec](../../specs/designer-prerun.md)): the designer runs every new "Done when" command before the
    hand-over; `task:prerun <id>` shows which already pass (`— passes by design: <reason>` marks the intended ones);
    no automatic warning in `task:state` / `spec:matrix` (it would need to run every command and could not tell a
    guard from a proof)
  - T-M3-31 ([spec](../../specs/review-diff.md)): `task:diff <id>` writes `.saf/memory/review/<id>.diff` with exactly
    the card's files; `/saf` hands the reviewer "card id · review types · diff path"
  - From T-M3-27 on, `npm run saf:refresh` replaces the three refresh lines older cards still list (refresh, example
    upgrade, restore); kit cards written from now on list `npm run saf:refresh -- --check` in "Done when"
- **First self-fixes** (D-017, friction triage after T-M3-31): T-M3-32 ([spec](../../specs/matrix-scope.md), F-008
  `command-failed`) — `spec:matrix --check` counts a started card only in the folder where it is built, so two lane
  cards with scenarios stop blocking each other · T-M3-33 ([spec](../../specs/refresh-copies.md) rules 12–18, F-009
  and review notes Q8 / A4 / C9) — sync tests keep this repository's `.claude/commands`, skills and the `CLAUDE.md`
  Commands block equal to the templates, the root manifest is committed (always allowed), and `saf:refresh`
  re-renders the example's unedited `CLAUDE.md` and agents and stops restoring the example files SAF owns. Written by
  the designer, not through the `self_fix` field (T-M3-08 has not landed; F-009 is a `workaround` and T-M3-33 is
  size M)
- **Self-fix #1 of 3** (owner approval 2026-11-24, D-017): T-M3-34 ([spec](../../specs/merge-allowed.md), F-011
  `command-failed`) — `task:merge`'s post-verify check skips files allowed by the main folder's
  `workflow.alwaysAllowed` or the branch's, so a card that adds a glob merges without copying its config to main
  first. Carries `self_fix: F-011` (read by the plan check once T-M3-08 lands); runs first among the open cards
- **Effort by size** ([spec](../../specs/effort-by-size.md), D-016): T-M3-03 (setting `models.effort`, `EFFORT_BY_SIZE`,
  `<role>-<effort>` agent files, docs:check, per-machine override) → T-M3-04 (`task:start` names the agent, evidence,
  summary, `/saf` and `/saf-plan` wording, report table of effort × review rounds) and T-M3-05 (setup question and
  explanations, en + th, every sentence checked against the code) → T-M3-06 (this repository switches to `by-size`)
- **Friction triage and self-fix** ([spec](../../specs/friction-log.md) rules 15–22, D-017): T-M3-07 (`task:report`
  friction section and designer brief, `task:friction draft`) → T-M3-08 (`self_fix` cards, `workflow.selfFix`, cap
  and kinds enforced by the plan check, passing verify closes the entry; on in this repository)
- **Card sizes M and L** (owner order 2026-11-25, [spec](../../specs/card-sizes.md), D-021 proposed — the owner's four
  answers plus recommended defaults (a)–(e) the cards follow unless he says otherwise): S is retired; M = one
  self-contained subsystem, L = one whole-line feature; warning cap per size, `task:verify` fails above twice it; old
  `size: S` is read as M with a note, no card file or evidence is rewritten; by-size effort M medium · L high. Runs
  after T-M3-08 and before the release cards, so 0.2.0 ships it.
  - T-M3-35 — engine: `SIZE_CAPS` / `HARD_STOP_FACTOR`, the hard stop, `countedSize`, plan validation (S only in
    active/paused/done milestones or on started cards), the effort table, self-fix size M, every rendered cap line
    (templates, this repository, the example), both configs drop their old `{ S, M }` caps
  - T-M3-36 — wording: `saf choices` explanations (en, th), `questions.md`, `SKILL.md`, `/saf`, CLAUDE templates'
    m-cards line, `card-lifecycle.md`, `config-reference.md`, `setup-questions.md`. Role effort: high (text for users)
  - T-M3-37 — L cards in steps: `## Steps` required on L (plan check), `task:diff` splits an L card's diff by step
    commit for the read-only reviewer; one commit per step and resuming are agent conventions
  - from T-M3-35 on, new cards in this repository are M or L; the open S card of M3 (T-M3-12) stays as written and
    counts as M (T-M3-15 and T-M3-26 moved to M4 as M cards T-M4-02 · T-M4-03)
- **Automatic release** ([spec](../../specs/auto-release.md), D-015): T-M3-09 (`task:release <M>` dry run and every
  guard, `policies.release` with the kill switch) → T-M3-10 (`--prepare` bumps versions, moves `Unreleased`, writes
  the release log, commits and pushes; `--tag` checks CI on the exact commit and pushes the tag) and T-M3-11
  (`.github/workflows/release.yml` with npm trusted publishing, `release-check guards|workflow`, `docs/releasing.md`,
  `policies.release` on here). **Security-relevant: all three cards use the `security-review` skill** while building
  and in review
- **CHANGELOG** T-M3-12: `## Unreleased` lists every user-visible change since 0.1.0 (M2 and M3), so the first
  automatic release computes 0.2.0. From T-M3-12 on, every card that changes user-visible behaviour adds its own line
  under `## Unreleased` (the skill-pack cards list `CHANGELOG.md` in `touch` for this)
- **Skill packs** ([spec](../../specs/skill-packs.md), D-013 — deferred from M2, last in the order): T-M3-13 (format +
  read-only `saf pack show`) — the only skill-pack card left in M3; install (T-M4-01, was T-M3-14) and the interview
  question (T-M4-02, was T-M3-15) moved to [M4](M4.md) by owner order 2026-11-25. Local folders only, content pinned
  by sha256, `.md` only, SAF never fetches or runs anything. **Every card needs the `security-review` skill**
- **M2 review notes** (owner order 2026-11-24, after T-M3-02 so their reviews are recorded): T-M3-16 … T-M3-26 turn
  the proposed groups A–E of "Carried to M3" below into S cards — setup and upgrade data safety (T-M3-16 · T-M3-17;
  the third, T-M3-26, moved to M4 as T-M4-03), `task:culprit` robustness (T-M3-18), evidence views that agree
  (T-M3-19), wording and CLI strictness (T-M3-20 · T-M3-21 · T-M3-22 · T-M3-23), test gaps (T-M3-24 · T-M3-25). Specs
  extended: setup-rerun (rules 28–38), upgrade-scripts (12–14), test-mode (13, 22, 24–26, 31–33), evidence-viewer
  (10–14), setup-choices (15, 16, 26, 27), lane-caps (13), doc-languages (12). T-M3-26 (adopt on reinstall, waits for
  **D-019**, proposed) moved to [M4](M4.md) as T-M4-03
- **Text cards run at role effort high:** T-M3-22 and T-M3-23 (and any card whose output is mainly sentences for users)
  say "role effort: high" in their Why. M2 data: the text-for-users S cards built at `medium` bounced in review 3 of 4
  times at round 1; T-M2-28 at `high` with a sentence → code list passed at round 1. Until T-M3-03 … T-M3-06 make
  effort a setting, the main session opens the implementer at high for these cards; after T-M3-06 they need the
  high-effort agent even though they are size S (a text/code split is not in D-016 — owner question below)
- Every card that changes `kit/` runs `npm run saf:refresh` and `node bin/cli.mjs upgrade --dir examples/todo-api`
  (engine copies are in `workflow.alwaysAllowed`, D-007); cards that add an engine script also list `package.json` and
  `examples/todo-api/package.json`
- **The first automatic release** is not an M3 card: its guard needs M3 closed. After the owner closes M3, the main
  session runs `npm run task:release -- M3` (dry), `-- M3 --prepare`, waits for CI, then `-- M3 --tag`; the tag
  workflow publishes 0.2.0. Until D-015 is decided, releases stay on the owner's order (D-004)

## Done When
- [ ] cards every card of M3 passed task:verify and the spec review (a pass round recorded with task:review from T-M3-02 on) (manual check)
- [ ] matrix every acceptance scenario of the M3 specs has a passing test
- [ ] release-workflow the release workflow publishes only through npm trusted publishing on a v* tag, after the guards step
- [ ] project-checks the project's own checks pass on Linux, macOS and Windows (CI matrix green)
- [ ] owner-setup the owner finished the one-time trusted-publishing setup listed under 'Owner setup' below (npmjs.com for both packages, GitHub environment npm, tag ruleset, gh login on the releasing machine) (manual check)
- [ ] owner the owner tried the friction log, review rounds, effort by size, a self-fix card and a release dry run (task:release M3) in this repository and accepts them (manual check)

## Task List
- [x] T-M3-01 Agents log where the workflow got in the way in docs/plan/friction.md, and every session starts with the open count — passed 2026-11-24 07:36 (8 commands) · full suite deferred to gate
- [x] T-M3-02 The main session records every spec review with task:review, a failed review reopens the card, and the report shows rounds — passed 2026-11-24 08:09 (6 commands) · full suite deferred to gate
- [x] T-M3-27 npm run saf:refresh refreshes this repository and the example in one step and puts back the example files the card does not own; --check reports stale copies in a second — passed 2026-11-24 08:55 (5 commands) · full suite deferred to gate
- [x] T-M3-28 A project can move a role to the other lane with roles.lanes, so image or copy cards can run in a worktree beside other cards; setup explains it in English and Thai — passed 2026-11-24 09:05 (5 commands) · full suite deferred to gate
- [x] T-M3-29 The implementer and spec-reviewer agents carry the checks every prompt used to repeat: failing-first tests, evidence size, sentence-to-code lists, Windows-safe tests, and per-type review checklists — passed 2026-11-24 09:12 (5 commands) · full suite deferred to gate
- [x] T-M3-30 The designer runs every new Done-when command against the current code before handing a card over, and task:prerun <id> shows which commands already pass — passed 2026-11-24 09:26 (6 commands) · full suite deferred to gate
- [x] T-M3-31 task:diff <id> writes the reviewer's diff file with exactly the card's files, and the /saf review step hands the reviewer the card id, review types and that path — passed 2026-11-24 09:35 (7 commands) · full suite deferred to gate
- [x] T-M3-32 spec:matrix --check counts a started card only in the folder where it is built, so two parallel lane cards with scenarios no longer block each other — passed 2026-11-24 09:57 (8 commands) · full suite deferred to gate
- [x] T-M3-33 This repository's /saf commands and CLAUDE.md commands block stay equal to the templates (a test fails when they drift), and saf:refresh keeps the example's commands, skills, agents and CLAUDE.md current — passed 2026-11-24 10:03 (9 commands) · full suite deferred to gate
- [x] T-M3-34 task:merge accepts a lane card that adds an always-allowed glob: the post-verify check uses the main folder's list and the branch's — passed 2026-11-24 16:19 (8 commands) · full suite deferred to gate
- [x] T-M3-16 Setup leaves same files byte-identical, never forgets a kept file, stops on a broken manifest, and never replaces a scripts value it cannot read — passed 2026-11-24 16:26 (5 commands) · full suite deferred to gate
- [x] T-M3-17 Setup reads the plan without copying it to a temp folder, and an edited task template gets format updates — passed 2026-11-24 16:50 (5 commands) · full suite deferred to gate
- [x] T-M3-18 task:culprit cleans up when interrupted, streams its runs, refuses a bad plan or id, and settles ties the spec names — passed 2026-11-24 16:39 (5 commands) · full suite deferred to gate
- [x] T-M3-19 STATE.md, the plan mirror, the report and the HTML page give every exit gate the same result word, and broken evidence never crashes them — passed 2026-11-24 16:55 (5 commands) · full suite deferred to gate
- [x] T-M3-20 saf choices and config --check refuse arguments they do not know, and a verify fallback names its real cause — passed 2026-11-24 16:44 (5 commands) · full suite deferred to gate
- [x] T-M3-21 Setup messages say what happened: "not a JSON object" for a valid non-object file, the archive path in every settings warning and dry-run line, and a minified package.json stays minified — passed 2026-11-24 16:55 (5 commands) · full suite deferred to gate
- [x] T-M3-22 The release-operator agent and CLAUDE.md agree with the deploy and push policies: no owner order asked when deploy is allowed, auto-deploy branches named as the exception — passed 2026-11-24 16:28 (5 commands) · full suite deferred to gate
- [x] T-M3-23 The setup skill and the user docs say exactly what the code does: keep paths with spaces, the chat-language question, lanes without the local file, upgrade's plan promise, the language list — passed 2026-11-24 16:39 (5 commands) · full suite deferred to gate
- [x] T-M3-24 Tests pin the setup and upgrade behaviour the M2 reviews found untested (BOM, settings roots, real updates, diff properties, keep with adopt) — passed 2026-11-24 17:06 (5 commands) · full suite deferred to gate
- [x] T-M3-25 Tests pin the setup-choices, gate-coverage and lane-cap behaviour the M2 reviews found weakly tested — passed 2026-11-24 17:02 (5 commands) · full suite deferred to gate
- [x] T-M3-03 models.effort: by-size gives a role a second agent file at a lower effort for small cards, checked by docs:check — passed 2026-11-24 17:23 (8 commands) · full suite deferred to gate
- [x] T-M3-04 task:start names the agent and effort for each card, the evidence keeps them, and the report compares review rounds by size and effort — passed 2026-11-24 17:32 (5 commands) · full suite deferred to gate
- [x] T-M3-05 /saf-setup asks fixed or by-size effort and explains the trade-off in English and Thai, true to the code — passed 2026-11-24 17:38 (5 commands) · full suite deferred to gate
- [x] T-M3-06 SAF's own repository builds S cards with a medium-effort implementer and writes plans with a medium-effort designer — passed 2026-11-24 17:45 (4 commands) · full suite deferred to gate
- [x] T-M3-07 At milestone end task:report lists open friction with a brief for the designer, and task:friction draft prints card drafts for recurring friction — passed 2026-11-24 17:46 (6 commands) · full suite deferred to gate
- [x] T-M3-08 With workflow.selfFix on, a small proven framework bug becomes a self-fix card in the active milestone without waiting, inside a cap the engine enforces — passed 2026-11-24 18:07 (7 commands) · full suite deferred to gate
- [x] T-M3-35 Card sizes are M and L: task:verify warns above the cap and fails above twice it, old S cards count as M, and every generated file shows the new caps — passed 2026-11-24 18:52 (10 commands) · full suite deferred to gate
- [x] T-M3-36 Setup explanations and the user docs describe sizes M and L, the hard stop and legacy S cards, in English and Thai, true to the code — passed 2026-11-24 19:08 (8 commands) · full suite deferred to gate
- [x] T-M3-37 An L card lists its steps: the plan check demands them, task:diff splits the review diff by step commit, and the agents build and review step by step — passed 2026-11-24 19:25 (9 commands) · full suite deferred to gate
- [x] T-M3-09 task:release <M> shows every release guard and the next version without changing anything, and stops when the kill switch is off — passed 2026-11-24 19:54 (6 commands) · full suite deferred to gate
- [x] T-M3-10 task:release --prepare commits and pushes the version bump with the CHANGELOG and release log, and --tag pushes the tag only after every CI job is green on that commit — passed 2026-11-24 20:52 (6 commands) · full suite deferred to gate
- [x] T-M3-11 A v* tag publishes both npm packages through trusted publishing and creates the GitHub release, after release-check confirms every guard again — passed 2026-11-24 20:30 (7 commands) · full suite deferred to gate
- [x] T-M3-12 CHANGELOG Unreleased lists every user-visible change since 0.1.0, so the first automatic release computes 0.2.0 — passed 2026-11-24 21:03 (3 commands)
- [x] T-M3-13 A documented skill-pack format, and saf pack show <path> lists everything a pack would install before anyone trusts it — passed 2026-11-24 21:22 (6 commands) · full suite deferred to gate

## Risks
- **Releasing is irreversible:** npm versions are immutable; a bad release is fixed by a new patch, never by
  unpublish. Guards: closed milestone, gate evidence with only release files changed since, every CI job green on the
  exact commit, CHANGELOG-derived semver, release log before the tag, kill switch read on `origin/main` and again in
  the workflow before each publish. What no guard catches: a breaking change nobody wrote under `### Breaking`
- **The engine pushes to `main`:** only the release commit (version, CHANGELOG, release log), never with force; a
  rejected push stops with the local commit kept for a person to decide
- **Supply chain:** publishing uses OIDC with no stored token and attaches provenance; the workflow's only write
  permissions are `contents: write` and `id-token: write` in the `npm` environment, which only `v*` tags reach;
  `release-check workflow` fails if a token reference ever appears
- **Self-fix without the owner's Go:** bounded by the plan check (kinds, size S, test in touch, per-milestone cap,
  `workflow.selfFix` off by default for users); everything else still waits for the owner. The cap and kinds are code
  data (`friction.mjs`) and visible in D-017
- **Effort by size may raise review bounces:** measured from T-M3-04 on (rounds by size and effort in `task:report`);
  the product default stays `fixed` until this repository's numbers say otherwise (D-016)
- **Variant agent files and routing:** two agent files per role could confuse Claude's automatic routing; the variant
  description says to use it only when `task:start` names it, and the `/saf` loop names the agent explicitly
- **Size change hits existing projects** (T-M3-35): after upgrading, a `planned` milestone's S card (or one without
  size) becomes a plan issue and an old `{ S, M }` caps config is ignored with a warning — both named in the CHANGELOG
  (`### Breaking` candidate, T-M3-12); active, paused and done milestones and started cards keep loading. The hard
  stop is new dogfooding too: T-M3-35 is verified by the engine it changes (`saf:refresh` before verify)
- **Dogfooding:** T-M3-02 and T-M3-08 change `task:verify` behaviour while being verified by it; this repository keeps
  `workflow.testMode: targeted`, so each card gets one full run before it reaches `main`
- **Skill packs are third-party instructions** (T-M3-13; install and interview in M4): a malicious skill can tell an agent to run
  commands even without scripts. The trust model limits what SAF does (no fetch, no run, `.md` only, pinned hash,
  explicit yes after `pack show`) but cannot vet the text — the docs and the interview say so
