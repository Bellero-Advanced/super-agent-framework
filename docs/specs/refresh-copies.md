# Spec — one command refreshes this repository's engine copies

Decision: [D-020](../DECISIONS.md). Cards: T-M3-27 (rules 1–11) · T-M3-33 (rules 12–18). Friction: F-001 · F-009. **This repository only** — `scripts/`
is not in the `files` list of `package.json`, so nothing here ships to users.

## 1. Purpose

Every card that changes `kit/` must refresh three copies — this repository's install (`tools/saf/`, the setup skill,
`/saf` commands and skills), the example's engine (`examples/todo-api/tools/saf/`) — and then put back by hand the
example files the card does not own (`examples/todo-api/.claude/**`, `examples/todo-api/package.json`). M2 and M3
repeated those three steps in about sixty card prompts, and a forgotten restore failed `task:verify` (files outside
`touch`). After this spec `npm run saf:refresh` does all three, decides from the card in progress which example files
to keep, and `npm run saf:refresh -- --check` tells in a second whether the copies equal `kit/`.

## 2. Rules

1. `package.json` script `saf:refresh` runs `node scripts/refresh-copies.mjs`. With no argument it runs, in order:
   (a) `node bin/cli.mjs upgrade --dir .`, (b) `node bin/cli.mjs upgrade --dir examples/todo-api`, (c) the restore of
   rule 4. Both upgrades are spawned as `process.execPath` with an argument array — no shell — so paths with spaces
   and Windows work. Nothing touches the network (no install, no fetch).
2. The card in progress decides what the example keeps. In a lane worktree it is the card of the lane label
   (`laneFolder` of the engine). In the main folder it is the one main-folder card in progress (`activeCards` without
   lane evidence). The script reads the plan through the engine in `kit/tools-saf/lib/` (the source of truth).
3. Refused with exit 2 and **nothing written** (no upgrade runs):
   - no card in progress in this folder — the message says that a refresh outside a card is done with the two
     upgrade commands of rule 1 by hand;
   - the main folder, while every card in progress is a lane card — the message names each lane's worktree;
   - the plan has problems (`task:state --check`) or the lane label does not match (the engine's own refusal text);
   - an argument the script does not define (anything but `--check`).
4. Restore: before step (b) the script records the bytes of every file under `examples/todo-api/` except
   `examples/todo-api/tools/saf/**` and `node_modules/` (absent files recorded as absent). After step (b), every file
   whose bytes differ from the record and that matches neither the card's `touch` nor the example files SAF owns
   (rule 12) is put back to its record: written back with the recorded bytes, or deleted when
   it did not exist before. Files that match `touch` keep the upgrade's result. The record is the state **before
   this run**, not `HEAD` — work already in the folder is never lost.
5. The root copies of step (a) are never restored: refreshing this repository's own install is the point. A root file
   the upgrade changes outside `touch` shows in `task:verify` as today (the designer adds it to the card).
6. Output: one line per step, then `restored: <n>` with each restored path (or `nothing to restore`), then the result
   of the check of rule 8.
7. A second run right after the first writes nothing in the example and prints `nothing to restore` (idempotent).
8. `--check` writes nothing and needs no card. It compares, ignoring CRLF/LF differences (as `test/unit/dogfood.test.mjs`
   does), `kit/tools-saf/` with `tools/saf/` and with `examples/todo-api/tools/saf/`, and
   `kit/claude/skills/saf-setup/` with `.claude/skills/saf-setup/`: the same file list and the same content. Same →
   exit 0 with one line; different → exit 1, each missing, extra or differing file listed (at most twenty, then a count)
   and the fix `npm run saf:refresh`.
9. If an upgrade exits non-zero the script stops, still applies the restore of rule 4 to what step (b) changed, and
   exits 1 naming the step.
10. This repository's `saf.config.json` lists `npm run saf:refresh -- --check` as the **first** `workflow.mergeChecks`
    entry, so a merge with stale copies stops in seconds instead of after the full suite. Cards that change `kit/`
    list `npm run saf:refresh -- --check` in "Done when" (CLAUDE.md, "This repository is SAF itself"), so the lane's
    `task:verify` fails loudly too.
11. `CLAUDE.md` and `CONTRIBUTING.md` describe the one command (CONTRIBUTING keeps the words
    `upgrade --dir examples/todo-api`, which `test/unit/doc-languages.test.mjs` checks).

### Generated files stay equal to the templates (T-M3-33, F-009)

Why they drifted: the root `.saf/manifest.json` that step (a) rewrites was reverted by hand on every card (it was
outside `touch`), so its hashes for `.claude/commands/*` are old, and the upgrade keeps those files as "edited in this
project"; in the example the restore of rule 4 put back every `.claude/**` file the example's upgrade refreshed.

12. Example files SAF owns: `examples/todo-api/tools/saf/**`, `examples/todo-api/.claude/commands/**`,
    `examples/todo-api/.claude/skills/**`, `examples/todo-api/.claude/agents/**`, `examples/todo-api/CLAUDE.md` and
    `examples/todo-api/.saf/manifest.json` are one list in the script's table. The restore (rule 4) never touches
    them, and every entry is also in this repository's `workflow.alwaysAllowed`, so kit cards do not list them in
    `touch`. Every other example file (for example `examples/todo-api/.claude/settings.json`, `package.json`) is
    restored as before.
13. Example re-render: after step (b) and before the restore, the script runs the engine's `planSetup`
    (`kit/tools-saf/lib/generate.mjs`) on the example with the example's `saf.config.json`. For each planned action
    whose path is `CLAUDE.md` or under `.claude/agents/` and whose action is `update` (generated by SAF and not
    edited since — the example manifest holds the file's hash), it writes the planned content and records the new
    hash in `examples/todo-api/.saf/manifest.json` under the same key, with the hash function setup uses. Nothing
    else is written: `same` is skipped, `keep-edited` / `replace-edited` are left and printed as
    `kept (edited): <path>`, other paths are not touched. Output line: `example re-rendered: <n>`. This is the
    example as a separate SAF project: its edited files are never overwritten.
14. This repository's `workflow.alwaysAllowed` lists `.saf/manifest.json`, so the hashes step (a) records are
    committed with the card instead of being reverted by hand (review note C9, the root half of F-007). Then the
    upgrade keeps a `.claude/commands/*` or `.claude/skills/*` file only when someone really edited it.
15. Sync test, this repository's commands and skills: `planSetup` on this repository plans `same` for every
    `.claude/commands/*` and `.claude/skills/*` file it renders, and `.saf/manifest.json` records for each of them the
    hash of the file as it is now.
16. Sync test, this repository's `CLAUDE.md`: the lines of the first ```` ```bash ```` block under the heading
    `## Commands`, each with runs of spaces collapsed to one and trailing spaces removed, equal the same block of
    `planSetup`'s rendering of `CLAUDE.md` for this repository (same lines, same order). **Not checked:** every other
    line of `CLAUDE.md` — the owner edits it (rules, "This repository is SAF itself", wording) — and the column the
    `#` comments align to. On failure the test prints the rendered block. A kit card that changes the commands block
    of the CLAUDE templates therefore lists `CLAUDE.md` in `touch`.
17. Sync test, the example: `planSetup` on `examples/todo-api` plans no `update` for `CLAUDE.md`,
    `.claude/commands/*`, `.claude/skills/*` or `.claude/agents/*`.
18. Rule 7 still holds: a second run right after the first re-renders nothing (`example re-rendered: 0`) and restores
    nothing.

## 3. Data

- The example folder, the excluded globs and the compared folder pairs are one table at the top of
  `scripts/refresh-copies.mjs` (data, not logic); `test/unit/dogfood.test.mjs` keeps its own pairs and is not changed.
- Card, lane and plan: `kit/tools-saf/lib/plan.mjs` (`loadPlan`, `activeCards`) · `task.mjs` (`laneFolder`) ·
  `glob.mjs` (`globToRegExp`, the same touch matching `task:verify` uses).

## 4. Edge cases and errors

- Why not a check inside `task:verify` (product engine): users have no `kit/`; the check belongs to this repository,
  so it is a merge check here plus a "Done when" line on kit cards (rule 10).
- A card whose `touch` lists `examples/todo-api/.claude/**` keeps those files (rule 4) — the card decides.
- A file in the example that was already edited before the run and that the upgrade does not change is untouched; one
  the upgrade changes is put back to the edited bytes, not to `HEAD`.
- An example file the upgrade deletes is written back when it is outside `touch` and not an example file SAF owns
  (rule 12); a retired skill under `examples/todo-api/.claude/skills/` stays deleted.
- An example agent file someone edited (manifest hash differs) is kept and printed `kept (edited)`; it never becomes
  `update` again until setup is re-run, so the sync test of rule 17 accepts it.
- The example's `saf.config.json` invalid: `planSetup` throws → the script stops, still runs the restore, exits 1
  naming the re-render step (as rule 9).
- The script never runs `git` to restore, so it works the same with a dirty folder, without network, and on Windows.

## 5. Acceptance

The script exposes its steps so tests can replace the two upgrades with a fake that writes files; scenarios run in
temporary folders.

| id | given | when | then | test layer |
|---|---|---|---|---|
| COPIES-AC-01 | a main-folder card in progress whose `touch` lists `examples/todo-api/package.json`; a fake upgrade (b) that changes `examples/todo-api/.claude/settings.json`, `examples/todo-api/package.json` and `examples/todo-api/tools/saf/x.mjs` and creates `examples/todo-api/docs/new.md` | `saf:refresh` | `settings.json` has its old bytes, `docs/new.md` is gone, `package.json` and `tools/saf/x.mjs` keep the upgrade's bytes; output lists the two restored paths | unit |
| COPIES-AC-02 | `examples/todo-api/README.md` edited before the run (differs from HEAD), not in `touch`; the fake upgrade rewrites it | `saf:refresh` | the file has the edited pre-run bytes, not HEAD's and not the upgrade's | unit |
| COPIES-AC-03 | (1) no card in progress · (2) main folder, only a lane card in progress · (3) argument `--foo` | `saf:refresh` | exit 2 each; no upgrade was called, no file changed; (2) names the lane's worktree | unit |
| COPIES-AC-04 | a lane worktree whose label names card X (`touch` without example files) | `saf:refresh` in the worktree | the card is X; the restore runs on the worktree's example folder | unit |
| COPIES-AC-05 | the state right after COPIES-AC-01 | `saf:refresh` again | no example file is written; output says `nothing to restore` | unit |
| COPIES-AC-06 | copies equal kit except one file that differs only by CRLF · then one file with different content | `saf:refresh -- --check` | first exit 0; second exit 1 naming the file and `npm run saf:refresh`; no file written; no card needed | unit |
| COPIES-AC-07 | a repository path that contains a space | the upgrade steps | each is spawned as `process.execPath` with the arguments `bin/cli.mjs upgrade --dir <path>` as an array (no shell string) | unit |
| COPIES-AC-08 | this repository | read `package.json` and `saf.config.json` | `saf:refresh` is `node scripts/refresh-copies.mjs`; `workflow.mergeChecks[0]` is `npm run saf:refresh -- --check` | unit |
| COPIES-AC-09 | a main-folder card whose `touch` lists no example file; a fake upgrade (b) that changes `examples/todo-api/.claude/commands/saf.md` and `examples/todo-api/.saf/manifest.json` and creates `examples/todo-api/.claude/skills/new/SKILL.md` | `saf:refresh` | all three keep the upgrade's bytes; the restored list names none of them | unit |
| COPIES-AC-10 | a temporary copy of the example whose `CLAUDE.md` and `.claude/agents/implementer.md` are unedited (manifest hash = file) but older than the rendering, and whose `.claude/agents/designer.md` was edited (hash differs); the fake upgrades write nothing | `saf:refresh` | `CLAUDE.md` and `implementer.md` equal `planSetup`'s content and the manifest holds their new hashes; `designer.md` is unchanged; output has `kept (edited): .claude/agents/designer.md` and `example re-rendered: 2` | unit |
| COPIES-AC-11 | the state right after COPIES-AC-10 | `saf:refresh` again | no example file is written; output has `example re-rendered: 0` and `nothing to restore` | unit |
| COPIES-AC-12 | this repository | read the script's table and `saf.config.json` | every example glob SAF owns (rule 12) and `.saf/manifest.json` are in `workflow.alwaysAllowed` | unit |
| COPIES-AC-13 | this repository | `planSetup` dry plan | every `.claude/commands/*` and `.claude/skills/*` action is `same`, and `.saf/manifest.json` holds the hash of each of those files as it is now | unit |
| COPIES-AC-14 | this repository's `CLAUDE.md`, and the same file with one line of its Commands block removed | compare the Commands block with `planSetup`'s rendering (rule 16) | the real file is equal; the copy with the removed line is not, and the message prints the rendered block | unit |
| COPIES-AC-15 | `examples/todo-api` | `planSetup` dry plan | no `update` action for `CLAUDE.md`, `.claude/commands/*`, `.claude/skills/*`, `.claude/agents/*` | unit |

COPIES-AC-01 and AC-02 were reworded by T-M3-33 (rule 12 now keeps `.claude/commands/**` and `.claude/skills/**`):
they still pass on the restore code — the behaviour for files SAF does not own is unchanged. AC-09 … AC-15 fail on
the code before T-M3-33: the restore puts back AC-09's files; AC-10/11's re-render and its output do not exist;
`alwaysAllowed` lacks the globs (AC-12); the root manifest holds old hashes for `.claude/commands/saf.md` and
`saf-plan.md` (AC-13); `CLAUDE.md` misses the `task:culprit` line and has an older `task:review` comment (AC-14);
the example plans `update` for `CLAUDE.md`, both commands and three agents (AC-15).

## 6. Out of scope

- Any product command (`task:*`) for refreshing — users have no `kit/`.
- The `.gitignore` lines that must match here and in the example (F-006) — a later card if it recurs.
- Re-rendering this repository's agent files or `CLAUDE.md` (setup re-run, not upgrade): the agents are kept equal by
  AGENT-AC-03, the `CLAUDE.md` Commands block by rule 16; this repository's `CLAUDE.md` is never written by the script.
- Re-rendering the example's other generated docs (`docs/DECISIONS.md`, `docs/plan/README.md`, templates) — they are
  project docs a real user refreshes by re-running setup.
