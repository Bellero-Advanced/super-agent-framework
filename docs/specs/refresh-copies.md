# Spec — one command refreshes this repository's engine copies

Decision: [D-020](../DECISIONS.md) (proposed). Card: T-M3-27. Friction: F-001. **This repository only** — `scripts/`
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
   whose bytes differ from the record and that matches neither the card's `touch` nor
   `examples/todo-api/tools/saf/**` is put back to its record: written back with the recorded bytes, or deleted when
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
- An example file the upgrade deletes (a retired skill) is written back when it is outside `touch`.
- The script never runs `git` to restore, so it works the same with a dirty folder, without network, and on Windows.

## 5. Acceptance

The script exposes its steps so tests can replace the two upgrades with a fake that writes files; scenarios run in
temporary folders.

| id | given | when | then | test layer |
|---|---|---|---|---|
| COPIES-AC-01 | a main-folder card in progress whose `touch` lists `examples/todo-api/package.json`; a fake upgrade (b) that changes `examples/todo-api/.claude/commands/saf.md`, `examples/todo-api/package.json` and `examples/todo-api/tools/saf/x.mjs` and creates `examples/todo-api/.claude/skills/new/SKILL.md` | `saf:refresh` | `saf.md` has its old bytes, `new/SKILL.md` is gone, `package.json` and `tools/saf/x.mjs` keep the upgrade's bytes; output lists the two restored paths | unit |
| COPIES-AC-02 | `examples/todo-api/.claude/commands/saf.md` edited before the run (differs from HEAD), not in `touch`; the fake upgrade rewrites it | `saf:refresh` | the file has the edited pre-run bytes, not HEAD's and not the upgrade's | unit |
| COPIES-AC-03 | (1) no card in progress · (2) main folder, only a lane card in progress · (3) argument `--foo` | `saf:refresh` | exit 2 each; no upgrade was called, no file changed; (2) names the lane's worktree | unit |
| COPIES-AC-04 | a lane worktree whose label names card X (`touch` without example files) | `saf:refresh` in the worktree | the card is X; the restore runs on the worktree's example folder | unit |
| COPIES-AC-05 | the state right after COPIES-AC-01 | `saf:refresh` again | no example file is written; output says `nothing to restore` | unit |
| COPIES-AC-06 | copies equal kit except one file that differs only by CRLF · then one file with different content | `saf:refresh -- --check` | first exit 0; second exit 1 naming the file and `npm run saf:refresh`; no file written; no card needed | unit |
| COPIES-AC-07 | a repository path that contains a space | the upgrade steps | each is spawned as `process.execPath` with the arguments `bin/cli.mjs upgrade --dir <path>` as an array (no shell string) | unit |
| COPIES-AC-08 | this repository | read `package.json` and `saf.config.json` | `saf:refresh` is `node scripts/refresh-copies.mjs`; `workflow.mergeChecks[0]` is `npm run saf:refresh -- --check` | unit |

## 6. Out of scope

- Any product command (`task:*`) for refreshing — users have no `kit/`.
- The `.gitignore` lines that must match here and in the example (F-006) — a later card if it recurs.
- Re-rendering this repository's agent files or CLAUDE.md (setup re-run, not upgrade).
