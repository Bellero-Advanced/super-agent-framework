# SAF setup questions

Every question, the `saf.config.json` key it sets, the options, and the recommended default.
"detected" = from `node tools/saf/bin/saf.mjs detect`.

## 1. Language and people

| Question | Key | Options | Recommended |
|---|---|---|---|
| Which language should we chat in? | `people.chatLanguage` | th · en | the language the user wrote in |
| Which language for project documents? | `people.docLanguage` | th · en | same as chat |
| What should agents call you? | `people.ownerTitle` | owner · founder · lead · free text | owner (Thai documents: a Thai title the user prefers) |
| Which languages does the product UI use? | `people.uiLanguages` · `people.i18nRequired` | one language · several (i18n required) · no UI | detected / chat language; i18n on when more than one |
| Your time zone (for timestamps in status files)? | `people.timeZone` | IANA name | the system time zone |

## 2. Project

| Question | Key | Options | Recommended |
|---|---|---|---|
| Name · one-line pitch · users / market · domain (free text) | `project.name` · `project.pitch` · `project.users` · `project.domain` | — | detected name and description |
| What kind of project? | `project.type` | web-app (web app / SaaS) · mobile · game · api · erp · data-ai · library-cli · other | from frameworks detected |
| What stage is it at? | `project.stage` | idea · prototype · mvp · production | prototype (production if it has users) |
| How strict should the workflow be? | `project.rigor` | light · standard · strict | standard |

Rigor sets defaults the user can still override:

| Rigor | Card size S / M (code lines) | Test caps S / M | Review | Merge checks |
|---|---|---|---|---|
| light | 200 / 500 | 300 / 800 | spec review for size-M cards | test |
| standard | 150 / 400 | 250 / 600 | spec review for every card | typecheck · lint · test |
| strict | 100 / 300 | 200 / 500 | every card + security audit per milestone | typecheck · lint · test · build |

## 3. Stack

| Question | Key | Options | Recommended |
|---|---|---|---|
| Package manager? | `stack.packageManager` | pnpm · npm · yarn · bun · none (no Node tooling — SAF commands run as `node tools/saf/bin/saf.mjs …`) | detected from the lock file |
| Are these the real commands? (typecheck · lint · test · e2e · build) | `stack.commands.typecheck` · `stack.commands.lint` · `stack.commands.test` · `stack.commands.e2e` · `stack.commands.build` | confirm · edit | detected scripts; empty when none |
| Database? | `stack.database` | none · PostgreSQL · MySQL · SQLite · MongoDB · Supabase · other | detected |
| Monorepo? Git submodules? | `stack.monorepo` · `stack.submodules` | yes · no | detected |
| Stack in one line (free text, optional) | `stack.summary` | — | frameworks detected |

npm needs `--` before arguments (`npm run task:verify -- T-M1-01`); the generated docs already show it that way.

## 4. Models

| Question | Key | Options | Recommended |
|---|---|---|---|
| Model preset? | `models.preset` | Max · Balanced · Economy · Custom | Balanced |
| Custom only: planner model · builder model | `models.planner` · `models.builder` | full model ids | — |
| Model for sessions opened without `--model`? | `models.sessionDefault` | builder model · planner model | builder model |

| Preset | Planner roles (designer · spec-reviewer · security-auditor) | Builder roles (implementer · qa-runner · others) |
|---|---|---|
| Max | `claude-fable-5-2` | `claude-opus-5-5` |
| Balanced | `claude-opus-5-5` | `claude-sonnet-5-5` |
| Economy | `claude-sonnet-5-5` | `claude-haiku-5-5` |

Effort is fixed per role and is the same in every preset (designer high · spec-reviewer high · implementer high ·
qa-runner medium · …). Per-role changes go in `models.overrides` (`{"qa-runner": {"effort": "low"}}`).

## 5. Roles and skills

Core roles are always on: `designer` · `spec-reviewer` (read only) · `implementer` · `qa-runner`.

| Question | Key | Options | Recommended |
|---|---|---|---|
| Extra roles? (multi-select) | `roles.enabled` | art-producer · db-guardian · release-operator · security-auditor · data-engineer · content-writer | by type: game → art-producer · database → db-guardian · deploys → release-operator · strict rigor → security-auditor · data-ai → data-engineer · several UI languages → content-writer |
| A custom role? (name · what it does · planner or builder · focus) | `roles.custom` | — | none |
| Language of agent reports? | `roles.reportLanguage` | en · th | en (fewer tokens) |
| Optional skill packs? (multi-select) | `skills.packs` | ui-frontend · db-migrations · performance · i18n · mobile · game | by answers: web-app/mobile/game/erp → ui-frontend · a database → db-migrations · game → performance + game · several UI languages → i18n · mobile → mobile |

Core skills are always installed and load by themselves when the work matches: `debug-protocol` · `tdd` · `code-review` ·
`security-review` · `writing-for-agents` · `handoff` · `evidence-before-done` · `test-runner`. Each pack adds one skill of
the same name. Leaving `skills.packs` out uses the recommendation above.

## 6. Workflow

| Question | Key | Options | Recommended |
|---|---|---|---|
| Run cards in parallel lanes (git worktrees)? | `workflow.worktrees` · `workflow.lanes.code` · `workflow.lanes.main` | on (code 3 · main 1) · on (custom caps) · off | on for standard/strict, off for light |
| Side lanes — let cards of a later (planned) milestone run beside the active one, e.g. a landing page? | `workflow.sideLanes.enabled` · `workflow.sideLanes.max` | on (1 at a time) · on (more at a time) · off | on, 1 at a time |
| Paths that only one card may touch at a time? | `workflow.solo` | globs | none (lock files are handled automatically) |
| Ports per lane for dev servers? | `workflow.lanePorts.base` · `workflow.lanePorts.step` · `workflow.lanePorts.env` | base · step · env names | base 3000 · step 10 · `PORT` |
| Test database name per lane? | `workflow.laneDb` | pattern with `{n}` | empty; with a database: `<name>_lane{n}_test` |
| Measure lock (heavy commands one at a time on this machine)? | `workflow.measure.enabled` | on · off | on |
| Performance budget file? | `workflow.perfBudgets` | path · none | none |
| Override card size caps? | `workflow.sizes` · `workflow.testCaps` | numbers | from rigor |
| Override merge checks? | `workflow.mergeChecks` | list of commands | from rigor (only commands whose scripts exist) |
| How often should the full test suite run? | `workflow.testMode` | every-card · targeted · milestone | milestone (the fastest; each person can override it on their own machine — see below) |
| Command that runs only some test files? | `stack.commands.testFiles` | command with `{files}` · empty | from the test runner: `node --test {files}` · `vitest run {files}` · `jest {files}` · `pytest {files}`; empty = cards fall back to the full suite |

### Test mode — explain each choice before asking

Show this table (translate it into the chat language) and ask the question once. A card always proves itself with a real
test run; the mode only decides how often the **full** suite runs. In the two deferred modes a card's evidence carries
its targeted-test run marked "full suite deferred to gate". In `milestone` mode the exit gate always runs the full suite; in `targeted` mode the full suite runs when a lane card merges.

| Mode | What it is | Good for | Cost | Pick when |
|---|---|---|---|---|
| `every-card` | The full suite runs at every card's verify and again at merge | Catching a break on the very card that caused it; small suites | The slowest: the same suite runs two or three times per card | The suite takes seconds, or the project is high-risk (money, safety, data) |
| `targeted` | Each lane card verifies with its own changed and scenario tests; the full suite runs once per card, when the card reaches the main branch | A middle path: one full run per card, no repeat | A break in untouched code shows at merge, not at verify; main-folder cards still run the full suite at verify | The suite takes a few minutes and you want every merge proven (SAF's own repository uses `targeted`) |
| `milestone` (recommended) | Each card verifies with its own tests; merge skips the full suite; the full suite runs once at the milestone exit gate | The fastest loop; weak machines; large suites | A break elsewhere is found only at the gate — `task:culprit <M>` then finds the card by binary search (extra runs, but only when the gate fails) | Most projects: the suite takes more than a minute, or the machine is slow |

Targeted runs need `stack.commands.testFiles`. Without it (or when a card changes no test file and names no scenario),
the card runs the full suite instead — nothing is ever skipped without a real test run.

Each person can override the repo's choice on their own machine, without changing a tracked file: the environment variable
`SAF_TEST_MODE`, or an untracked `saf.config.local.json` that holds only `workflow.testMode` (any other key is refused,
including `$schema`). Order: env, then local file, then `saf.config.json`, then the default (`milestone`).

## 7. Policies

| Question | Key | Options | Recommended |
|---|---|---|---|
| Push | `policies.push` | only on your order · allowed | only on your order |
| Deploy | `policies.deploy.mode` · `policies.deploy.target` · `policies.deploy.exceptions` | only on your order · allowed · this project does not deploy | only on your order |
| Protected branches · branches that deploy on push | `policies.protectedBranches` · `policies.autoDeployBranches` | names | `main` · none |
| Never force-push or rewrite history | `policies.noForcePush` | yes · no | yes |
| Env files that hold secrets (never committed, never printed, keys counted only) | `policies.secrets.envFiles` | names | `.env` · `.env.local` · `.env.*.local` |
| Paths agents must never touch · paths only you may edit | `policies.forbiddenPaths` · `policies.ownerOnlyPaths` | globs | none |
| External services agents may touch | `policies.externalServices` | names | none |

Always on (not asked): no time estimates — gates, not dates · "done" needs real run evidence.

## 8. Token saving and the first milestone

| Question | Key | Options | Recommended |
|---|---|---|---|
| Token-saving mode | `tokenSaving.enabled` · `tokenSaving.silentInterim` · `tokenSaving.batchReviewerNotes` · `tokenSaving.reviewerDiff` · `tokenSaving.fixFlakyFirst` | on (all) · choose · off | on: silent on interim agent notifications · reviewer notes batched to the designer at milestone end · reviewer reads a diff file · fix flaky tests first |
| What should work at the end of the first milestone? (free text) | `firstMilestone.goal` | — | — (empty = no M1 draft yet) |

M0 (the setup gate) is always created and active. M1 is created as `planned` from the goal; the designer fills its cards;
work starts when the user says Go.

## Example answers file

```json
{
  "project": { "name": "Shop", "pitch": "Online shop for local makers", "type": "web-app", "stage": "mvp", "rigor": "standard" },
  "people": { "ownerTitle": "owner", "docLanguage": "en", "chatLanguage": "en", "uiLanguages": ["en", "th"], "i18nRequired": true },
  "stack": { "packageManager": "pnpm", "commands": { "typecheck": "pnpm typecheck", "lint": "pnpm lint", "test": "pnpm test" }, "database": "PostgreSQL" },
  "models": { "preset": "balanced" },
  "roles": { "enabled": ["db-guardian", "release-operator"] },
  "skills": { "packs": ["ui-frontend", "db-migrations", "i18n"] },
  "policies": { "deploy": { "mode": "owner-order", "target": "staging" } },
  "firstMilestone": { "goal": "A visitor can sign up and buy one product." }
}
```
