# Spec — evidence viewer (one HTML page per milestone)

Decision: [D-012](../DECISIONS.md) (decided). Cards: T-M2-05 · T-M3-19 (rules 10–14).

## 1. Purpose

Owners who do not read JSON still want to see what each card ran and why it passed. `task:report <M> --html` writes one
self-contained HTML page from the plan files and `docs/plan/evidence/`: the milestone, its exit gates, every card, and
for each card the commands it ran with exit codes and output tails. It opens offline in any browser, runs no
JavaScript and adds no dependency.

## 2. Rules

1. `task:report <M> --html` writes `docs/plan/reports/<M>.html` in addition to the markdown report and prints both
   paths. Without `--html` the command behaves exactly as today. The same refusals apply (inside a lane, unknown
   milestone).
2. The page is built by a pure function `renderEvidencePage(plan, mid)` in `kit/tools-saf/lib/viewer.mjs` from the same
   `loadPlan` data the markdown report uses — no other file is read, nothing is fetched.
3. The page is one file: an inline `<style>`, a `Content-Security-Policy` meta tag that allows nothing but inline
   styles, no `<script>`, no `<link>`, no `<iframe>`, no attribute that loads a URL. Sections fold with `<details>`.
4. Every value taken from the plan or the evidence (titles, commands, output tails, file names, reasons) is
   HTML-escaped (`&` `<` `>` `"` `'`).
5. Content, top to bottom: milestone id, title and status · cards done out of total · exit gates (declared gates and
   evidence gates the milestone file does not declare, such as `full-suite`, with the same result words as the markdown
   report) with each gate's commands · cards in the milestone's order: id · title · status · passed at · attempts ·
   test mode · changed code and test lines against their caps.
6. Each card with evidence has a folded section: started at and base commit · last verify at, head commit and result ·
   each command with its exit code, duration and output tail (preformatted) · commands deferred to the gate · the
   targeted test files · files changed, outside `touch` and in `dont_touch` · scenarios required and missing · the
   reasons of the last failure. A card without evidence shows the "not started" status and no section; a card done
   before cards shows its commits.
7. Labels come from the document language's text table (`textFor(people.docLanguage)` in `kit/tools-saf/lib/text.mjs`);
   new labels exist in both `en` and `th`. Times use `formatTime` with `people.timeZone`, like the markdown report.
8. The same plan and evidence give a byte-identical page (no "generated now" time; the newest evidence time is shown
   instead).
9. The page shows only what the evidence holds — output tails are not extended or re-read from anywhere else.

### Every view says the same about a gate (T-M3-19)

10. One function in `plan.mjs` decides the result word of an exit gate, and the four views use it: `STATE.md`, the plan
    mirror `.saf/plan.md`, the `task:report` markdown and this page. The rule: a gate with no commands (a declared gate
    without `run`, or an evidence gate that recorded no commands) → "manual check"; a gate with commands and no result,
    or a result whose `pass` is `null` → "not run"; `pass === true` → passed; any other `pass` value (missing, a
    string, a number) → failed. The mirror's checkbox is ticked exactly when the word is "passed", and every manual
    gate — declared or not — carries the manual suffix there.
11. Gate evidence whose `gates` is not an array (an object, a string) is read as "no gate results" in every view and in
    `undeclaredGates`, never a crash; `loadPlan` reports it as a plan issue naming the evidence file.
12. Text from the text table that carries markdown (backticks around a command) is shown on this page as HTML — the
    backticked part inside `<code>` — never with literal backticks.
13. The milestone status (`planned` · `active` · `paused` · `done`) is shown with the document language's word from
    `text.mjs` on this page, never as the raw value on a page in another language.
14. An output tail longer than `RUN_LIMITS.tailFail` lines (`run.mjs`) — only possible in hand-made evidence, since
    tails are capped when they are captured — shows its last `RUN_LIMITS.tailFail` lines and one line saying how many
    earlier lines were left out. Long lines are still wrapped by CSS, never cut.

## 3. Data

- Evidence shape: written by `task.mjs` (`verified.commands[].{cmd,exit,ms,tail}`, `files`, `scenarios`, `size`,
  `testMode`, `deferred`, `targeted`, `failures`) and gate evidence (`verified.gates[]`) — the viewer reads, never writes
- Report path: `reportPath` in `kit/tools-saf/lib/report.mjs`; status helpers `cardStatus` · `undeclaredGates` ·
  `formatTime` in `kit/tools-saf/lib/plan.mjs`

## 4. Edge cases and errors

- A milestone with no evidence at all → the page lists every card as not started and every gate as not checked
- Broken evidence JSON → `loadPlan` reports it as today; the card shows as not started
- An output tail with control characters or very long lines → escaped and wrapped by CSS; only the line count is capped
  (rule 14)
- The page may hold whatever the evidence tails hold — `check-secrets` scans tracked files, the HTML included. That
  scan is a safety net with a gap: a secret pattern that needs a literal `"` (the Claude Code env value pattern in
  `secrets.mjs`) cannot match in the HTML, where rule 4 turns `"` into `&quot;`. The earlier guard is `run.mjs`, which
  passes output through `redactSecrets` when it captures it, before evidence is written

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| VIEW-AC-01 | a plan with milestone M1: one passed card, one failed card, one not started, gate evidence with a declared gate and an undeclared `full-suite` gate | `renderEvidencePage(plan, "M1")` | the three cards appear in milestone order with their status; the passed card shows each command with its exit code and tail; the failed card shows its failure reasons; the not-started card has no section; both gates are listed | unit |
| VIEW-AC-02 | a tail line `<script>alert(1)</script>` and a title with `"&'` | the page is rendered | they appear escaped; the page has no `<script`, `<link`, `<iframe`, no `src=` or `href=` to `http:` / `https:` / `//`, and holds the CSP meta tag | unit |
| VIEW-AC-03 | `people.docLanguage: "th"` | the page is rendered | the labels are the Thai ones from `text.mjs` | unit |
| VIEW-AC-04 | a temp project with evidence | `task report M1 --html` twice; `task report M1` | both runs write the `.md` and the `.html`, exit 0, print both paths, and the two pages are byte-identical; without `--html` no `.html` is written | unit |
| VIEW-AC-05 | milestone evidence with one gate per case: declared manual · declared with commands and no result · `pass: null` · `pass` missing · `pass: "yes"` · passed · failed · an undeclared gate with commands and `pass: null` · an undeclared gate with no commands | `STATE.md`, `.saf/plan.md`, `task:report` and the page are rendered | each gate has the same result word in all four views (the rule 10 table); the mirror ticks only the passed gate and both manual gates carry the manual suffix | unit |
| VIEW-AC-06 | milestone evidence whose `gates` is `{}` (then `"x"`); a card tail of 500 lines; `people.docLanguage: "th"` with status `active` | the four views and `loadPlan` | no view throws and each shows every declared gate as not run or manual; `loadPlan` lists one issue naming the evidence file; the page shows the last `RUN_LIMITS.tailFail` lines plus the left-out line; the page shows the Thai status word, not `active`; the page holds no backtick character outside `<pre>` blocks | unit |

## 6. Out of scope

- A site across milestones, search, charts, or any JavaScript
- Serving the page (it is a file to open) · changing what evidence records
