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
| `commands.typecheck/lint/test/e2e/build` | "" | the project checks; only commands whose scripts exist are used |
| `database` · `monorepo` · `submodules` · `summary` | none · false · false · "" | `database` ≠ none adds the database rule |

## models · roles

See [model-presets.md](model-presets.md) and [roles.md](roles.md): `models.preset/planner/builder/sessionDefault/overrides`,
`roles.enabled/custom/reportLanguage`.

## skills

| Key | Default | Notes |
|---|---|---|
| `packs` | from the answers (`null` = derive) | any of ui-frontend · db-migrations · performance · i18n · mobile · game — see [skills.md](skills.md) |

## workflow

| Key | Default | Notes |
|---|---|---|
| `sizes` · `testCaps` | from rigor | `{ "S": 150, "M": 400 }` changed code lines |
| `review` | from rigor | m-cards · every-card · every-card+security |
| `worktrees` · `lanes` | true · `{ code: 3, main: 1 }` | parallel lanes; with worktrees off all cards run in the main folder |
| `worktreeDir` · `branchPrefix` | `.claude/worktrees` · `card/` | |
| `solo` | [] | globs whose cards run alone in the code lane (e.g. migrations) |
| `laneInstall` | from the package manager | run in a new lane (`npm ci`, `pnpm install --frozen-lockfile`, …) |
| `lanePorts` | `{ base: 3000, step: 10, env: ["PORT"] }` | `task:env` exports `PORT=base+step×lane` |
| `laneDb` | "" | test database pattern, `{n}` = lane, `{name}` = project name |
| `mergeChecks` | from rigor + check-secrets + docs:check | commands `task:merge` runs before committing |
| `mergeInstall` | from the package manager | `{ cmd, files }` — reinstall when these files change in a merge |
| `measure` | enabled, 20 min wait, 0.5 load/core | `names`: `{ test: {idle:false}, e2e: …, perf: {idle:true}, adhoc: … }` |
| `perfBudgets` | "" | path shown to qa-runner |
| `alwaysAllowed` | [] | extra globs never counted as card changes |
| `commandTimeoutMs` | 30 min | per criteria command |

## policies

| Key | Default |
|---|---|
| `push` | `owner-order` (or `allowed`) |
| `deploy` | `{ mode: "owner-order", target: "", exceptions: "" }` (mode `allowed` or `none`) |
| `protectedBranches` · `autoDeployBranches` | `["main"]` · [] |
| `noForcePush` | true |
| `secrets` | `{ envFiles: [".env", ".env.local", ".env.*.local"], extraPatterns: [] }` — extra regexes for `check-secrets` |
| `forbiddenPaths` · `ownerOnlyPaths` | [] — copied into each card's `dont_touch` and CLAUDE.md |
| `externalServices` | [] |
| `noTimeEstimates` · `evidenceRequired` | true · true |

## tokenSaving · firstMilestone

`tokenSaving`: `enabled`, `silentInterim`, `batchReviewerNotes`, `reviewerDiff`, `fixFlakyFirst` (all true).
`firstMilestone.goal`: text; non-empty → M1 is drafted as `planned`.
