# `saf.config.json` reference

Validated by `tools/saf/schema/saf.config.schema.json` (unknown keys are errors). `node tools/saf/bin/saf.mjs config --check`
validates; every engine command validates on load. Missing keys get the defaults below; `null` means "derive".

## project

| Key | Default | Notes |
|---|---|---|
| `name` · `pitch` · `domain` · `users` | detected / "" | shown at the top of CLAUDE.md |
| `type` | `web-app` | web-app · mobile · game · api · erp · data-ai · library-cli · other — selects rule templates |
| `stage` | `prototype` | idea · prototype · mvp · production |
| `rigor` | `standard` | light · standard · strict — derives sizes, test caps, review and merge checks |

## people

| Key | Default | Notes |
|---|---|---|
| `ownerTitle` | `owner` | how documents and agents refer to you |
| `docLanguage` · `chatLanguage` | `en` | `en` or `th`; generated docs and STATE use `docLanguage` |
| `uiLanguages` · `i18nRequired` | `["en"]` · false | adds the i18n rule and the UI rule text |
| `timeZone` | `UTC` | timestamps in STATE.md and reports |

## stack

| Key | Default | Notes |
|---|---|---|
| `packageManager` | `npm` | pnpm · npm · yarn · bun · none — decides how every command is written |
| `commands`: `typecheck` · `lint` · `test` · `e2e` · `build` | "" | the project checks; only commands whose scripts exist are used |
| `commands`: `testFiles` | "" | runs only some test files; `{files}` becomes the quoted file paths (`node --test {files}` · `vitest run {files}` · `pytest {files}`); empty = cards fall back to the full suite |
| `database` · `monorepo` · `submodules` · `summary` | none · false · false · "" | `database` ≠ none adds the database rule |

## models

See [model-presets.md](model-presets.md).

| Key | Default | Notes |
|---|---|---|
| `preset` | `balanced` | max · balanced · economy · custom — picks the planner and builder models |
| `planner` · `builder` | from the preset | full model ids; a non-empty value replaces the preset's model for every preset, and `custom` has no models of its own |
| `sessionDefault` | the builder model | the model the generated CLAUDE.md tells a session opened without `--model` to start with; nothing enforces it |
| `overrides` | {} | per role, `{ "<role>": { "model": …, "effort": … } }` — e.g. `{"qa-runner": {"effort": "low"}}`; not asked by the interview |

## roles

See [roles.md](roles.md).

| Key | Default | Notes |
|---|---|---|
| `enabled` | the core roles | optional library roles to add; the core roles are always on |
| `custom` | [] | your own roles, each with `name` and `description` |
| `reportLanguage` | `en` | `en` or `th`; the language agents report in |

## skills

| Key | Default | Notes |
|---|---|---|
| `packs` | from the answers (`null` = derive) | any of ui-frontend · db-migrations · performance · i18n · mobile · game — see [skills.md](skills.md) |

## workflow

| Key | Default | Notes |
|---|---|---|
| `sizes` · `testCaps` | from rigor | `{ "S": 150, "M": 400 }` changed code lines |
| `review` | from rigor | m-cards · every-card · every-card+security |
| `worktrees` | true | parallel lanes; with worktrees off all cards run in the main folder |
| `lanes`: `code` · `main` | 3 · 1 | how many cards may run at once in the code lane and in the main lane |
| `sideLanes`: `enabled` · `max` | true · 1 | side cards (`side_cards:` of a planned milestone) may run beside the active milestone; `max` in progress at once — [card-lifecycle.md](card-lifecycle.md#side-lanes) |
| `worktreeDir` · `branchPrefix` | `.claude/worktrees` · `card/` | |
| `solo` | [] | globs whose cards run alone in the code lane (e.g. migrations) |
| `laneInstall` | from the package manager | run in a new lane (`npm ci`, `pnpm install --frozen-lockfile`, …) |
| `lanePorts`: `base` · `step` · `env` | 3000 · 10 · `["PORT"]` | `task:env` exports each variable named in `env` as `base+step×lane` (`PORT=base+step×lane` by default) |
| `laneDb` | "" | test database pattern, `{n}` = lane, `{name}` = project name |
| `mergeChecks` | from rigor + check-secrets + docs:check | commands `task:merge` runs before committing |
| `mergeInstall` | from the package manager | `{ cmd, files }` — reinstall when these files change in a merge |
| `measure`: `enabled` | true | the measure lock: one measured command at a time across every worktree |
| `measure`: `waitMs` | 1200000 (20 min) | how long a command waits for the lock or a quiet machine before it gives up with exit 75 |
| `measure`: `maxLoadPerCore` | 0.5 | a command whose name has `idle: true` starts only when the machine load per core is at or under this |
| `measure`: `names` | `{ test: {idle:false}, e2e: {idle:false}, perf: {idle:true}, adhoc: {idle:true} }` | the command names the lock knows; `idle: true` also waits for a quiet machine |
| `perfBudgets` | "" | path shown to qa-runner |
| `alwaysAllowed` | [] | extra globs never counted as card changes |
| `commandTimeoutMs` | 1800000 (30 min) | time limit for each command of card verify, merge checks and culprit runs |
| `testMode` | `milestone` | how often the full test suite runs: `every-card` · `targeted` · `milestone` — [card-lifecycle.md](card-lifecycle.md#test-mode); a person can override it, see [`saf.config.local.json`](#safconfiglocaljson) |

## `saf.config.local.json`

An optional file in the project root, **not tracked by git** (the installer adds it to `.gitignore`), for choices that belong
to one machine. Today it may hold only `workflow.testMode`:

```json
{ "workflow": { "testMode": "every-card" } }
```

Any other key is an error that names the key — including `$schema`, so leave it out. The file is checked with the same schema
as `saf.config.json`. The test mode is the first source that sets it: environment variable `SAF_TEST_MODE` → this file →
`saf.config.json` → the default. Only engine runs (`task:*`) read it; generated files never do.

## policies

| Key | Default |
|---|---|
| `push` | `owner-order` (or `allowed`) |
| `deploy`: `mode` · `target` · `exceptions` | `owner-order` · "" · "" (`mode` may also be `allowed` or `none`) |
| `protectedBranches` · `autoDeployBranches` | `["main"]` · [] |
| `noForcePush` | true |
| `secrets`: `envFiles` · `extraPatterns` | `[".env", ".env.local", ".env.*.local"]` · [] — `extraPatterns` are extra regular expressions that `check-secrets` treats as secrets |
| `forbiddenPaths` · `ownerOnlyPaths` | [] — copied into each card's `dont_touch` and CLAUDE.md |
| `externalServices` | [] |
| `noTimeEstimates` · `evidenceRequired` | true · true |

## tokenSaving

`enabled` · `silentInterim` · `batchReviewerNotes` · `reviewerDiff` · `fixFlakyFirst` (all true).

## firstMilestone

`goal`: text; non-empty → M1 is drafted as `planned`.
