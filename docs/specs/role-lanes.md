# Spec — a project can move a role to the other lane (`roles.lanes`)

Decision: [D-020](../DECISIONS.md) (proposed). Card: T-M3-28. Builds on [lane-caps.md](lane-caps.md) (D-018: the
main-folder lane holds exactly one card).

## 1. Purpose

The lane of a built-in role is fixed in `ROLE_LIBRARY` (`kit/tools-saf/lib/config.mjs`). Cards of a main-lane role
(`art-producer`, `content-writer`, `security-auditor`, …) work in the main folder one at a time, so a long
image-generation card blocks every other main-folder card although its files are separate. A project setting moves a
role to the other lane. Moving a role **into** the code lane is the useful case: its cards get a worktree and run beside
other cards. Moving a role into the main lane is allowed too (its cards then queue in the main folder).

Why it is safe: a code-lane card works in its own git worktree on its own branch; `task:verify` there counts files from
the lane's start commit, so cards cannot mix; `task:merge` brings lanes back one at a time behind the merge checks;
overlapping `touch` still keeps two cards on the same files apart. What it costs: one checkout plus the lane install
step per card (`workflow.laneInstall`), disk for large media in every worktree, and generated binary files cannot be
merged by git when two branches change the same file (the touch check prevents this inside the plan, not outside it).

## 2. Rules

1. New setting `roles.lanes`: an object, role name → `code` or `main`. Default `{}` (every role keeps its library lane).
   The schema checks the values (`additionalProperties` with the enum); the names are checked by rule 2.
2. A key must be a role of `ROLE_LIBRARY` whose entry has no `laneLocked: true`. `laneLocked` is set on `designer`,
   `spec-reviewer` and `release-operator` (data in `ROLE_LIBRARY`): the designer edits plan files the main folder reads
   (cards on a branch stay invisible to `task:state` until merged), the spec-reviewer is read-only and runs no cards,
   the release-operator acts on live systems and must work from the merged main folder. A custom role's name is
   refused too — its lane is `roles.custom[].lane`. Any other name is unknown. `validateConfig` returns one error per
   bad key naming the key and the reason, so `/saf-setup`, `config --check` and `loadConfig` refuse the config.
3. `roleTable` gives a role the lane `roles.lanes[name]` when set, else today's lane (library or custom field, else by
   tier). A key for a role that is not enabled has no effect and is not an error.
4. Nothing else reads a lane: `laneOf`, `pickParallel` (`task:next --parallel`), `startCard` (the `--worktree` refusal
   for non-code-lane cards) and the session summary all go through `roleTable`. `workflow.lanes.main` stays exactly 1
   and `startCard` keeps refusing a second main-folder card.
5. With `workflow.worktrees` off or `workflow.lanes.code` 0 every card works in the main folder, whatever `roles.lanes`
   says (unchanged `laneOf`).
6. Setup choices (rules of [setup-choices.md](setup-choices.md) apply — four fields en + th, at most `FIELD_MAX`, no run
   of two digits, no model id; every sentence true of the code): a `value` question `role-lanes` in group 6 with the
   key `roles.lanes` and one explanation (what it does · good for · cost · set it when, naming the locked roles' reason
   in words); `kit/claude/skills/saf-setup/questions.md` gets the row (asked only when worktree lanes are on;
   recommended: leave it empty). Explanations that state a role's lane as fixed (today `extra-roles` / `art-producer`:
   "never in a parallel lane") say "by default" and name `roles.lanes`.
7. Docs: `docs/roles.md` — the Lane column is the default lane, plus a section "Moving a role to the other lane" with
   the why-safe and cost text of §1 and the locked roles; `docs/config-reference.md` `roles` section — the key;
   `docs/card-lifecycle.md` — the role lists per lane say "by default" and link to `docs/roles.md`;
   `docs/setup-questions.md` — the row. No per-machine override (`LOCAL_KEYS` unchanged).

## 3. Data

- `ROLE_LIBRARY[*].lane` (default lane) and `ROLE_LIBRARY[*].laneLocked` in `config.mjs`.
- Schema: `roles.lanes` in `kit/tools-saf/schema/saf.config.schema.json`.
- Choices: `QUESTIONS` / `CHOICES` in `choices.mjs`.

## 4. Edge cases and errors

- `roles.lanes: { "art-producer": "main" }` (same as the default) — accepted, no effect.
- A role moved to `code` while a card of it is in progress in the main folder — that card keeps working there (its
  evidence has no lane); the setting applies to the next start.
- A role moved to `main` while one of its lane cards is open — the lane keeps working and merges as today
  (`task:merge` reads the evidence, not the role).
- Side cards follow the same lane (`pickParallel` already counts side cards per lane).

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| RLANE-AC-01 | worktrees on, `lanes.code: 2`, `roles.lanes: { "art-producer": "code" }`, an art-producer card and an implementer card with separate touch | `pickParallel` | both are in `parallel.code`; without the setting the art-producer card is in `parallel.main` | unit |
| RLANE-AC-02 | the same config | `startCard(<art-producer card>, { worktree: true })` | a lane opens; without the setting it is refused with the `--worktree is for code-lane cards` message | unit |
| RLANE-AC-03 | `roles.lanes: { "implementer": "main" }`, two implementer cards with separate touch | `pickParallel`; `startCard(…, { worktree: true })` | at most one of them is picked (main cap); `--worktree` is refused | unit |
| RLANE-AC-04 | `roles.lanes` with `designer`, `spec-reviewer`, `release-operator`, a custom role name, an unknown name, and a value `side` | `validateConfig`; `loadConfig` | one error per key naming it and the reason (locked · custom · unknown · value); `loadConfig` throws `ConfigError` | unit |
| RLANE-AC-05 | worktrees off, `roles.lanes: { "art-producer": "code" }` | `laneOf` | `main` | unit |
| RLANE-AC-06 | the choices data | `saf choices --group 6` in en and th | `role-lanes` has four fields within `FIELD_MAX`, no digit runs; `roles.lanes` is asked (not in `NOT_ASKED`) and in the Key column of `questions.md`; no explanation says art-producer cards never run in a lane without "by default" | unit |
| RLANE-AC-07 | the docs | read `docs/roles.md` and `docs/config-reference.md` | both name `roles.lanes`; the locked roles listed in `docs/roles.md` equal the `laneLocked` roles of `ROLE_LIBRARY` | unit |

## 6. Out of scope

- A per-machine override (not needed: the lane is a property of the project's roles).
- More than one main-folder card at a time (D-018).
- Moving the lane of a single card (cards follow their role).
