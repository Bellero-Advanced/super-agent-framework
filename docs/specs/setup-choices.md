# Spec — setup choices (what each option means, and every setting the interview does not ask)

Decision: [D-009](../DECISIONS.md) (decided). Cards: T-M2-12 … T-M2-15, T-M2-19, T-M2-28 · T-M3-20 (rules 15, 26) ·
T-M3-22 (rule 27) · T-M3-23 (rule 16). Builds on the test-mode questions that
T-M2-10 adds to the interview.

## 1. Purpose

`/saf-setup` asks grouped questions with a recommended default, but it does not say what each option costs or when to
pick another one, and settings it does not ask stay invisible. With this spec every option the interview offers comes
with four short lines — **what it is · good for · cost · pick it when** — in the chat language (en or th), and before
anything is generated the person sees every setting the interview did not ask and where to change it later (the project
file, the per-machine file, an environment variable). The text lives in one data table in the engine, so the skill,
the CLI and the tests all read the same words.

## 2. Rules

### The data table

1. The setup choices live in `kit/tools-saf/lib/choices.mjs` (data, not logic): the question list `QUESTIONS`, the
   option explanations `CHOICES`, the not-asked catalogue `NOT_ASKED`, the keys nobody sets by hand `INTERNAL_KEYS`,
   the per-machine switches `MACHINE_SWITCHES`, the field labels `LABELS`, the field length limit `FIELD_MAX` and the
   reference link `DOCS_URL`. No other file holds a second copy of this text.
2. Each question in `QUESTIONS` has an id, the interview group it belongs to (1–8 as in the setup skill, or `flow`
   for setup-flow questions), the `saf.config.json` keys it sets (full dotted paths; none for `flow` questions) and a
   kind:
   - `choice` — the person picks from listed option values (the question carries them)
   - `value` — the person types or keeps a value (paths, commands, numbers, names)
   - `identity` — names and texts that only describe the project or the person (name · pitch · users · domain ·
     stack summary · owner title · time zone · first-milestone goal); they carry no explanation
3. The `flow` questions are the setup-flow choices that change what setup does: keep the old docs as history
   (`--adopt` / `--no-adopt`) and commit the setup locally now. The final "Generate with these settings?" confirmation
   is not a question in this sense.
4. An explanation has four fields — `what` · `good` (good for) · `cost` (cost or downside) · `when` (pick it when) —
   in both `en` and `th`, stored next to each other in `CHOICES`. Every field is non-empty and at most `FIELD_MAX`
   characters.
5. A `choice` question has explanations per option. One explanation may cover several option values that SAF treats
   the same (for example every Node package manager, or every database other than `none`); each option value of the
   question is covered by exactly one explanation.
6. A `value` question has exactly one explanation, for the question as a whole ("what this setting does · good for ·
   cost · set it when"). An `identity` question has none.
7. The option values of a `choice` question equal their source when one exists: the schema `enum` of its key, `yes`
   and `no` for a boolean key, the optional roles of `ROLE_LIBRARY` for `roles.enabled`, `SKILL_PACKS` for
   `skills.packs`. Other `choice` questions (lane caps, side lanes, token saving, flow questions) list their values in
   `QUESTIONS`.
8. Explanation text never copies a number or a model id from a code table (card sizes, caps, ports, timeouts, models):
   no field contains a run of two or more digits or `claude-`. Values that matter are appended by the renderer (rule 12).
9. The recommended default of a question lives only in the skill's `questions.md`, never in `choices.mjs`.

### Coverage

10. Every leaf key of `kit/tools-saf/schema/saf.config.schema.json` (a property that is not an object with its own
    `properties`) is in exactly one of: the keys of a question in `QUESTIONS` ("asked"), `NOT_ASKED`, or
    `INTERNAL_KEYS` (`$schema` · `version`). None of these lists names a key that the schema does not have.
11. The asked keys of `QUESTIONS` equal the keys in the "Key" column of the tables in
    `kit/claude/skills/saf-setup/questions.md`. That column holds full dotted keys only (no `.target` shorthand, no
    `*`), so both lists can be compared exactly.

### The CLI (`node tools/saf/bin/saf.mjs choices`)

12. `choices --group <g> [--lang en|th]` prints, for every question of group `g` (`1`–`8` or `flow`) in `QUESTIONS`
    order, its keys and each option's four fields under the `LABELS` of that language. Options of `project.rigor` are
    followed by the values their rigor derives (card sizes, test caps, review, merge-check kinds — from `RIGOR` in
    `config.mjs`); options of `models.preset` by the planner and builder model ids (from `MODEL_PRESETS`).
13. `choices --not-asked [--lang en|th]` prints every `NOT_ASKED` key with its one-line summary in that language and
    where to change it: `saf.config.json` (checked with `node tools/saf/bin/saf.mjs config --check`, or set by re-running
    `/saf-setup`) and the `DOCS_URL` link to the key's section of the config reference — the anchor is the key's
    top-level part in lowercase, because GitHub heading anchors are lowercase. Then a "per machine" block lists every key of
    `LOCAL_KEYS` (file `saf.config.local.json`, not tracked by git) and every entry of `MACHINE_SWITCHES` — today
    `SAF_TEST_MODE` (from `TEST_MODE_ENV`) and `SAF_STOP_HOOK=off` (from `STOP_HOOK_ENV`) — each with its line in that
    language.
14. Without `--lang` the language is `people.chatLanguage` of `saf.config.json` when the file exists and holds a valid
    value, else `en`. The command works before setup has written a full config and never writes a file.
15. An unknown group, an unknown language, or neither `--group` nor `--not-asked` → exit 2 with a usage line that lists
    the valid values. So does any argument the command does not define: an unknown flag (`--foo`, the `=` form
    `--lang=th`), a stray word (`choices foo --group 2`), a flag given twice, or `--group` and `--not-asked` together.
    Success → exit 0.

### The interview (`kit/claude/skills/saf-setup/`)

16. Groups, their order and the "(recommended)" marker stay as `questions.md` defines them. Before asking a group the
    skill runs `choices --group <g> --lang <chat language>` and shows each question's options as a compact table
    (option · what it is · good for · cost · pick it when); the AskUserQuestion option descriptions carry the "pick it
    when" line. The skill shows the text as printed — it does not rewrite or shorten it. The chat-language question comes before
    the language is known: the skill asks it first, shows its options' table with `--lang en`, and does not show that
    table again when group 1's output is printed in the chosen language afterwards.
17. Questions the skill skips because detection made the answer certain still show what was detected; their
    explanations are offered only when the person asks.
18. The confirm step (Step 2) shows the summary of the answers, then the output of `choices --not-asked`, and asks once:
    Generate (recommended) · Change an answer · Adjust a setting that was not asked. Choosing the last one asks for the
    keys and values in one plain message and adds them to `.saf/setup-answers.json`; the schema check of `setup` still
    applies.

### Docs

19. `docs/config-reference.md` names every schema leaf key (the key's last part in backticks, in the section of its
    top-level key) and has one section per top-level key that `DOCS_URL` links to: a heading whose GitHub anchor (the
    heading text in lowercase, spaces → `-`, punctuation dropped) equals the lowercase anchor of rule 13.
20. `docs/setup-questions.md` says that each option comes with the four lines, that the confirm step lists the settings
    not asked, and how to print both with `saf choices` — it does not copy the explanations.

### Setup flow and generated files

21. When `detect` reports `adopt: true` and the setup is not a re-run, Step 1 asks the `adopt` flow question explicitly
    and shows its explanations from `choices --group flow` (rule 16). Its recommended default lives in `questions.md`
    (rule 9) and is "yes" — the same result as today's detection fallback. A new project (`adopt: false`) skips the
    question and says so (rule 17).
22. Step 3 always passes exactly one adopt flag to `setup`: `--adopt` for "yes", `--no-adopt` for "no" or a skipped
    question. Without a flag `setup` falls back to detection and archives an existing project's files even after a
    "no", which contradicts the `adopt: no` explanation.
23. The generated release-operator agent file follows `policies.push` like `CLAUDE.md` and the decision log do:
    `owner-order` → never push without the owner's order; `allowed` → pushing is allowed. Force-push and history
    rewrite stay forbidden in both. The `push` explanations in `CHOICES` describe what the generated files say, so no
    explanation says the release-operator file forbids a push that the chosen option allows.
26. `node tools/saf/bin/saf.mjs config --check` takes exactly that one flag; any other argument → exit 2 with its usage
    line. A `saf.config.json` that is not valid JSON, or whose root is not an object, → one error line naming the file,
    exit 1, no stack trace.
27. The generated release-operator file follows `policies.deploy` as well as `policies.push` (rule 23), so it never
    contradicts `CLAUDE.md`: with `deploy: allowed` neither its description nor its "Before anything live" steps ask for
    an owner order (step 1 checks the change against the deploy target and exceptions instead); with `deploy:
    owner-order` both still do. With `push: allowed` and `autoDeployBranches` set, one sentence says pushing is allowed
    except to those branches, which deploy automatically and count as a release — the CLAUDE.md git line says the same in
    the same order. With `push: allowed` and `protectedBranches` set, the push rule names the protected branches.

### Explanations match the code

24. Every explanation sentence is true of the code for every answer combination the interview can produce, not only
    the common one. In particular (each checked in `generate.mjs` `ruleSet` / `config.mjs` `resolveConfig` and
    `roleTable` / the CLAUDE.md template):
    - a project type without its own UI rule (`api` and the others outside the UI types) still gets the UI rule when
      translation is required (`people.i18nRequired`); the `api` and `ui-languages` texts say so, and `several` says
      the interview then suggests the content-writer role and the translation pack
    - `models.planner` / `models.builder`, when set, win over **any** preset (an empty one falls back to the preset's
      model, Balanced's for Custom); planner-tier roles — the planner roles of `ROLE_LIBRARY` and custom roles marked
      planner — use the planner id, the others the builder id; `models.overrides` wins for a single role
    - `strict` rigor makes the generated Definition of done require a security-auditor review of each milestone even
      when that role is not enabled, and the interview suggests the role (a planner-tier role)
    - not-asked keys that only reach generated files (`workflow.review`, `models.overrides`) say they apply after setup
      runs again; a number another module owns (the measure exit code) is interpolated from its constant, not typed
25. The rigor values appended by rule 12 name their unit (changed code lines, changed test lines) and show the review
    level as words in the chosen language, not the raw `RIGOR` ids.

## 3. Data

- `QUESTIONS` · `CHOICES` · `NOT_ASKED` · `INTERNAL_KEYS` · `MACHINE_SWITCHES` · `LABELS` · `FIELD_MAX` · `DOCS_URL` —
  `kit/tools-saf/lib/choices.mjs`
- schema leaf keys — `kit/tools-saf/schema/saf.config.schema.json`
- `RIGOR` · `MODEL_PRESETS` · `ROLE_LIBRARY` · `SKILL_PACKS` · `LOCAL_KEYS` · `TEST_MODE_ENV` — `kit/tools-saf/lib/config.mjs`
- `STOP_HOOK_ENV` — `kit/tools-saf/lib/task.mjs`
- questions, keys and recommended defaults of the interview — `kit/claude/skills/saf-setup/questions.md`
- the `choices` command — `kit/tools-saf/bin/saf.mjs`

## 4. Edge cases and errors

- a new schema key without a home in `QUESTIONS`, `NOT_ASKED` or `INTERNAL_KEYS` → the coverage test fails and names it
- a new enum value (a new test mode, project type, pack) without an explanation → the data test fails and names the
  question and the value
- `saf.config.json` missing or not valid JSON when `choices` runs → language `en`, no error (setup has not run yet).
  Valid JSON that breaks the schema in other keys still gives its `people.chatLanguage` when that one value is a
  language `choices` supports (rule 14 reads only that value)
- Thai text is longer per character count than English → `FIELD_MAX` applies per language to the same limit; the
  data test reports the field that is too long
- a re-run of `/saf-setup` → the same explanations and the same not-asked list (rule 13 prints keys and summaries,
  not the current values)

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| SETUP-AC-01 | the schema and `choices.mjs` | the coverage test walks the schema leaf keys | each leaf is in exactly one of asked keys · `NOT_ASKED` · `INTERNAL_KEYS`; no listed key is missing from the schema; a fixture schema with one extra key fails naming it | unit |
| SETUP-AC-02 | `QUESTIONS` and `questions.md` | the keys are compared | the asked keys equal the Key-column keys both ways; each `choice` question with a source has option values equal to that source (schema enum · yes/no · optional roles · `SKILL_PACKS`) | unit |
| SETUP-AC-03 | no `saf.config.json`; then one with `chatLanguage: "th"` | `choices --not-asked`; then `choices --not-asked` and `--lang en` | every `NOT_ASKED` key appears with its en summary, `saf.config.json` and the `DOCS_URL` link; the per-machine block names every `LOCAL_KEYS` key, `SAF_TEST_MODE` and `SAF_STOP_HOOK`; with the th config the summaries are Thai; `--lang en` wins over the config; exit 0; no file written | unit |
| SETUP-AC-04 | group 2 | `choices --group 2 --lang th`; `--group 9`; `--lang fr`; no flag | every option of `project.type` · `project.stage` · `project.rigor` is printed with four Thai-labelled fields; each rigor option is followed by its sizes from `RIGOR`; the bad calls exit 2 listing the valid groups / languages / flags | unit |
| SETUP-AC-05 | the entries of `CHOICES` | the data test runs | every entry has `what` · `good` · `cost` · `when` in en and th, non-empty, ≤ `FIELD_MAX`, without two adjacent digits or `claude-`; every option value of a question with entries is covered exactly once | unit |
| SETUP-AC-06 | the full `QUESTIONS` list | the completeness test runs | every `choice` question has entries covering all its values, every `value` question has exactly one, every `identity` question has none, and the `flow` group holds the adopt and commit questions | unit |
| SETUP-AC-07 | `docs/config-reference.md` and the output of `choices --not-asked` | the docs test runs | every schema leaf key is named in backticks in the section of its top-level key; every `DOCS_URL` anchor printed is lowercase and equals the GitHub anchor of a heading in the file | unit |
| SETUP-AC-08 | `kit/claude/skills/saf-setup/SKILL.md` | the docs test runs | Step 1 runs `choices --group` before each group and Step 2 runs `choices --not-asked` and offers "Adjust a setting that was not asked" | unit |
| SETUP-AC-09 | `SKILL.md` and `questions.md` | the docs test runs | Step 1 asks the adopt question when `detect` reports an existing project; Step 3 names both `--adopt` (for "yes") and `--no-adopt` (for "no" or a skipped question); `questions.md` gives the adopt question a recommended default outside the Key-column tables | unit |
| SETUP-AC-10 | a config with `policies.push: "owner-order"`, then `"allowed"`, with the release-operator role enabled | `generate` renders the agent files | owner-order: `.claude/agents/release-operator.md` forbids pushing without the owner's order; allowed: it says pushing is allowed and contains no "Never push"; both forbid force-push; the en and th `push: allowed` explanations no longer say the file forbids pushing | unit |
| SETUP-AC-11 | configs rendered by `generate`: `api` with and without `i18nRequired`; `library-cli` with `i18nRequired`; preset `balanced` with `models.planner` set; a custom role with tier `planner`; `models.overrides` for one role; rigor `strict` without the security-auditor role | the facts test reads the rules, the role table and the generated CLAUDE.md, then the en and th explanations | the UI rule is present exactly when the type has one or i18n is required; the set planner id is used under `balanced`, the custom planner role gets it, the override wins; the strict CLAUDE.md names a security-auditor review; the `api`, `several`, `custom-models` and `strict` explanations (en and th) name these effects; `choices --group 2` shows the rigor review as words and the size unit | unit |
| SETUP-AC-12 | the CLI | `choices --group 2 --foo`; `choices --lang=th --not-asked`; `choices foo --group 2`; `choices --group 2 --group 3`; `choices --group 2 --not-asked`; `config --check --foo`; `config`; `config --check` with `{ nope` then `[]` | the `choices` and bare/extra-flag `config` calls exit 2 with the usage line and print no explanation; the broken configs exit 1 with one line naming `saf.config.json` and no stack trace | unit |
| SETUP-AC-13 | a `saf.config.json` that is valid JSON with `people.chatLanguage: "th"` but fails the schema elsewhere; then one with `chatLanguage: "fr"` | `choices --not-asked` without `--lang` | the first prints the Thai summaries, the second the English ones; both exit 0 | unit |
| SETUP-AC-14 | configs: `deploy: allowed`; `deploy: owner-order`; `push: allowed` with `autoDeployBranches: "main"`; `push: allowed` with `protectedBranches: "main"`, each with the release-operator role | `generate` renders the agent file and `CLAUDE.md` | `deploy: allowed` → the agent file has no "owner order" / "owner's order" for live changes in its description or steps; `owner-order` → it has; auto-deploy → one sentence with "allowed" and "except" naming `main`, and the CLAUDE.md git line says the same; protected → the push rule names `main` | unit |
| SETUP-AC-15 | `kit/claude/skills/saf-setup/SKILL.md` | the docs test runs | the chat-language question is asked first with `choices --group 1 --lang en`, and the skill says not to show that table again in the chosen language | unit |

## 6. Out of scope

- **Setup suggestions** ([ROADMAP.md](../../ROADMAP.md) "Next"): proposing scope and direction ideas from the
  interview answers is its own later item, not part of these cards
- more per-machine keys in `LOCAL_KEYS` (lane caps, measure lock, command timeout) — one decision per key, as the
  test-mode spec says; the not-asked list shows what exists today
- explanations for the skill's free-text identity questions (name, pitch, goal …)
- showing the current value of each not-asked key on a re-run
- a generated docs page with the explanations — the CLI is the one place to read them
