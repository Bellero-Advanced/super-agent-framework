# Spec — setup re-run: see what changes first, and never lose your edits

Decision: [D-011](../DECISIONS.md) (decided). Cards: T-M2-20 · T-M2-02 · T-M2-21 · T-M2-22. Builds on
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
6. A file the person names with `--keep <path>` is `keep-edited` whatever its state (edited or not).
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
    dependency; the diff is computed in the engine).
15. `--keep <path>` may repeat or take a comma-separated list. A path that is not a planned rendered file → exit 2
    naming it. `--diff` without `--dry-run` → exit 2 with the usage line.

### The interview (`kit/claude/skills/saf-setup/SKILL.md`)

16. On a re-run (rule 1), after the confirm step and before generating, the skill runs `setup … --dry-run` and shows
    the list. For each `replace-edited` file it asks once: Take the new version — yours is archived to
    `docs/archive/pre-saf/` (recommended) · Keep mine · Show the diff first (runs `--dry-run --diff` and shows that
    file's part, then asks again). Kept files go into `--keep`.
17. Living files that will be kept are listed with one line: your edits stay; the diff shows what the new settings
    would change — port it by hand, or add a decision row when a setting changed.
18. `docs/upgrade.md` and the skill's "Re-running" section say: living files with edits are kept, other edited files
    are archived and replaced unless kept, and `--dry-run` / `--diff` show it first.

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

## 6. Out of scope

- A three-way merge of the person's edits into the new template — the diff shows the change; porting is by hand
- `saf upgrade` regenerating project docs (it still never touches them)
- Changing the first-run adopt behaviour
