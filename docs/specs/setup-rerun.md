# Spec — setup re-run: see what changes first, and never lose your edits

Decision: [D-011](../DECISIONS.md) (decided). Cards: T-M2-20 · T-M2-02 · T-M2-21 · T-M2-22 · T-M2-27 (rules 19–22) · T-M2-29 (rules 15, 23) · T-M2-30 (rules 24–27) ·
T-M3-16 (rules 28–31) · T-M3-17 (rules 32–34) · T-M3-21 (rules 35–36) · T-M3-23 (rules 18, 38) · T-M3-26 (rule 37, waits for
D-019). Builds on
[upgrade-scripts.md](upgrade-scripts.md) (D-010) for the `package.json` rules.

## 1. Purpose

`/saf-setup` can run again to change settings. Today a re-run archives every file whose content differs from what SAF
wrote and replaces it — including the decision log, the index and the milestone and card files the team has been
working in (an active `M1.md` goes back to the `planned` draft), and it rewrites `package.json` in its own formatting
even when no script is missing. With this spec a re-run keeps the files the team keeps writing in, shows the full list
of what it would do (with a diff) before it writes anything, and lets the person keep any edited file instead of
replacing it.

## 2. Rules

### Terms

1. A **re-run** is a setup run where `.saf/manifest.json` exists (the engine's test in `generate.mjs`; the skill uses
   the same test). A first run (no manifest) keeps today's adopt behaviour unchanged.
2. A rendered file is **edited** when it exists and its text (line endings normalised to LF) differs from the hash the
   manifest records for it, or the manifest has no record of it.
3. **Living files** are rendered files the team keeps writing in after setup. Their path patterns live in one data
   table, `LIVING_FILES` in `kit/tools-saf/lib/generate.mjs`: the decision log, the index, and everything under the
   plan's `milestones/` and `tasks/` folders.

### What a re-run does per file

4. Every planned rendered file gets exactly one action:
   `create` (missing) · `same` (content equal) · `update` (SAF wrote it, unedited, new content differs) ·
   `replace-edited` (edited; archived to `docs/archive/pre-saf/` then written — today's behaviour) ·
   `keep-edited` (edited and kept: not written, not archived).
5. On a re-run an edited living file is always `keep-edited`. An unedited living file is updated as before.
6. A file the person names with `--keep <path>` is `keep-edited` whatever its state (edited or not), as long as it
   exists on disk. A planned file that is missing on disk has nothing to keep: exit 2 naming the path.
7. A `keep-edited` file keeps the manifest entry it had (or none), so the next run still sees it as edited.
8. Files SAF wrote earlier under its agent folders that are no longer planned: `remove` when unedited, `keep-unplanned`
   when edited (today's `retireUnplanned` behaviour, now part of the list).
9. Every kept file (rules 5–6) appears in the setup output as a warning naming the path and saying the new settings
   did not reach it, and in `report.kept`.

### `package.json` on setup

10. Setup adds the engine scripts that are missing and never changes an existing one (as today). It writes
    `package.json` only when it adds a script; otherwise the file stays byte-identical. When it writes, it keeps the
    indentation, key order, line endings, byte-order mark and trailing newline — the same rules as
    [upgrade-scripts.md rules 5–6](upgrade-scripts.md#2-rules), done by **one** function in `generate.mjs` that both
    setup and `saf upgrade` (`src/install.mjs`) call. Setup still creates `package.json` when it is missing (unless
    `stack.packageManager` is `none`).

### Seeing it first

11. `planSetup(root, answers, opts)` in `generate.mjs` returns every action of rules 4–8 plus the merges (`.gitignore`
    lines to add, `package.json` scripts to add and kept, `.claude/settings.json` hooks to add and whether an `env`
    block moves, `saf.config.json` same/update, the adopt archive list on a first run, the regenerated status files)
    and writes nothing: no file, folder or manifest changes, `.saf/` is not created.
12. `generate()` performs the actions `planSetup()` returns for the same root, answers and options — one code path, so
    the list shown is what happens.
13. `saf setup --answers <file> --dry-run` prints that list (one line per path: action · path · reason, then the
    merges), honours `--adopt` / `--no-adopt` / `--keep`, exits 0 and writes nothing. It starts with one line saying
    nothing was written.
14. `--diff` (only together with `--dry-run`) adds, after the list, a unified diff (`--- a/<path>` / `+++ b/<path>`
    headers, hunks with context lines) for every `update`, `replace-edited` and `keep-edited` file and for
    `saf.config.json`. "a" is the file on disk, "b" what setup would write. A file over the line limit prints one line
    with both line counts instead. Context and limit live in `DIFF_LIMITS` in `kit/tools-saf/lib/diff.mjs` (no
    dependency; the diff is computed in the engine). The diff prints whatever the files hold — what the person wrote in
    `CLAUDE.md` and the other rendered files reaches the terminal and, through the skill (rule 16), the chat: secret
    values never belong in those files (`docs/upgrade.md` says so in one line).
15. `--keep <path>` may repeat or take a comma-separated list. A path that is not a planned rendered file → exit 2
    naming it. `--diff` without `--dry-run` → exit 2 with the usage line. `--keep=<path>` (the `=` form) and a `--keep`
    value that holds no path after splitting on commas and trimming (`","`, `" , "`, `""`) → exit 2 with the usage line
    and nothing written: a keep request the CLI cannot read is never ignored.

### The interview (`kit/claude/skills/saf-setup/SKILL.md`)

16. On a re-run (rule 1), after the confirm step and before generating, the skill runs `setup … --dry-run` and shows
    the list. For each `replace-edited` file it asks once: Take the new version — yours is archived to
    `docs/archive/pre-saf/` (recommended) · Keep mine · Show the diff first (runs `--dry-run --diff` and shows that
    file's part, then asks again). Kept files go into `--keep`.
17. Living files that will be kept are listed with one line: your edits stay; the diff shows what the new settings
    would change — port it by hand, or add a decision row when a setting changed.
18. `docs/upgrade.md` and the skill's "Re-running" section say: living files with edits are kept, other edited files
    are archived and replaced unless kept, and `--dry-run` / `--diff` show it first. `docs/upgrade.md` does not promise
    that the plan is "never reset" without the condition: an edited living file is kept, a deleted one is created again
    from the template.

### Settings files are never lost (`planSettings` in `generate.mjs`)

19. A settings file is **unreadable** when it is not valid JSON, or valid JSON whose root is not an object (`null`, an
    array, a string, a number). This holds for `.claude/settings.json` and `.claude/settings.local.json`.
20. When `.claude/settings.json` has an `env` block that moves (as today) and `.claude/settings.local.json` exists but is
    unreadable, setup moves the local file aside to the first free name `archiveDest` gives (the same naming as an
    unreadable `settings.json`, under `ARCHIVE`) before it writes the new local file holding only the moved `env`
    block. The archived copy is byte-identical to the old file. Nothing is written over it and no value is printed.
21. The archived local file may hold secret values, so it must stay untracked: `GITIGNORE_LINES` gains
    `<ARCHIVE>/.claude/settings.local.json*` (built from the `ARCHIVE` and `SETTINGS_LOCAL` constants, not typed twice),
    and setup's `.gitignore` merge adds it.
22. The plan (`planSetup().merges.settings`) carries the local archive target; the dry run's settings line says
    `<local file> not valid JSON, archived to <dest>`; the real run lists it in `report.archived` and adds a warning
    naming both paths. When `settings.json` has no `env` block the local file is not read and stays byte-identical,
    readable or not. An unreadable `settings.json` whose root is valid JSON but not an object is archived like invalid
    JSON (today only a parse failure is).

### Upgrade with a broken config (`upgrade()` in `src/install.mjs`)

23. When `saf.config.json` exists but is not valid JSON, or its root is not an object, `saf upgrade` writes nothing — no
    engine copy, no skill, no command, no `package.json` change, no manifest — and prints one error line naming
    `saf.config.json` and saying nothing was changed, then exits 1. The check runs before the first write.
    `refreshKitFiles` (`generate.mjs`) never renders with default settings in place of an unreadable `saf.config.json`:
    it adds a warning naming the file and refreshes nothing. A missing `saf.config.json` keeps today's behaviour.

### `env` blocks that cannot be merged (`planSettings` in `generate.mjs`)

Today the moved `env` block is spread over the local one (`{ ...local.env, ...settings.env }`): a key both files hold
takes the project value and the local value is gone, and a string or array `env` spreads into index keys (`"abc"` →
`{ "0": "a", "1": "b", "2": "c" }`). These rules replace that.

24. An `env` value is **mergeable** only when it is a plain JSON object. When `.claude/settings.json` has an `env` key
    whose value is anything else (a string, an array, a number, `true`/`false`, `null`), setup archives
    `settings.json` byte-identical to the first free name `archiveDest` gives under `ARCHIVE` (already git-ignored by
    `GITIGNORE_LINES`), writes the new `settings.json` without the `env` key, and **moves nothing**:
    `.claude/settings.local.json` is not read and stays byte-identical (or absent). The warning names both paths and
    says the `env` value is not a JSON object and nothing was moved.
25. When the `env` block of `settings.json` moves (it is mergeable) and `.claude/settings.local.json` is readable
    (rule 19) but its own `env` key holds a value that is not mergeable, setup archives the local file (byte-identical,
    the rule 20 path, git-ignored by rule 21) and writes the new local file as the old file's other keys with `env` set
    to exactly the moved block. The warning names both paths.
26. When both `env` blocks are mergeable, keys only one file holds are combined; for a key both files hold **with
    different values the local value stays** (the local file is the person's machine-specific file). The project
    value is kept by archiving `settings.json` (byte-identical, the rule 24 path) before the new one is written —
    `settings.json` loses its `env` block in every case, so without the archive that value would exist nowhere on
    disk. The warning names the archive path and the number of keys whose local value was kept; it never prints a key's
    value. A key with the same value in both files is not a collision and archives nothing.
27. `planSetup().merges.settings` carries each archive target with its reason; the dry run's settings line names each
    target with that reason (`not valid JSON` · `env is not a JSON object` · `env values differ from
    .claude/settings.local.json`), and the real run lists every archived settings file in `report.archived`. No output
    line, warning or report entry holds an `env` value. `settings.json` is archived at most once per run, whatever the
    number of reasons.

### Setup keeps what it should (`planSetup` · `applySetup` · `refreshKitFiles` in `generate.mjs`)

28. A `same` file (rule 4) is not written: its bytes on disk stay as they are, so a CRLF checkout stays CRLF and the
    dry run's "same" is literally true. (The status files already follow this.)
29. A `keep-unplanned` file keeps its manifest entry, like a `keep-edited` file (rule 7) and like `refreshKitFiles`
    already does, so the next run still sees it as edited instead of forgetting that SAF once wrote it.
30. `.saf/manifest.json` that exists but cannot be read — not valid JSON, a root that is not an object, or `files` that
    is not an object — stops `setup` and `setup --dry-run` before anything is read further or written: one error line
    names the file, says nothing was changed and that it can be restored from git; exit 1. `refreshKitFiles` (upgrade)
    adds a warning naming the file and refreshes nothing. A missing manifest keeps the first-run behaviour (rule 1).
31. `report.kept` holds plain paths only, in setup and in `refreshKitFiles`. Why a file was kept is said by exactly one
    warning per kept path (setup already warns for `keep-edited`; `keep-unplanned` files and the edited files
    `refreshKitFiles` keeps gain theirs).

### Reading the plan, the card template and the skill's re-run test

32. Setup computes the regenerated status files (rule 11) by calling `loadPlan` with a read overlay — the planned
    texts of `docs/plan/` files laid over the files on disk, the files adopt moves aside left out — instead of copying
    `docs/plan` to a temporary folder. No temporary folder is created, so setup does not depend on a writable
    `os.tmpdir()`. `loadPlan(root, config)` without an overlay behaves exactly as today.
33. A file whose name starts with `_` under a living folder (`docs/plan/tasks/_template.md`) is **not** a living file:
    the engine ignores it as a card, it is a template SAF owns, and an edited copy follows rule 4 (archived and
    replaced unless kept with `--keep`) so it receives format updates.
34. The setup skill decides "re-run" with the engine's test (rule 1: `.saf/manifest.json` exists), not by looking at
    `saf.config.json`, so the skill and the engine never disagree about whether the adopt question applies.

### Messages that say what happened (`generate.mjs`)

35. A settings file whose JSON is valid but whose root is not an object is reported as "is not a JSON object" — "not
    valid JSON" is said only for a parse failure — in the warning and the dry-run line. The `settings.json` warning names
    its archive path, like the local file's warning does.
36. The dry run prints the archive target of every `replace-edited` file (`→ <dest>`, the name `archiveDest` gives,
    with its `.1`, `.2` suffix when an older archive exists), as it already does for adopt lines.

### Reinstall into a project that already has a plan (waits for D-019)

37. (Applies once D-019 is decided — the card checks the row.) On a first run (no manifest) where `docs/plan` already
    holds a plan in SAF's shape — `loadPlan` finds at least one milestone — adopt does **not** move anything under
    `docs/plan/` aside: living files there follow rule 5 as if this were a re-run (kept when they differ), evidence and
    other plan files stay where they are (`STATE.md` is regenerated in place as on every run), and the dry run says
    why in one line. Adopt still archives
    the agent folders (`.claude/agents`, `.claude/commands`, `.claude/rules`) as today.

### Skill wording on a re-run (`SKILL.md`)

38. The skill's re-run step says how to pass a `--keep` path that holds spaces (single quotes on macOS and Linux,
    double quotes on Windows), that each dry-run line is action, path and reason separated by spaces (read the reason as
    the text after the path), and names exactly which lines it leaves out when it shows the list (the per-file `same`
    lines; the merges block is shown whole).

## 3. Data

- `LIVING_FILES`, `planSetup`, the package-script merge function: `kit/tools-saf/lib/generate.mjs`
- `DIFF_LIMITS` and the line diff: `kit/tools-saf/lib/diff.mjs`
- CLI flags: the `setup` case in `kit/tools-saf/bin/saf.mjs` · caller of the script merge: `upgrade()` in `src/install.mjs`

## 4. Edge cases and errors

- Invalid answers with `--dry-run` → the same error and exit code as `setup`, nothing written
- `package.json` that is not valid JSON → setup leaves it unchanged with a warning (as today); the dry run shows it
- A CRLF checkout of an unedited file is `same` / unedited (rule 2 normalises line endings)
- A file that is a folder on disk where SAF plans a file → error naming the path (unchanged)
- Keeping `CLAUDE.md` while settings changed leaves it out of date (for example a new model id); `docs:check` then
  reports it — expected, the person chose to keep it
- `--keep` of a planned file that is missing on disk → exit 2 ("nothing to keep"), rule 6
- A path that contains a comma cannot be kept: the comma always splits the list (no planned file has one)
- An absolute `--keep` path is made relative to the project root; a form that names the same place differently (a
  Windows 8.3 short name, macOS `/var/…` while the root is `/private/var/…`) becomes a `../` path and exits 2 as not
  planned — safe, nothing is written; pass the path relative to the project root

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| RERUN-AC-01 | a set-up project; `docs/DECISIONS.md` gets an extra row, `M1.md` is set to `active`, `M0.md` is untouched | setup runs again with the same answers | `DECISIONS.md` and `M1.md` are byte-identical and not in `docs/archive/`; both are in `report.kept` and in a warning; the manifest entries of both are unchanged; an edited `CLAUDE.md` is still archived and replaced | unit |
| RERUN-AC-02 | a set-up project whose `package.json` was re-indented with 4 spaces, every script present; then the same with `task:culprit` removed | setup runs again; then `upgrade` | first case: `package.json` byte-identical; second: `task:culprit` added, 4-space indent and trailing newline kept; `upgrade` uses the same function (UPG-AC tests still pass) | unit |
| RERUN-AC-03 | a set-up project with edits, and an empty folder | `planSetup` and `saf setup --answers … --dry-run` | every file's bytes and the file list are unchanged (no `.saf/` in the empty folder); exit 0; the output starts with the nothing-written line | unit |
| RERUN-AC-04 | a re-run fixture with one file per action (create · same · update · replace-edited · keep-edited · remove · keep-unplanned) | `planSetup`, then `generate` | each path has the expected action, and the real run's written · archived · kept · removed lists equal the plan's | unit |
| RERUN-AC-05 | a re-run with a line added to `CLAUDE.md`; a pair of known texts; a file over the line limit | `--dry-run --diff`; `diffLines(a, b)` | the output has `--- a/CLAUDE.md` / `+++ b/CLAUDE.md` and the added line as a `-` line; the known pair gives the expected hunk; the large file prints one line with both line counts | unit |
| RERUN-AC-06 | a re-run with an edited `CLAUDE.md` | `setup --keep CLAUDE.md`; `--keep nope.md`; `--diff` without `--dry-run` | `CLAUDE.md` unchanged, not archived, manifest entry unchanged, and the next dry run still lists it as edited; the other two exit 2 naming the problem | unit |
| RERUN-AC-07 | `SKILL.md` and `docs/upgrade.md` | the docs test runs | the skill's re-run step runs `--dry-run`, offers take new · keep mine · show the diff, and passes kept files with `--keep`; both files say edited living files are kept | unit |
| RERUN-AC-08 | `settings.json` with an `env` block; `settings.local.json` holding `{ nope` (then `[]`, then `null`) | `planSetup` + `setup --dry-run`; then `generate` | the plan and the dry-run line name the archive target; after the real run the archive is byte-identical to the old local file, the new local file holds exactly the moved `env`, `report.archived` and a warning name both paths, no `env` value appears in the output, and `git check-ignore` matches the archive path with the generated `.gitignore` | unit |
| RERUN-AC-09 | `settings.json` without `env` and an invalid `settings.local.json`; `settings.json` holding `[]` | `generate` | the local file is byte-identical and nothing is archived for it; the `[]` settings file is archived (target in the dry run and `report.archived`) and replaced by an object with the SAF hooks | unit |
| RERUN-AC-10 | a re-run with an edited `CLAUDE.md` | `setup --keep=CLAUDE.md`, `--keep ","`, `--keep " , "`, `--keep ""` (each without and with `--dry-run`) | each exits 2 with the usage line; `CLAUDE.md` is byte-identical, nothing is archived and the manifest is unchanged | unit |
| RERUN-AC-11 | a set-up project whose `saf.config.json` holds `{ nope` (then `[]`); the engine copy, a `/saf` command file and `package.json` recorded byte for byte | `saf upgrade` (`node bin/cli.mjs upgrade --dir …`) | exit 1; one error line names `saf.config.json`; no stack trace; every recorded file is byte-identical and `tools/saf/` is the old copy; `refreshKitFiles` called directly on that project warns naming the file and writes nothing | unit |
| RERUN-AC-12 | `settings.json` `env` `{ A: "p", B: "p2" }`; `settings.local.json` `{ permissions: …, env: { A: "l", C: "l3" } }`; then the same with `A` equal in both files | `planSetup` + `setup --dry-run`; then `generate` | the new local `env` is exactly `{ A: "l", B: "p2", C: "l3" }` and `permissions` is unchanged; `settings.json` is archived byte-identical to the target the plan, the dry-run line (reason "env values differ") and `report.archived` name; the new `settings.json` has no `env`; a warning names the archive path and says one key kept its local value; no `env` value appears in any output, warning or report line; the equal-value case archives nothing | unit |
| RERUN-AC-13 | `settings.json` `env` `"abc"` (then `["x"]`, `5`, `null`) with a valid local file; then `settings.json` `env` `{ A: "p" }` with a local file whose `env` is `"abc"` (then `[]`) and which holds `permissions` | `planSetup` + `setup --dry-run`; then `generate` | case 1: `settings.json` archived byte-identical (target and reason "env is not a JSON object" in the plan, the dry run and `report.archived`), the new `settings.json` has no `env` and holds the SAF hooks, the local file is byte-identical; case 2: the local file archived byte-identical, the new local file is `permissions` plus `env` exactly `{ A: "p" }`; no index key (`"0"`) in any written file; `git check-ignore` matches every archive path with the generated `.gitignore` | unit |
| RERUN-AC-14 | a set-up project; one unedited rendered file converted to CRLF; one SAF-written file under `.claude/rules/` that is no longer planned and was edited (`keep-unplanned`) | setup runs again with the same answers; then a third run | the CRLF file is byte-identical and its action is `same`; the `keep-unplanned` file keeps its manifest entry after the second run and is still `keep-unplanned` (not forgotten, not removed) in the third run's plan | unit |
| RERUN-AC-15 | a set-up project whose `.saf/manifest.json` holds `{ nope` (then `[]`, then `{ "files": [] }`) | `setup --dry-run`; `setup`; `refreshKitFiles` | setup and the dry run exit 1 with one error line naming `.saf/manifest.json`, no stack trace, every file byte-identical and nothing archived; `refreshKitFiles` returns a warning naming the file and writes nothing | unit |
| RERUN-AC-16 | a re-run with an edited living file and a `keep-unplanned` file; an upgrade fixture with an edited `/saf` command | `generate`; `refreshKitFiles` | every entry of both `report.kept` lists is a plain path equal to a file on disk; each kept path has exactly one warning naming it | unit |
| RERUN-AC-17 | a set-up project with cards and evidence; the entries of `os.tmpdir()` recorded | `planSetup`; `generate` | both succeed; the planned `STATE.md` equals the one `task:state` writes for the same plan; no new `saf-plan-*` entry appears in `os.tmpdir()` (listings compared before and after) and `generate.mjs` no longer imports `mkdtempSync`; `loadPlan(root, config)` without an overlay returns the same plan as before | unit |
| RERUN-AC-18 | a re-run where `docs/plan/tasks/_template.md` and `docs/plan/tasks/M1/T-M1-01.md` are both edited | `planSetup` | `_template.md` is `replace-edited` (archive target named) and `T-M1-01.md` is `keep-edited`; with `--keep docs/plan/tasks/_template.md` the template is `keep-edited` | unit |
| RERUN-AC-19 | `kit/claude/skills/saf-setup/SKILL.md` | the docs test runs | the skill's re-run test names `.saf/manifest.json` and no longer decides it from `saf.config.json` | unit |
| RERUN-AC-20 | `settings.json` holding `[]`; a re-run with an edited `CLAUDE.md` while `docs/archive/pre-saf/CLAUDE.md` already exists | `setup --dry-run`; then `generate` | the settings warning and dry-run line say "is not a JSON object" (not "not valid JSON") and the warning names the archive path; the dry-run line of `CLAUDE.md` ends with `→ docs/archive/pre-saf/CLAUDE.md.1` (the name `archiveDest` gives), equal to the real run's `archived:` line | unit |
| RERUN-AC-21 | D-019 decided; a project with `docs/plan/milestones/M1.md`, cards and `docs/plan/evidence/*.json` but no `.saf/manifest.json`, plus an unknown file in `.claude/agents/` | `setup --dry-run`; then `generate` | nothing under `docs/plan/` is archived or moved; evidence and `STATE.md` bytes before the status rewrite are where they were; edited living files are `keep-edited`; the agents file is still adopted; the dry run prints the one-line reason | unit |
| RERUN-AC-22 | `docs/upgrade.md` and `kit/claude/skills/saf-setup/SKILL.md` | the docs test runs | `docs/upgrade.md` says a deleted living file is created again and has no unconditional "never reset"; the skill's re-run step shows the quoting for both shells, says how a dry-run line splits, and names the per-file `same` lines as the ones it leaves out | unit |

## 6. Out of scope

- A three-way merge of the person's edits into the new template — the diff shows the change; porting is by hand
- `saf upgrade` regenerating project docs (it still never touches them)
- Changing the first-run adopt behaviour
- Merging the person's `env` values key by key across machines — rule 26 keeps the local value and archives the project file
