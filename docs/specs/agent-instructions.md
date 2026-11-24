# Spec — standing instructions in the implementer and spec-reviewer agents

Decision: [D-020](../DECISIONS.md) (proposed). Card: T-M3-29. The diff file the reviewer reads is
[review-diff.md](review-diff.md) (T-M3-31); the designer's own rule is [designer-prerun.md](designer-prerun.md).

## 1. Purpose

In M2 and M3 every implementer prompt repeated the same paragraph (prove each new test fails without the feature,
re-read edited docs whole, take the size from the evidence, list sentence → code, keep tests Windows-safe, report
friction) and every review prompt repeated per-card-type checklists. The agents shipped with SAF did not hold these
rules, so a prompt that forgot one paid for it in a review round (text cards built without a sentence → code list
bounced at round 1 in three of four M2 cards; T-M3-01 reported a code size of 294 lines while its evidence said 388).
After this spec the rules live in the agent templates, so a prompt can be "do T-M3-xx" and "review T-M3-xx, type:
text,data, diff: <path>".

## 2. Rules

### Implementer (`kit/tools-saf/templates/agents/implementer.md`)

1. A section "Before you report" lists, as checks the implementer does after the last `task:verify` and before the
   report:
   1. every new test was seen to fail without the feature: revert the code part of the change (keep the test), run the
      test, see it fail, restore — the report names the test and the failing run;
   2. every document the card edits was read whole after the edit: no line repeats or contradicts another;
   3. the size is the number `task:verify` stored in the evidence (`verified.size`), not an own count;
   4. for every sentence a user reads that the card adds or changes (docs, templates, explanations, CLI messages): a
      list "sentence → the code that makes it true" (file and line, template variable or data entry);
   5. tests are Windows-safe: paths built with `node:path`, CRLF tolerated when reading text, child processes spawned
      with `process.execPath` and an argument array (no shell string), no reliance on file modes or symlinks;
   6. one friction line: `friction: none`, or what in the workflow got in the way and whether it is SAF's gap (the main
      session records it with `task:friction add`).
2. The report line names: the verify result with numbers · files changed · the evidence size · the failing-first runs
   · the sentence → code list when there is one · the friction line.
3. The `description` front matter is unchanged (routing).

### Spec-reviewer (`kit/tools-saf/templates/agents/spec-reviewer.md`)

4. The input gains review types: the main session names zero or more of `text`, `data`, `security`, `refactor`
   (comma list). The general "Check" list always applies; each named type adds its checklist:
   - `text` — sentences users read: each changed sentence checked against the code including its conditions (roles,
     lanes, rigor, policies, settings on or off, language); English and Thai say the same thing and the Thai reads
     naturally; setup explanations keep the rule of [setup-choices.md](setup-choices.md) rule 8 (no run of two digits,
     no model id); edited docs have no repeated or contradicting lines; the implementer's sentence → code list is
     present and true
   - `data` — anything that writes, moves, archives or deletes user files: walk the full matrix (file missing · same
     · edited · unreadable × first run · re-run × dry run · apply); archive before write; what the dry run says equals
     what apply does; no silent default on unreadable input; a second run changes nothing
   - `security` — untrusted text, secrets, commands, release: untrusted text escaped where it is printed or rendered;
     no secret value printed or written; no shell string built from input (argument arrays); no path that escapes the
     project; use the `security-review` skill
   - `refactor` — code moved or restructured with no intended behaviour change: an old-versus-new comparison of
     outputs on the same inputs (a test or a recorded run); every caller gets the same result
5. The verdict names the types whose checklists were applied. With no type named, the reviewer applies the general list
   and says so.
6. The type names and checklists live only in this template; the `/saf` command names the types (T-M3-31).

### This repository

7. `.claude/agents/implementer.md` and `.claude/agents/spec-reviewer.md` equal the rendering of the templates with this
   repository's `saf.config.json`. A test proves it for **every** `.claude/agents/*.md` file of an enabled role:
   `planSetup` on this repository reports the action `same` for each of them (today all five are `same`).

## 3. Data

- Templates: `kit/tools-saf/templates/agents/implementer.md`, `spec-reviewer.md` (English only — agent templates have no
  `th` copy; they follow `roles.reportLanguage` for the report).
- The size field: `verified.size` in `docs/plan/evidence/<id>.json` (written by `task:verify`).

## 4. Edge cases and errors

- A card without user-facing sentences: the implementer writes "no user-facing text" instead of the list.
- A test that cannot fail without the feature (a guard test) is named as such with the reason.
- With `tokenSaving.reviewerDiff` off the reviewer still gets the list of changed files (today's template condition
  stays).

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| AGENT-AC-01 | a temporary project rendered by setup | read `.claude/agents/implementer.md` | it has the "Before you report" section with the six checks of rule 1 (failing first, docs read whole, evidence size, sentence → code, Windows-safe, friction line) and the report line of rule 2 | unit |
| AGENT-AC-02 | the same project | read `.claude/agents/spec-reviewer.md` | it names the four types and each type's checklist items of rule 4, and the verdict rule of rule 5 | unit |
| AGENT-AC-03 | this repository | `planSetup` dry plan for this repository | every `.claude/agents/*.md` action is `same` | unit |
| AGENT-AC-04 | the templates before and after | compare the `description` lines | unchanged for both roles | unit |

## 6. Out of scope

- Effort by size and variant agent files (T-M3-03 … T-M3-06) — they render from the same templates.
- The designer's rule (T-M3-30) and the release-operator text (T-M3-22).
