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
whether this is an existing project (`adopt`). Use these as the recommended defaults below. Then check whether `.saf/manifest.json` exists
(the engine's own test for a re-run — not the shape of `saf.config.json`). If it exists this is a **re-run**: read
`saf.config.json`, use its values as the defaults instead and say so.

## Step 1 — interview (AskUserQuestion, grouped, ≤ 4 questions per call)

The full question list, the config key each answer sets, and the recommended defaults are in
[questions.md](questions.md). Ask the groups in this order and skip questions whose answer is already certain from
detection (say what you detected instead):

1. **Language and people** — chat language · document language · owner title · UI languages / i18n
2. **Project** — name + one-line pitch + users/market (one free-text message) · type · stage · rigor
3. **Stack** — package manager · confirm the detected commands · database · monorepo / submodules
4. **Models** — preset (Max · Balanced · Economy · Custom) · default session model
5. **Roles and skills** — optional roles (multi-select) · custom role? · report language · optional skill packs (multi-select)
6. **Workflow** — parallel lanes on/off and caps · side lanes on/off and how many at a time · **test mode** (how often the full suite runs — explain the modes from the `choices --group 6` output, shown as printed (see below), recommend `milestone`) and the command that runs only some test files · measure lock · performance budgets file
7. **Policies** — push · deploy (target, exceptions) · protected / auto-deploy branches · forbidden and owner-only paths · external services allowed · env file names
8. **Token saving** and **first milestone goal** (free text: "what should work at the end of the first milestone?")

Test mode and the two lane caps are per-machine choices. The untracked `saf.config.local.json` may hold `workflow.testMode`,
`workflow.lanes.code` and `workflow.sideLanes.max` and nothing else (the engine refuses anything outside `LOCAL_KEYS`,
`$schema` and `workflow.lanes.main` included). When the person says their machine is slow (or fast), offer to write the
test mode there, for example `{ "workflow": { "testMode": "<mode>" } }`; when they say it is weak or strong, offer to write a
code-lane cap (`workflow.lanes.code`, at most `LANE_CEILING` in `config.mjs`) or a side-card cap (`workflow.sideLanes.max`)
there. The installer already git-ignores that file, so it is also absent inside a lane worktree. `SAF_TEST_MODE` sets the
test mode for one shell; lane caps have no environment variable. None of this changes generated files.

**Before each group**, run `node tools/saf/bin/saf.mjs choices --group <g> --lang <chat language>` (`<g>` is `1` to `8`;
`<chat language>` is `en` or `th`, the language the person picked). Group 1 starts with the bilingual chat-language
question, so run it for group 1 right after that answer and before the other group-1 questions. The output has, for each
question, its keys and for each option four lines: what it is · good for · cost · pick it when (the rigor and preset
options also carry the values they derive). Then:

- Show each question's options as a compact table with the columns option · what it is · good for · cost · pick it when,
  with the text exactly as printed — do not rewrite or shorten it. One printed entry can cover several options
  (`- pnpm · npm · yarn · bun`): give each of them a row. A question with no options (a typed value) gets its one
  explanation as four short lines instead of a table. Identity questions (names, pitch, owner title, time zone, goal) print
  nothing: ask them without an explanation.
- When an option prints derived values under its four lines (card sizes, test caps, review and merge checks for a rigor;
  planner and builder models for a preset), add them as one line under that option's row, as printed.
- Put the "pick it when" line of each option in its AskUserQuestion option description, as printed.
- A question you skip because detection made the answer certain: say what was detected. Offer its explanation only when the
  person asks for it.

**Keep the old docs as history (adopt)** — after group 8 run `node tools/saf/bin/saf.mjs choices --group flow --lang <chat language>`.
When `detect` reported `adopt: true` and this is not a re-run, ask the `adopt` question explicitly: "keep the old docs as
history?" — Yes (recommended) · No — and show the `adopt` explanations from that output as above. A new project
(`adopt: false`) or a re-run skips the question: say so in one line and treat the answer as "no". The `commit` explanation
from the same output is shown in Step 5.

Free-text answers (name, pitch, users, goal, paths, services): ask them in one plain message per group, listing what you
already know, instead of forcing them into options.

## Step 2 — confirm

1. Show a compact summary table of every setting (group · setting · value).
2. Run `node tools/saf/bin/saf.mjs choices --not-asked --lang <chat language>` and show its output as printed: the settings
   the interview did not ask, where each is changed later, and the per-machine switches.
3. Ask once: "Generate with these settings?" with options: Generate (recommended) · Change an answer · Adjust a setting that
   was not asked.
   - Change an answer: ask which one, update it, show the changed rows and ask again.
   - Adjust a setting that was not asked: ask for the keys and values in one plain message (dotted keys from the list above),
     add them to the answers you write to `.saf/setup-answers.json` in Step 3, and ask again. `setup` still checks them
     against the schema. The per-machine block of the list is not a setup answer: for `SAF_TEST_MODE` or
     `saf.config.local.json` follow the paragraph about per-machine choices under Step 1 (the file holds only the three keys named there).

## Step 3 — generate

1. Write the answers as JSON to `.saf/setup-answers.json` (shape = `tools/saf/schema/saf.config.schema.json`; include
   only keys the user decided or that differ from defaults — the engine fills the rest).
2. Run `node tools/saf/bin/saf.mjs setup --answers .saf/setup-answers.json` with exactly one adopt flag: `--adopt` when the
   person said yes to keeping the old docs as history, `--no-adopt` when they said no or the question was skipped. Say why
   in one line: without a flag `setup` falls back to detection and would archive an existing project's files even after a "no".
   **On a re-run** (`.saf/manifest.json` exists) do the "Before generating on a re-run" steps below first, and add one
   `--keep <path>` per file the person chose to keep to this command.
3. Read the output: list archived files (they moved to `docs/archive/pre-saf/`, nothing was deleted) and warnings.

**Before generating on a re-run** (only when `.saf/manifest.json` exists; skip for a new setup):

1. Write `.saf/setup-answers.json` (step 1 above), then run
   `node tools/saf/bin/saf.mjs setup --answers .saf/setup-answers.json <adopt flag> --dry-run` with the same adopt flag as
   the real run. It writes nothing. Show the list as printed, without the `same` lines.
   If the list has no `replace-edited` line, skip steps 2 and 5: nothing needs a decision; go on with step 4 and generate.
2. For each `replace-edited` line (a file someone edited, or SAF did not write) ask once with AskUserQuestion. One call
   holds up to 4 questions, so batch the files 4 at a time, and offer "take the recommendation for all the rest":
   - **Take the new version — yours is archived to `docs/archive/pre-saf/` (recommended)**
   - **Keep mine**
   - **Show the diff first** — run the same command with `--dry-run --diff` added, show only that file's part (from its
     `--- a/<path>` line to the next `--- a/` line or the end of the output; a removed line that starts with `--` prints as
     `----`, so match `--- a/` exactly). A file over the line limit prints one line `<path>: too large to diff — …` with no
     `--- a/` header: show that line and say the diff is too large. Then ask the same question again with the first two options.
3. Every file answered "Keep mine" goes to the real run as `--keep <path>`, written exactly like that: a space, then the
   path as the list printed it. Never `--keep=<path>` — the CLI silently ignores that form and the file would be
   archived and replaced. Repeat `--keep` per file (or give one comma-separated list). A path must be a file the dry run
   planned and that exists; anything else exits 2. `--diff` works only together with `--dry-run`.
4. List every `keep-edited` file (living files: decision log, index, milestone and card files) with one line: your edits
   stay; the diff shows what the new settings would change — port it by hand, or add a decision row when a setting changed.
   Do not ask about these.
5. Run the dry run again with the `--keep` flags to confirm: each kept file shows `keep-edited`. Then generate. If a `--keep` run exits 2 (for example the
   file vanished meanwhile), drop that path, run the dry run again, and tell the person.

## Step 4 — self-checks (real runs, report real results)

Run with the project's package manager (the commands are in the generated `CLAUDE.md`):

- `task:state --check` · `docs:check` · `check-secrets`
- `node tools/saf/bin/saf.mjs hook session-start` — show the user the summary every new session will receive

Fix what they report by re-running setup with corrected answers — never by editing generated files.
Rule warnings "paths match no file yet" are fine for a new project.

## Step 5 — first commit and the M0 card

1. Show the `commit` explanation from `choices --group flow` (Step 1), then ask: "Commit the SAF setup locally now?
   (recommended — the card loop compares files against a commit)". Never push.
2. After the commit: `task:start T-M0-01` → `task:verify T-M0-01` → `task:state --check`. Report the verify result with its numbers.
3. Mention the remaining M0 gates: `task:verify M0` runs them; the `probe` gate starts two short Claude sessions
   (costs a little usage) and the `owner` gate is the user's own approval.

## Step 6 — draft M1, then stop

If the user gave a first-milestone goal, `docs/plan/milestones/M1.md` exists with `status: planned`.
Hand it to the `designer` agent: "Plan M1 from its goal — write cards and specs, keep status planned" (the `/saf-plan` flow).
Show the user the card list and **stop**. Work starts only when the user says Go.

## Re-running

`/saf-setup` can run again at any time to change settings. It detects a re-run by `.saf/manifest.json`. Files SAF wrote
and nobody edited are replaced. Your edited decision log, index, milestone and card files (living files) are kept as they
are, and the run lists them as kept. Any other edited file is archived to `docs/archive/pre-saf/` and replaced, unless you
keep it. Before anything is written, `setup --dry-run` lists every change, and `--dry-run --diff` shows each one as a
diff; you decide per edited file (take the new version · keep mine · show the diff first). Plan cards, specs and evidence
are never deleted.
