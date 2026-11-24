# Spec — friction log (the workflow notes where it got in the way)

Decision: [D-017](../DECISIONS.md) (proposed). Cards: T-M3-01 (log, commands, session count) · T-M3-07 (triage in the
report, card drafts) · T-M3-08 (self-fix cards). Review rounds that feed it: [review-rounds.md](review-rounds.md).

## 1. Purpose

SAF is built with SAF. When the framework itself gets in the way of a card — a review bounces because of a gap in SAF,
an engine command fails or misbehaves, a document contradicts the code, an agent has to work around the workflow —
that fact is lost today unless someone writes a review note by hand. The friction log is one append-only file where
every such event is recorded with its evidence, so the milestone end can turn recurring friction into cards, and small
proven bugs can be fixed at once (self-fix, D-017). It ships in the engine, so every SAF project gets it; in this
repository it is how SAF finds its own problems.

## 2. Rules

### The file

1. The log is `docs/plan/friction.md` (`FRICTION_FILE` in `kit/tools-saf/lib/friction.mjs`). It does not exist until
   the first entry; `task:friction add` creates it with a short header (title, one paragraph saying what belongs here
   and that lines are never edited or removed) and the marker line `<!-- entries: append only -->`.
2. Below the marker every non-blank line is either an **entry** or a **closing line**; lines above it are free text.
   - entry: `- F-<nnn> · <YYYY-MM-DD> · <kind> · <card id or -> · <area> · <summary> · evidence: <evidence>`
   - closing: `- F-<nnn> → <carded|fixed|dropped> · <YYYY-MM-DD> · <card id, or the reason for dropped>`
3. Kinds are the values of `FRICTION_KINDS` (`friction.mjs`): `review-bounce` (a spec review failed because of a gap
   in SAF, not in the card's work) · `command-failed` (an engine command failed, crashed or did the wrong thing) ·
   `doc-drift` (a document, card or template contradicted the code) · `workaround` (the work needed a step the
   workflow does not support, e.g. restoring files by hand after a command).
4. `area` is one short token naming where the friction lives — an engine command (`task:merge`), a file path
   (`kit/tools-saf/lib/task.mjs`) or a document (`docs/plan/README.md`). Entries with the same kind and area form a
   **group** (used by triage, rules 15–17).
5. Ids are `F-` plus at least three digits, unique and increasing in file order; `add` uses the highest id + 1. A
   closing line names an id that appears above it. Text fields contain no ` · ` and no line break.
6. Status of an entry = its last closing line: none → `open` · `carded` → `carded` · `fixed` → `fixed` · `dropped` →
   `dropped`. Nothing ever edits or removes a line; a mistake is corrected by a new closing line (`dropped`, reason)
   and, if needed, a new entry.

### Commands (main folder only)

7. `task:friction add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…>` appends one entry dated
   today in `people.timeZone` and prints its id. Refused (exit 1, nothing written): unknown kind · empty area,
   evidence or summary · a text field with ` · ` or a line break · `--card` that is not a card id of the plan.
8. `task:friction close <F-id> carded|fixed|dropped <card id or reason…>` appends one closing line. `carded` and
   `fixed` need a card id of the plan; `dropped` needs a reason. Closing an unknown id, or an entry that is already
   `fixed` or `dropped`, is refused.
9. `task:friction` (no sub-command) prints the open and carded entries, one line each, then the counts per status.
10. Inside a lane worktree `add` and `close` are refused with the main-folder command to run instead (two lanes
    appending to one file would conflict at merge). Agents in a lane put a `friction:` line in their report; the main
    session records it.
11. `add` and `close` only write the file; they never commit. The main session commits the file on its own
    (`git commit -m "chore(plan): friction F-<nnn>" -- docs/plan/friction.md`) before the next `task:merge`.
12. `docs/plan/friction.md` is always allowed for every card (`alwaysAllowed` in `plan.mjs`): appending an entry while
    a card is in progress never counts as a file outside its `touch`.

### Plan checks and the session summary

13. `loadPlan` reads the log; a line below the marker that is neither an entry nor a closing line, a duplicate or
    decreasing id, an unknown kind, or a closing line for an unknown id is a plan issue (so
    `task:state --check` fails and names the line number).
14. The session-start summary shows one line when the log has open or carded entries:
    `Friction: <open> open · <carded> carded — <task:friction command>`; no line when both are zero or the file is
    missing.

### Triage at milestone end (T-M3-07)

15. `task:report <M>` adds a section "Friction" after the gates: every open and carded entry (id · kind · card · area ·
    summary), then a "Brief for the designer" table with one row per group (kind · area · count · ids · the newest
    evidence). A group with at least `FRICTION_LIMITS.recurring` (`friction.mjs`) open entries is marked recurring.
    No entries → one line saying so.
16. `task:friction draft` prints, for each recurring group and each open entry whose kind is in `SELF_FIX_KINDS` while
    `workflow.selfFix` is `on` (self-fix candidates — rule 19 checks the rest on the written card), a card draft in the format of `docs/plan/tasks/_template.md`: id `T-M<n>-??` (the active milestone, or the next
    planned one), title from the summaries, `size: S`, `self_fix: F-<nnn>` on self-fix candidates, the evidence lines under
    "Why", `touch` and "Done when" left as `TODO` lines. It prints to stdout only and writes nothing.
17. Nothing in the engine adds a card to a plan file. Drafts become cards only when the designer writes them (the
    milestone needs the owner's Go) or through the self-fix path (rules 18–22).

### Self-fix cards (T-M3-08)

18. New setting `workflow.selfFix`: `off` (product default) · `on` (this repository). A card may carry
    `self_fix: F-<nnn>` in its frontmatter.
19. A self-fix card is valid only when: `workflow.selfFix` is `on` · the entry exists and is `open`, or `carded` to this
    card · its kind is in `SELF_FIX_KINDS` (`friction.mjs`) · the card is size S · its milestone is the active one ·
    its `touch` holds at least one test file and a "Done when" command names that test file · the milestone holds no
    more self-fix cards than `SELF_FIX_LIMITS.perMilestone` (`friction.mjs`). Any other `self_fix` card is a plan
    issue naming the broken condition.
20. With `workflow.selfFix: on` the main session may, without asking the owner, write such a card (from
    `task:friction draft`) and append its id to the active milestone's `cards:` — only that one line in the milestone
    file. It then runs `task:friction close <F-id> carded <card id>` and the normal card loop; the test is written
    first and must fail on the start commit (`tdd` skill; the spec-reviewer checks that the test exercises the
    friction's evidence).
21. When a self-fix card passes `task:verify` in the main folder, or a self-fix lane card is merged by `task:merge`,
    the engine appends `- F-<nnn> → fixed · <date> · <card id>` to the main folder's log (never inside a lane).
22. Any friction that does not qualify (another kind, size M, cap reached, selfFix off) waits for the designer and the
    owner's Go — the generated `/saf` command says so.

## 3. Data

- `FRICTION_FILE`, `FRICTION_KINDS`, `FRICTION_LIMITS`, `SELF_FIX_KINDS`, `SELF_FIX_LIMITS`, the entry and closing
  patterns, `parseFriction`, `appendEntry`, `appendClose`: `kit/tools-saf/lib/friction.mjs`
- `alwaysAllowed`, plan issues, `self_fix` card field: `kit/tools-saf/lib/plan.mjs`
- Session line and report labels (en, th): `kit/tools-saf/lib/text.mjs`
- `workflow.selfFix`: schema `kit/tools-saf/schema/saf.config.schema.json` · `config.mjs` defaults · `choices.mjs`
  not-asked line (en, th)
- Script `task:friction`: `ENGINE_SCRIPTS` in `config.mjs`

## 4. Edge cases and errors

- File missing: `task:friction` prints "no friction recorded", the session summary shows nothing, the report says so.
- File edited by hand: allowed when lines keep the format; a broken line is a plan issue (rule 13), never silently
  skipped.
- Same event reported twice: the second gets its own id; the designer drops one with a reason.
- Closing line written in a lane by hand and merged: valid if it parses — the lane refusal (rule 10) only guards the
  commands.
- A self-fix card abandoned (`task:abandon`): the entry stays `carded`; the main session closes it `dropped` with the
  reason or carded again later.

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| FRIC-AC-01 | a project with no friction file | `task:friction add --kind workaround --area task:merge --evidence "…" summary` | the file is created with header and marker, the entry line has id F-001, today's date and every field; a second add gets F-002 | unit |
| FRIC-AC-02 | a log with entries | `add` with an unknown kind, an empty evidence, a field containing ` · `, or `--card T-M9-99` | exit 1, the file is byte-identical | unit |
| FRIC-AC-03 | an open entry F-001 | `close F-001 carded <card>` then `close F-001 fixed <card>` then `close F-001 dropped x` | two closing lines appended, status fixed, the third is refused | unit |
| FRIC-AC-04 | a log with a malformed line, a duplicate id or a closing line for an unknown id below the marker | `loadPlan` / `task:state --check` | one plan issue per problem with the line number | unit |
| FRIC-AC-05 | a log with two open and one carded entry | the session-start summary is built | it shows `Friction: 2 open · 1 carded` with the command; with no file it shows no friction line | unit |
| FRIC-AC-06 | a lane worktree | `task:friction add …` | refused with the main-folder command; nothing written | unit |
| FRIC-AC-07 | a card in progress and an entry appended | `task:verify` of that card | `docs/plan/friction.md` is not reported outside `touch` | unit |
| FRIC-AC-08 | a log with a recurring group and a single entry | `task:report <M>` | the Friction section lists both, the brief marks the group recurring with its count and ids | unit |
| FRIC-AC-09 | the same log | `task:friction draft` | one draft per recurring group and per self-fix-eligible entry, valid frontmatter shape, `self_fix` only on eligible ones; no file written | unit |
| FRIC-AC-10 | `workflow.selfFix: on` and self-fix cards breaking each condition of rule 19 in turn | `loadPlan` | one plan issue naming the condition; a card meeting all conditions has none; with `selfFix: off` every `self_fix` card is an issue | unit |
| FRIC-AC-11 | a valid self-fix card (main folder) and a self-fix lane card | `task:verify` passes / `task:merge` succeeds | the main log gains `F-<nnn> → fixed · <date> · <card>`; a failing verify, a verify inside the lane or a refused merge appends nothing | unit |

## 6. Out of scope

- Collecting friction automatically from command exit codes or hook events (a later item, after the manual log shows
  which signals matter)
- Sending friction from user projects to SAF upstream (users can paste their log into an issue)
- A web view of the log (the HTML report of T-M2-05 covers only what `task:report` renders)
