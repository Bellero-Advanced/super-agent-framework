# Spec — `task:diff` writes the reviewer's diff file

Decision: [D-020](../DECISIONS.md) (proposed). Card: T-M3-31. Builds on `tokenSaving.reviewerDiff` ("give the reviewer a
diff file") and the review types of [agent-instructions.md](agent-instructions.md).

## 1. Purpose

`tokenSaving.reviewerDiff` tells the main session to give the read-only reviewer a diff file, but SAF has no command
that writes one: in M2 and M3 the main session built it by hand for every card (pick the base, exclude evidence, the
generated files and the engine copies, handle lane cards). The hand-made diffs differed from card to card and sometimes
held the whole engine copy. After this spec `task:diff <id>` writes exactly the files `task:verify` counts as the card's
and prints the path, and the `/saf` review step passes "card id · review types · diff path".

## 2. Rules

1. `task:diff <id>` writes `.saf/memory/review/<id>.diff` in the folder that holds the card's files and prints its
   absolute path. `.saf/memory/` is already git-ignored by setup and always allowed by the plan, so the file never
   counts as a changed file of any card. Each run rewrites the file; nothing else is written.
2. The card must be started (in progress, failed or passed). A card that has not started → exit 2.
3. Where: in the main folder, a main-folder card is read there; a lane card is read in its worktree (`ev.worktree`)
   and the file is written there. In a lane worktree only the lane's own card is accepted — another id → exit 2 naming
   the lane's card. A lane card whose worktree is missing → exit 2 naming `task:start <id> --worktree --resume`.
4. Files: the card's changed files exactly as `task:verify` counts them (`cardFiles` against the files base — the
   start commit, or for a lane the base `task:verify` uses after main was merged in). So the evidence, `STATE.md`,
   `.saf/plan.md`, the friction log, `workflow.alwaysAllowed` paths (engine copies) and the card file are left out,
   and files that were already changed before the start and not touched since are left out.
5. Content: a header of `#` lines — card id and title, base commit, the folder's `HEAD`, the number of files, the
   size (`cardSize`: code and test lines against the caps) — then per file in sorted order a unified diff against the
   base that includes uncommitted work. A new file appears as all added lines, a deleted file as all removed lines, a
   binary file as git's "Binary files differ" line. No changed files → the header and `no changed files`, exit 0.
6. Git runs with argument arrays (no shell string); paths with spaces work; Windows works.
7. Exit 0 written · 1 a git call failed (message names it) · 2 usage errors and refusals (unknown flag, stray word).
8. Wiring: `ENGINE_SCRIPTS` `task:diff` (`config.mjs`), `generate.mjs` `cmd.taskDiff`, the script in this repository's
   and the example's `package.json`; the commands block of the CLAUDE templates (en, th) and this repository's
   `CLAUDE.md` gets one line.
9. `/saf` (`kit/tools-saf/templates/{en,th}/commands/saf.md` and `.claude/commands/saf.md`): with
   `tokenSaving.reviewerDiff` on, the review step runs `task:diff <id>` and gives the `spec-reviewer` the card id, the
   review types of the card (`text`, `data`, `security`, `refactor` — as the agent defines them) and the printed path.
   With it off, the step names the card id and the types only. `docs/card-lifecycle.md` describes the review step the
   same way.

## 3. Data

- Output folder `.saf/memory/review/` — one constant in the new `kit/tools-saf/lib/reviewdiff.mjs`.
- Files and size: `cardFiles`, `cardSize` (`task.mjs`); the lane base: the helper `task:verify` uses (exported from
  `task.mjs` without a behaviour change).

## 4. Edge cases and errors

- A project set up before `.saf/memory/` was ignored: the file is still always allowed by the plan, so verify never
  counts it; `git status` may show it — setup adds the ignore line on the next run.
- A very large diff is written whole; the command prints the size in lines so the main session can decide.
- The command never changes the evidence, so running it before or after `task:review` is the same.

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| RDIFF-AC-01 | a main-folder card in progress that changed a tracked file, added an untracked file and deleted a tracked file; evidence and `STATE.md` also changed; a file dirty before the start and untouched | `task:diff <id>` | `.saf/memory/review/<id>.diff` holds the three card files (new file all added, deleted file all removed) and none of the others; the printed path is absolute; exit 0 | unit |
| RDIFF-AC-02 | an engine-copy path in `workflow.alwaysAllowed` changed by the card's refresh | `task:diff <id>` | that path is not in the diff | unit |
| RDIFF-AC-03 | a lane card with committed and uncommitted work | `task:diff <id>` in the main folder; then in the worktree | the file is written in the worktree with both kinds of work; the same content both times | unit |
| RDIFF-AC-04 | a not-started card · in a lane worktree another card's id · a lane card without its worktree · `--foo` | `task:diff` | exit 2 each, no file written; the third names `--worktree --resume` | unit |
| RDIFF-AC-05 | a started card with no changed files | `task:diff <id>` | the header and `no changed files`; exit 0 | unit |
| RDIFF-AC-06 | a temporary project with `tokenSaving.reviewerDiff` on, then off | render `/saf` (en, th) | on: the review step names `task:diff` and the review types; off: no `task:diff`, types still named | unit |

## 6. Out of scope

- Blocking a merge without a review (T-M3-02 out of scope too).
- Sending the diff anywhere — the file stays local.
