---
name: saf-setup
description: Set up SAF (Super Agent Framework) in this project — interview the user in grouped questions with recommended defaults, generate CLAUDE.md, docs, the card plan, agents, rules, skills, commands and hooks from the answers, run the self-checks and the first card, then have the designer draft the first milestone. Use when the user types /saf-setup or asks to set up or re-configure SAF.
---

# /saf-setup — SAF setup interview

You set up the SAF workflow in this repository. The engine is already vendored at `tools/saf/` (by the installer).
Everything you generate comes from templates + the user's answers — never hand-write the generated files.

## Voice

- Ask the very first question in both English and Thai; after the user picks the chat language, use only that language.
- Thai: address the user as "คุณ" and refer to yourself as "ผม". Plain words, results first, no jargon without a short explanation.
- Every question shows a **recommended** option first, marked "(recommended)". The user can always answer "use the recommendations for the rest".

## Step 0 — detect

Run `node tools/saf/bin/saf.mjs detect` and keep the JSON: name, description, package manager, monorepo, submodules,
languages, frameworks, database, the real commands (typecheck · lint · test · e2e · build), existing Claude files, and
whether this is an existing project (`adopt`). Use these as the recommended defaults below. If `saf.config.json` already
holds a full config (a re-run), use its values as the defaults instead and say so.

## Step 1 — interview (AskUserQuestion, grouped, ≤ 4 questions per call)

The full question list, the config key each answer sets, and the recommended defaults are in
[questions.md](questions.md). Ask the groups in this order and skip questions whose answer is already certain from
detection (say what you detected instead):

1. **Language and people** — chat language · document language · owner title · UI languages / i18n
2. **Project** — name + one-line pitch + users/market (one free-text message) · type · stage · rigor
3. **Stack** — package manager · confirm the detected commands · database · monorepo / submodules
4. **Models** — preset (Max · Balanced · Economy · Custom) · default session model
5. **Roles and skills** — optional roles (multi-select) · custom role? · report language · optional skill packs (multi-select)
6. **Workflow** — parallel lanes on/off and caps · side lanes on/off and how many at a time · **test mode** (how often the full suite runs — show the pros/cons table of [questions.md](questions.md#test-mode--explain-each-choice-before-asking), recommend `milestone`) and the command that runs only some test files · measure lock · performance budgets file
7. **Policies** — push · deploy (target, exceptions) · protected / auto-deploy branches · forbidden and owner-only paths · external services allowed · env file names
8. **Token saving** and **first milestone goal** (free text: "what should work at the end of the first milestone?")

Test mode is also a per-machine choice. When the person says their machine is slow (or fast), offer to write an untracked
`saf.config.local.json` with only `{ "workflow": { "testMode": "<mode>" } }` — never other keys (the engine refuses
anything outside `LOCAL_KEYS`, `$schema` included). The installer already git-ignores that file. `SAF_TEST_MODE` does the
same for one shell. Neither changes generated files.

Free-text answers (name, pitch, users, goal, paths, services): ask them in one plain message per group, listing what you
already know, instead of forcing them into options.

## Step 2 — confirm

Show a compact summary table of every setting (group · setting · value) and ask once: "Generate with these settings?"
with options: Generate (recommended) · Change something.

## Step 3 — generate

1. Write the answers as JSON to `.saf/setup-answers.json` (shape = `tools/saf/schema/saf.config.schema.json`; include
   only keys the user decided or that differ from defaults — the engine fills the rest).
2. Run `node tools/saf/bin/saf.mjs setup --answers .saf/setup-answers.json`
   (existing project and the user chose to keep old docs as history → add `--adopt`).
3. Read the output: list archived files (they moved to `docs/archive/pre-saf/`, nothing was deleted) and warnings.

## Step 4 — self-checks (real runs, report real results)

Run with the project's package manager (the commands are in the generated `CLAUDE.md`):

- `task:state --check` · `docs:check` · `check-secrets`
- `node tools/saf/bin/saf.mjs hook session-start` — show the user the summary every new session will receive

Fix what they report by re-running setup with corrected answers — never by editing generated files.
Rule warnings "paths match no file yet" are fine for a new project.

## Step 5 — first commit and the M0 card

1. Ask: "Commit the SAF setup locally now? (recommended — the card loop compares files against a commit)". Never push.
2. After the commit: `task:start T-M0-01` → `task:verify T-M0-01` → `task:state --check`. Report the verify result with its numbers.
3. Mention the remaining M0 gates: `task:verify M0` runs them; the `probe` gate starts two short Claude sessions
   (costs a little usage) and the `owner` gate is the user's own approval.

## Step 6 — draft M1, then stop

If the user gave a first-milestone goal, `docs/plan/milestones/M1.md` exists with `status: planned`.
Hand it to the `designer` agent: "Plan M1 from its goal — write cards and specs, keep status planned" (the `/saf-plan` flow).
Show the user the card list and **stop**. Work starts only when the user says Go.

## Re-running

`/saf-setup` can run again at any time to change settings. Files SAF wrote and nobody edited are replaced; edited ones are
archived to `docs/archive/pre-saf/` first. Plan cards, specs and evidence are never deleted.
