# Spec — effort by card size

Decision: [D-016](../DECISIONS.md) (proposed, amends D-002). Cards: T-M3-03 (setting, variant agents, docs:check) ·
T-M3-04 (task:start names the agent, evidence, summary, report) · T-M3-05 (setup question and explanations) ·
T-M3-06 (this repository uses it). Measurement: [review-rounds.md](review-rounds.md).

## 1. Purpose

Today every role has one effort level for every card (D-002). A size S card rarely needs the implementer at high
effort, and most design work is not a new system. `models.effort: by-size` lets a project spend less effort on small
cards and keep high effort where mistakes are expensive. Because cheaper effort may cause more review bounces, the
engine records the agent and effort of each card and the report puts them next to the review rounds.

Claude Code fixes a subagent's effort in its agent file, so a different effort per card means a second agent file for
that role. The engine tells the main session which agent to use for each card.

## 2. Rules

### Setting and table

1. New setting `models.effort`: `fixed` (product default — one effort per role, today's behaviour) · `by-size`.
2. `EFFORT_BY_SIZE` (`kit/tools-saf/lib/config.mjs`) holds, per role, the effort for size S and size M cards. Roles not
   in the table keep their role effort in every mode. The table's values are the decision D-016 — the spec does not
   copy them.
3. Effort for a card (`cardEffort(config, card)` in `kit/tools-saf/lib/effort.mjs`): `models.overrides[role].effort`
   when set → in `by-size` mode `EFFORT_BY_SIZE[role][size]` when present → the role's effort from `roleTable`.
4. The agent for a card is `<role>` when its effort equals the effort in `<role>.md` (the role effort), otherwise
   `<role>-<effort>`.
5. The designer's large design work — a plan that adds a new spec file or a decision row affecting more than one card
   — uses `designer` (the role effort); other designer work uses the designer's by-size agent. The generated
   `/saf-plan` command states this rule; the main session applies it (the engine cannot see the plan before it is
   written).

### Agent files

6. In `by-size` mode setup writes, besides `<role>.md`, one file `.claude/agents/<role>-<effort>.md` for every enabled
   role and every effort its `EFFORT_BY_SIZE` row reaches that differs from its role effort (after overrides). In
   `fixed` mode no variant file is planned.
7. A variant file is rendered from the same role template with `name: <role>-<effort>`, `effort: <effort>`, the same
   model and tools, and a description that starts with `Same as <role> at <effort> effort — use it only when
   task:start names it.`
8. `saf upgrade` (`refreshKitFiles`) writes missing or unedited variant files and removes unedited variant files that
   are no longer planned (as for skills); edited ones are kept and listed. Base agent files stay setup-only.
9. `docs:check` accepts `<role>-<effort>.md` for an enabled role when `effort` in its frontmatter equals the suffix
   and `name` equals the file name; any other extra agent file keeps today's check result. A custom role whose name
   equals a possible variant name (`<role>-<effort>` of an enabled role) is a config error.

### Per machine

10. `models.effort` joins `LOCAL_KEYS`: the untracked `saf.config.local.json` may set it. Source order: local file →
    `saf.config.json` → default; the resolved config records `models.effortSource` (as `workflow.testModeSource`). A
    local `by-size` on a project whose tracked mode is `fixed` has no variant files: the engine names the base agent
    and `task:start` prints one warning saying setup must run with `by-size` for the variant agents.

### Shown and measured

11. `task:start <id>` prints `agent <name> · effort <effort> · size <S|M> · models.effort <mode> (<source>)` and stores
    `started.effort: { agent, effort, mode, source }` in the evidence. The session-start summary shows the agent on
    the in-progress card's line, and the generated `/saf` card loop's build step says: use the agent `task:start`
    named.
12. `task:report <M>` adds a table "Effort and review rounds": one row per (size, effort) pair among the milestone's
    cards with started effort — cards · reviewed · passed review first time · total review rounds · verify attempts.
    Cards started before this change are counted in a row `—`.

### Setup

13. `saf choices` group 4 has the question `effort` (key `models.effort`, options `fixed` · `by-size`) with what it is
    · good for · cost · pick it when, in en and th, every sentence true to the code: by-size lowers effort only for
    the roles and sizes the table lists; S cards at lower effort may bounce more in review; the report shows rounds by
    size and effort; a person can override it per machine. No digits and no model ids in the text (as every
    explanation).
14. `questions.md` group 4 has a row for `models.effort` (default `fixed`); `docs/setup-questions.md`,
    `docs/config-reference.md` (`models` section) and `docs/roles.md` describe the setting and the variant files.

## 3. Data

- `EFFORT_BY_SIZE`, `LOCAL_KEYS`, defaults, `roleTable`: `kit/tools-saf/lib/config.mjs`
- `cardEffort`, `variantAgents`: `kit/tools-saf/lib/effort.mjs`
- Variant files: `plannedFiles` / `refreshKitFiles` in `kit/tools-saf/lib/generate.mjs` · agent check
  `kit/tools-saf/lib/docs.mjs`
- `models.effort`: schema `kit/tools-saf/schema/saf.config.schema.json`
- Explanations: `kit/tools-saf/lib/choices.mjs` · interview `kit/claude/skills/saf-setup/questions.md`

## 4. Edge cases and errors

- A card without `size` (legacy) → treated as M for effort, and `task:start` says so.
- A role in `models.overrides` with an effort → the override wins in both modes; no variant is planned for it unless
  the override itself differs from the role effort (then `<role>.md` already carries it — no variant).
- A role disabled later → its unedited variant files are removed by upgrade and re-run (rule 8).
- Invalid `models.effort` in the local file → the config error names the local file (as for `workflow.testMode`).

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| EFFORT-AC-01 | configs in `fixed` and `by-size` mode, with and without an override | `cardEffort` for S and M cards of each table role and a role outside the table | effort and agent name follow rules 3–4 | unit |
| EFFORT-AC-02 | a `by-size` config | setup plans files | one variant file per role and differing effort, with the name, effort, model, tools and description of rule 7; none in `fixed` mode | unit |
| EFFORT-AC-03 | a project switched from `by-size` to `fixed`, one variant edited | `saf upgrade` | the unedited variant is removed, the edited one kept and listed; base agent files untouched | integration |
| EFFORT-AC-04 | variant files present | `docs:check` | passes for valid variants; fails for an effort/suffix mismatch or a variant of a disabled role; a custom role named like a variant is a config error | unit |
| EFFORT-AC-05 | tracked `fixed`, local file `by-size` | config resolves and `cardEffort` runs | mode `by-size` with source the local file; `cardEffort` names the base agent and returns the missing-variants warning | unit |
| EFFORT-AC-06 | a `by-size` project and an S card | `task:start` | prints the agent line of rule 11, evidence has `started.effort`, the session summary shows the agent | unit |
| EFFORT-AC-07 | cards of both sizes with review rounds, one started before this change | `task:report <M>` | the table has one row per (size, effort) pair and a `—` row with correct counts | unit |
| EFFORT-AC-08 | the choices table | `saf choices --group 4` in en and th | the `effort` question and both options are explained in every field, within `FIELD_MAX`, with no digits or model ids; `models.effort` is asked, not in the not-asked list | unit |

## 6. Out of scope

- Choosing effort by anything other than size and role (spec size, risk labels)
- Changing the effort of the main session itself (set by the person who opens it)
- Effort of the spec-reviewer per card size (it reviews at its role effort)
