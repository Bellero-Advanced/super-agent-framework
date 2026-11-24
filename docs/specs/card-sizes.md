# Spec — card sizes M and L, the hard stop, L cards in steps

Decision: [D-021](../DECISIONS.md) (proposed — the owner's order of 2026-11-25 and his four answers; its recommended
defaults (a)–(e) are what the cards build unless the owner says otherwise). Cards: T-M3-35 (engine and every rendered
cap) · T-M3-36 (setup and user-doc wording) · T-M3-37 (L cards in steps). Amends [effort-by-size.md](effort-by-size.md)
(the size table) and [friction-log.md](friction-log.md) rules 19 and 22 (the self-fix size).

## 1. Purpose

Small cards cost almost as many tokens as big ones: every card pays for a start, a verify, a review and a hand-over.
SAF therefore has two sizes. **M** is one self-contained subsystem; **L** is one whole-line feature (data, server,
screen and its tests together). Each has a warning cap; above twice the cap `task:verify` fails and the designer
splits the card. There is no XL: the builder loses context, the review gets worse, a failure redoes too much and the
card collides with more lanes. An L card is written as numbered steps, built one commit per step, resumed at the first
unfinished step and reviewed step by step. Old `size: S` cards keep working: they are read and counted as M.

## 2. Rules

### Sizes and caps (T-M3-35)

1. The sizes are `M` and `L` (`SIZES` in `kit/tools-saf/lib/config.mjs`). `SIZE_CAPS` (same file) holds, per size, the
   warning cap of changed code lines and of changed test lines; `HARD_STOP_FACTOR` is the multiple of a cap at which
   `task:verify` fails. The values are those of D-021 — this spec does not copy them. Every other place (templates,
   `saf choices`, docs) reads or names this table.
2. `resolveConfig` sets `workflow.sizes` (code caps) and `workflow.testCaps` (test caps) to `{ M, L }` from `SIZE_CAPS`
   for **every** `project.rigor`; `RIGOR` no longer holds sizes or test caps (it keeps `review` and `merge`). A project
   value of the new shape `{ "M": <n>, "L": <n> }` replaces the table value for that key.
3. Legacy config: a `workflow.sizes` or `workflow.testCaps` value of the old shape `{ "S": <n>, "M": <n> }` stays
   schema-valid and is **ignored** — the table applies, and the resolved config lists the ignored keys in
   `workflow.sizesLegacy`. `saf config --check` and `task:verify` each print one line per ignored key:
   `! workflow.<key> uses the retired S/M shape and is ignored — the size table applies (write { "M": …, "L": … } or remove it)`.
   The schema (`$defs/sizeCaps`) accepts exactly the two shapes, each with both keys and positive integers.
4. **Counted size** (`countedSize(card)` in `config.mjs`): `M` → `M`; `L` → `L`; `S` → `M` with the note
   `legacy S counted as M`; no size → `M` with the note `no size — counted as M`. Caps, the hard stop, effort and the
   self-fix check use the counted size. The card file is never rewritten; `STATE.md`, `.saf/plan.md` and
   `task:report`'s effort table keep showing the size the card file says.

### The size check in task:verify (T-M3-35)

5. Lines are counted as today (`cardSize`: added + removed lines of the card's files, test files apart from code).
   `verified.size` becomes
   `{ size: <counted>, note?: <rule-4 note>, code: { lines, cap, stop }, test: { lines, cap, stop }, over: [...], stopped: [...] }`,
   where `stop = HARD_STOP_FACTOR × cap`, `over` lists the kinds above their cap and `stopped` the kinds above their
   stop.
6. Above the cap and at most the stop: the card can pass; verify prints
   `  ⚠ <id> is over the size cap (<size>): code <n> > <cap> · test <n> > <cap> changed lines — not a failure up to <HARD_STOP_FACTOR> × the cap; the reviewer decides (or the designer splits the card)`
   (only the kinds in `over`, joined with ` · `).
7. **Hard stop.** The size is counted **before** any "Done when" command runs. When a kind is above its stop, no
   command runs, the evidence records a failed attempt (`status: "failed"`, `attempts` + 1, `verified.commands: []`,
   `verified.size.stopped` set) and verify prints
   `  ✗ <id> is over the hard stop (<size>): code <n> > <stop> · test <n> > <stop> changed lines (<HARD_STOP_FACTOR> × the cap) — no command ran; the designer splits the card`
   (only the kinds in `stopped`). The size is counted again after the commands as today; when that count is above a
   stop, the card fails with the same line ending in `— the card fails; the designer splits the card`. The CLI shows
   the line among the failure reasons and exits **1**, as for any failed verify.
8. A card stopped by rule 7 can pass later only by getting smaller: the designer splits it (new cards, and the stopped
   card's `touch` and "Done when" narrowed) or the work is reduced, then `task:verify` runs again.
9. `task:start` prints the counted size: the agent line of effort-by-size rule 11 says `size <counted>` followed by
   ` (<note>)` when rule 4 gives a note; a card whose role has no agent line gets the line `  size <counted> (<note>)`
   only when there is a note.

### Plan validation (T-M3-35)

10. A card's `size` must be `M` or `L`, with one exception: `S` or a missing size is accepted (and counted by rule 4) on
    a card whose milestone has status `active`, `paused` or `done`, or that has evidence. Otherwise
    `task:state --check` reports one issue per card:
    - `S`: `<file>: size S is retired — use M or L (docs/specs/card-sizes.md)`
    - missing: `<file>: needs size M or L`
    - anything else: `<file>: size must be M or L (bigger than L → split the card)`
11. Templates write `size: M`: the card template (`docs/plan/tasks/_template.md`, en and th) and the first card
    `T-M0-01` (en and th). `task:friction draft` prints `size: M`.

### Effort by size (T-M3-35)

12. `EFFORT_BY_SIZE` (`config.mjs`) has the keys `M` and `L` per role, with D-021's values: implementer M medium · L
    high; designer M medium · L high; spec-reviewer, qa-runner and release-operator keep the effort
    [effort-by-size.md](effort-by-size.md) gives them, for both sizes. `cardEffort` looks the row up with the counted
    size. The variant agent files stay the same set (`variantNames` reads the table).

### Self-fix cards (T-M3-35)

13. A self-fix card must have counted size `M` (an L card is a plan issue:
    `size L — a self-fix card is size M`). A legacy S self-fix card counts as M and stays valid.

### Rendered caps (T-M3-35)

14. `templateData` (`generate.mjs`) gives `sizeM`, `sizeL`, `testM`, `testL` (from the resolved config) and
    `hardStop` (`HARD_STOP_FACTOR`); `sizeS` and `testS` are removed. Every template line that shows caps shows M and L,
    no template says `S ≤`, and the lines marked (stop) also say that verify fails above `hardStop` × the cap and the
    designer splits the card:
    - `templates/{en,th}/CLAUDE.template.md` — the Definition-of-done size line (stop)
    - `templates/{en,th}/docs/plan/README.md` — the `size` row of the card-format table (stop)
    - `templates/{en,th}/docs/plan/tasks/_template.md` — the size sentence (stop)
    - `templates/{en,th}/docs/DECISIONS.md` — the D-003 rigor row (caps of the new table)
    - `templates/{en,th}/commands/saf-plan.md` — the split sentence of step 3 (stop)
    - `templates/agents/designer.md` (stop) · `implementer.md` · `spec-reviewer.md` — the size lines
    - `templates/rules/plan-files.md` · `rules/tests.md` — the size lines
15. `saf choices --group 2`: the line under each rigor option shows the M / L caps and test caps from the resolved table
    with the labels `Card size M / L (changed code lines)` · `Test caps M / L (changed test lines)` (th: the same
    with `M / L`), then review and merge checks as today.
16. This repository and the example follow: `saf.config.json` and `examples/todo-api/saf.config.json` drop their old
    `{ S, M }` `workflow.sizes` / `workflow.testCaps` (the table applies); this repository's `CLAUDE.md` size line,
    `docs/plan/README.md`, `docs/plan/tasks/_template.md`, `.claude/agents/*`, `.claude/rules/plan-files.md`,
    `.claude/rules/tests.md`, `.claude/commands/saf-plan.md` and the example's rendered copies of the same files equal
    the rendering (`npm run saf:refresh` writes the example's `CLAUDE.md`, agents and commands; the rest by hand).

### Wording in setup and the user docs (T-M3-36)

17. No user-facing text says "size S", "S cards", "size-S", `S ≤` or "S / M" except where it describes legacy cards.
    The texts and what they must say:
    - `kit/tools-saf/lib/choices.mjs`: `project-rigor` options (en, th) no longer promise larger or smaller cards;
      `size-caps` says the caps are for M and L cards, that verify warns above a cap and **fails above twice it**
      (in words, no digits), and that the table is the same for every rigor; `LABELS.*.reviewWords["m-cards"]` and the
      `workflow.review` not-asked line say M and L cards get their own review and legacy S cards are reviewed together
      at the gate; the `workflow.selfFix` not-asked line says size M (and keeps the th phrase
      `engine ไม่ยอมรับอย่างอื่น เรื่องที่ใหญ่กว่านี้จึงยังต้องรอเจ้าของ`); the `effort` options and the `models.effort`
      not-asked and machine lines say "M cards" / "L cards" where they say "small cards" / "large ones"
    - `kit/claude/skills/saf-setup/questions.md`: the rigor table has no size columns (the caps are one table), the
      `workflow.sizes` row says `{ M, L }` and "from the size table"; the effort paragraph says M cards
    - `kit/claude/skills/saf-setup/SKILL.md`: the derived-values sentence matches rule 15
    - `kit/tools-saf/templates/{en,th}/commands/saf.md` and `.claude/commands/saf.md`: the review row's m-cards text and
      the self-fix section say M (not S) and L is never a self-fix card
    - `kit/tools-saf/templates/{en,th}/CLAUDE.template.md`: the m-cards review line of the Definition of done
    - `docs/card-lifecycle.md`: the size check (warning, hard stop, exit 1, legacy S), the example frontmatter
      (`size: M`, its comment pointing to `SIZE_CAPS` — no numbers copied), the review line and the self-fix conditions
    - `docs/config-reference.md`: the `rigor` row (no sizes), the `sizes` · `testCaps` row (`{ M, L }`, the hard stop,
      the legacy shape ignored), the `review` row, the `selfFix` row
    - `docs/setup-questions.md`: the card size caps item
18. `docs/roles.md` and the other sentences that only say "the card's size picks the effort" name no size letter and
    stay as they are.

### L cards in steps (T-M3-37)

19. An L card has a section `## Steps` (th: `## ขั้นตอน`; `STEPS_HEADINGS` in `plan.mjs`) whose numbered items
    (`1. <text>`, outside code fences) are its steps, in order; `parseCard` returns them as `card.steps` (texts) for
    any card. An L card with fewer than `L_MIN_STEPS` (`plan.mjs`) steps is a plan issue:
    `<file>: an L card needs a "## Steps" section with at least <L_MIN_STEPS> numbered steps`. An M card may have the
    section and nothing checks it.
20. **Convention, not checked by the engine:** each step ends with one commit whose subject contains
    `<card id> step <k>/<n>` (`n` = the number of steps), e.g. `feat(M4): T-M4-03 step 2/4 server routes`. Review
    fixes after the last step are ordinary commits. A card that stopped midway resumes at the first step that has no
    such commit (`git log --oneline <start commit>..HEAD`). `task:verify` runs once, after the last step, as for any
    card — the size caps count the whole card.
21. `task:diff <id>` of a card with steps: a commit on the first-parent history from the files base to `HEAD` is a
    step commit of step `k` when its subject contains `<id> step <k>/` with `1 ≤ k ≤` the number of steps. A step's end
    is its newest step commit. When the ends of the steps that have one are in history order, the file holds, after
    the header, one section per step in order — `# step <k>/<n> <text> · commit <short sha>` followed by the diff of
    the card's files from the previous end (or the files base) to this end, or `# step <k>/<n> <text> · no commit`
    with no diff — and a last section `# after the last step commit` with the diff from the last end to the work tree
    (uncommitted work and later commits), left out when empty. The header gains one line
    `# steps <k>/<n> <short sha or "no commit"> · …`. When no step has a commit, or the ends are out of history order,
    the file is today's whole-card diff and the header line says `# steps: no step commits — whole diff` or
    `# steps: step commits out of order — whole diff`. A card without steps gets today's file unchanged.
22. The text that tells people and agents about steps:
    - `templates/{en,th}/docs/plan/tasks/_template.md`: a `## Steps` section explained as required for L, with the
      commit subject of rule 20
    - `templates/{en,th}/docs/plan/README.md`: the card-format section says what an L card's steps are and how they
      are committed, resumed and reviewed
    - `templates/agents/designer.md`: an L card lists its steps; each step is something one commit can finish
    - `templates/agents/implementer.md`: one commit per step with the rule-20 subject; resume at the first step
      without a commit
    - `templates/agents/spec-reviewer.md`: on an L card read the diff file section by section, in step order, and name
      the step of each finding
    - `docs/card-lifecycle.md`: an "L cards in steps" part with rules 19–21
    - this repository's rendered copies (`docs/plan/README.md`, `docs/plan/tasks/_template.md`, `.claude/agents/*`)

## 3. Data

- `SIZES`, `SIZE_CAPS`, `HARD_STOP_FACTOR`, `countedSize`, `EFFORT_BY_SIZE`, `RIGOR`: `kit/tools-saf/lib/config.mjs`
- `$defs/sizeCaps`: `kit/tools-saf/schema/saf.config.schema.json`
- plan check (rules 10, 19), `STEPS_HEADINGS`, `L_MIN_STEPS`: `kit/tools-saf/lib/plan.mjs`
- `cardSize`, the verify messages (rules 6–7), `task:start` lines: `kit/tools-saf/lib/task.mjs`; CLI reasons
  `kit/tools-saf/bin/saf.mjs`
- self-fix check and draft: `kit/tools-saf/lib/friction.mjs` · effort: `kit/tools-saf/lib/effort.mjs`
- template variables: `templateData` in `kit/tools-saf/lib/generate.mjs` · step sections: `kit/tools-saf/lib/reviewdiff.mjs`

## 4. Edge cases and errors

- A legacy S card in a milestone that is later set back to `planned` stays accepted when it has evidence; without
  evidence it becomes a plan issue (rule 10) — the designer changes its size to M.
- A side card of a planned milestone that has started (evidence) with `size: S` is accepted (rule 10).
- `workflow.sizes` of the new shape with only one key, or a zero → config error (rule 3, schema).
- Lines exactly at the cap: no warning; exactly at the stop: a warning, no stop (rules 6–7 say "above").
- An L card's step commit with a `k` larger than the number of steps is not a step commit (rule 21).
- A lane card: steps and step commits live on the lane branch; `task:diff` reads them in the worktree (review-diff
  rule 3); `task:merge` keeps the commits.
- Old evidence (`verified.size` without `stop` / `stopped`) still renders in `STATE.md`, the report and the HTML page.

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| SIZE-AC-01 | `resolveConfig` of each rigor; a config with `workflow.sizes` `{ M: 10, L: 20 }`; one with the old `{ S: 150, M: 400 }` | resolve, validate and `saf config --check` | `SIZE_CAPS` and `HARD_STOP_FACTOR` hold D-021's values; every rigor gives `workflow.sizes` / `testCaps` with keys M and L from the table; the new shape wins; the old shape is valid, ignored, listed in `workflow.sizesLegacy`, and `config --check` prints the rule-3 line; `{ M: 10 }` alone is a config error | unit |
| SIZE-AC-02 | an M card whose code lines are the M cap + 1, then exactly `HARD_STOP_FACTOR` × the cap | `task:verify` | passes both times; evidence `over: ["code"]`, `stopped: []`, `code.stop` = factor × cap; the rule-6 line is printed | unit |
| SIZE-AC-03 | an M card with code lines = factor × M cap + 1 and a "Done when" command that writes a marker file; an L card with test lines = factor × L test cap + 1; an M card with `workflow.sizes` `{ M: 5, L: 10 }` and 11 code lines | `task:verify` (and the CLI once) | each fails: no marker file (no command ran), `status: "failed"`, `verified.commands: []`, `stopped` names the kind; the exact rule-7 line is printed; the CLI exits 1 | unit |
| SIZE-AC-04 | an active milestone with a card `size: S` and a card without size | `task:state --check`, `task:start`, `task:verify` with 151 code lines (above the old standard S cap) | the plan is valid; start prints `size M (legacy S counted as M)` / `size M (no size — counted as M)`; verify caps are the M caps, no warning, `verified.size.size` is `M` with the note; `STATE.md` still shows `S` | unit |
| SIZE-AC-05 | a planned milestone with cards of size S, none, `XL`, M and L, none started; the same S card after it started; an S card in a done milestone | `task:state --check` | exactly the three rule-10 issues (S · missing · XL) with their texts; no issue for M, L, the started S card or the done milestone's card | unit |
| SIZE-AC-06 | a `by-size` config | `cardEffort` for implementer and designer cards of size M, L, S and none; `variantNames` | implementer M → `implementer-medium`, L → `implementer` (high); designer M → `designer-medium`, L → `designer`; S and none as M; the variant set is unchanged; `EFFORT_BY_SIZE` rows have exactly the keys M and L | unit |
| SIZE-AC-07 | self-fix cards of size M, L and S in the active milestone; `task:friction draft` | `selfFixIssues`; the draft command | M and S valid; L gives `size L — a self-fix card is size M`; the draft has `size: M` | unit |
| SIZE-AC-08 | `generate` in en and th with rigor `standard` and `strict` | read the rendered files of rule 14 | each shows the M and L caps of the table, the (stop) lines also the hard-stop factor; none contains `S ≤` or `{{`; both rigors render the same caps; the card template and `T-M0-01` say `size: M` | unit |
| SIZE-AC-09 | the choices table | `saf choices --group 2` in en and th | every rigor option is followed by `Card size M / L` with the table's code caps and `Test caps M / L` with its test caps (th labels likewise) | unit |
| SIZE-AC-10 | the choices table and the files of rule 17 | read each named text | none says size S, S cards, size-S, `S ≤` or `S / M` outside a sentence about legacy cards; `size-caps` (en, th) names the failure above twice the cap, without digits and within `FIELD_MAX`; rigor options promise no larger/smaller cards; m-cards words and the selfFix line say M; the th selfFix phrase is kept | unit |
| SIZE-AC-11 | `docs/card-lifecycle.md`, `docs/config-reference.md`, the generated `/saf` (en, th, selfFix on, review m-cards) | read the size-check part, the `sizes` row and the self-fix section | the lifecycle size part names the warning, the hard stop, exit 1 and legacy S; the config row names `{ M, L }`, the hard stop and the ignored old shape; `/saf` says a self-fix card is size M | unit |
| SIZE-AC-12 | cards: L with two steps; L with one step; L without the section; L with `## ขั้นตอน` and two steps; M with no section; a step list inside a code fence | `parseCard` and `task:state --check` | `card.steps` holds the texts; the one-step, no-section and fenced-only L cards each give the rule-19 issue; the others are valid | unit |
| SIZE-AC-13 | an L card with three steps: commits `T-M1-01 step 1/3 …`, `T-M1-01 step 2/3 …` (and a fix commit `T-M1-01 step 2/3 fix`), step 3 uncommitted; the same card with no step commits; with step 2's commit before step 1's | `task:diff` | sections `step 1/3 · commit`, `step 2/3 · commit` (ending at the fix commit), `step 3/3 · no commit` and `after the last step commit` with the uncommitted lines, in that order, each with only its own changes; the header `# steps` line; the two other cases give the whole-card diff with their header line; an M card's file is byte-equal to today's format | integration |
| SIZE-AC-14 | the templates and docs of rule 22, rendered in en and th | read each | the card template has the `## Steps` section and the commit subject; the README, designer, implementer and spec-reviewer texts and `card-lifecycle.md` each state their rule-22 point | unit |

Rows that pass by design today: none — SIZE-AC-01 … 14 all fail on the code before T-M3-35 (caps keyed S/M, no stop,
no `countedSize`, no `card.steps`), worked out from `RIGOR`, `cardSize`, `parseCard` and `writeReviewDiff`.

## 6. Out of scope

- An XL size or any third size
- Engine checks that each step has a commit, or that verify waits for every step (rule 20 is a convention)
- Rewriting old card files or evidence (legacy S stays as written)
- Renaming the `m-cards` value of `workflow.review`
- A text/code effort split ("text-for-users cards at high effort" — a separate owner item about D-016)
- Per-rigor caps (D-021 (b): one table)
