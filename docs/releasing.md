# Releasing

How SAF can release a project by itself — and how to set up the one part it cannot do for you: publishing from a tag.
Automatic release is **off by default**. Nothing here runs until you turn it on in `saf.config.json`.

A release cannot be undone: a published npm version is permanent. So SAF releases only when every guard holds, writes down
what it did before it does it, and stops at once when the kill switch is off.

## The setting and the kill switch

```json
"policies": { "release": { "auto": "on", "packages": [".", "packages/app"], "versionFiles": ["VERSION"], "ciWorkflow": "ci.yml" } }
```

| Key | Default | Meaning |
|---|---|---|
| `auto` | `off` | `on` lets SAF push the release commit and the tag. Anything else: SAF never releases |
| `packages` | `["."]` | folders whose `package.json` are released together, at one version |
| `versionFiles` | `[]` | text files that hold only the version number |
| `ciWorkflow` | `ci.yml` | the CI workflow file that must be green on the release commit |

**Kill switch:** `auto` must be `on` in `saf.config.json` at your checkout **and** on `origin/<release branch>` (the first
entry of `policies.protectedBranches`, `main` when empty). To stop every release that has not published yet, set `auto` to
`off` on `main` — the tag workflow reads it again right before each publish.

## The steps

1. Close the milestone (`status: done`) and run `npm run task:verify -- <M>`.
2. `npm run task:release -- <M>` — a **dry run**: prints every guard with ✓ or ✗, the next version and what the next step
   would do. It writes nothing.
3. `npm run task:release -- <M> --prepare` — sets the version everywhere, moves `## Unreleased` to the new version in
   `CHANGELOG.md`, appends one line to `docs/plan/releases.md`, commits as `chore(release): v<version> (<M>)` and pushes with a
   plain `git push`.
4. Wait for CI on that commit.
5. `npm run task:release -- <M> --tag` — creates the annotated tag `v<version>` and pushes only that tag.
6. Your tag workflow publishes (next section). SAF never runs `npm publish` itself.

The version comes from `CHANGELOG.md`: a `### Breaking` section under `## Unreleased` is a major bump (minor while the
major is 0), any other filled section except `### Fixed` is minor, only `### Fixed` is patch.

## The guards

- **G-switch** — the kill switch is on, at your checkout and on `origin/<release branch>`
- **G-branch** — you are on the release branch, the worktree is clean, no card is in progress, HEAD equals the remote branch
- **G-milestone** — the milestone is done, every card is done, no exit gate failed, and since the gate evidence only release
  files changed (`CHANGELOG.md`, the released `package.json` files, version files, `docs/plan/`, `.saf/plan.md`)
- **G-version** — `Unreleased` has content, all packages share one version, the next version is above everything on the npm
  registry, and the tag `v<version>` exists nowhere yet
- **G-ci** (tag step) — the newest CI run of that exact commit succeeded, every job
- **G-log** (tag step) — the release log has the entry `--prepare` wrote

A guard that cannot read what it needs (no network, `gh` not logged in) fails — it never counts as a pass.

## What your tag workflow must do

SAF does not publish; a workflow in your repository does, on the tag. This repository's
[`.github/workflows/release.yml`](../.github/workflows/release.yml) is the example. A workflow that is safe to copy:

1. Runs only on `push` of tags `v*` — no branch, pull-request or manual trigger.
2. Asks for `contents: read` at the top, and in its one job `contents: write` (the GitHub release) and `id-token: write`
   (how npm recognises the run). No stored npm token anywhere.
3. Runs in a GitHub environment (here `npm`) that only tags can deploy to.
4. Checks the tag name first, passes it to scripts as an environment variable — never inside the script text.
5. Uses Node 22.14.0 or newer and npm 11.5.1 or newer (trusted publishing needs both) on a GitHub-hosted runner.
6. Runs a guards step before anything is published and stops if it fails. Here: `node scripts/release-check.mjs guards "$TAG"` — the tag equals
   `v` + every package version and version file, the commit is the release commit and is on the release branch, `CHANGELOG.md`
   has the section, CI was green on the commit with a job for every operating system of its matrix, and `auto` is `on` on
   `origin/main`.
7. Publishes each package with `npm publish … --provenance`, in order, checks the kill switch right before each one, skips a
   version that is already on npm (so a re-run after a partial failure is safe), and waits until the first package is visible
   before the next.
8. Creates the GitHub release with the CHANGELOG section as notes, skipped when it exists.

`node scripts/release-check.mjs workflow` checks this repository's file against these rules without any network.
Actions are the first-party `actions/checkout` and `actions/setup-node` by major version tag, as in `ci.yml`; pin them to full
commit ids if your policy asks for it (`release-check workflow` accepts both).

## Set up npm trusted publishing (once, in a browser)

Names must match exactly; they are case-sensitive. npm does not test the settings when you save them: a mistake shows up
only at the first publish. A new setting also expires if its first publish does not happen within 2 days — so do this
shortly before the first release tag.

1. npmjs.com → your package → **Settings** → **Trusted Publisher** → **GitHub Actions**. Fill in: organization or user, the
   repository name, workflow filename `release.yml` (the file name only, with `.yml`), environment name `npm`. Save.
   Do it for **every** released package. This repository: `Bellero-Advanced` · `super-agent-framework` · `release.yml` · `npm`,
   for both `super-agent-framework` and `create-saf`.
2. Each `package.json` needs a `repository.url` that equals the GitHub repository, or provenance fails.
3. GitHub → repository → **Settings** → **Environments** → New environment `npm` → **Deployment branches and tags** →
   *Selected branches and tags* → add a **tag** rule `v*`. Add *required reviewers* only if you want a person to approve every
   release (it breaks full automation).
4. GitHub → **Settings** → **Rules** → **Rulesets** → new **tag** ruleset for `v*`: restrict updates and deletions, no bypass —
   a release tag then can never move.
5. After the first automatic release works: each package → **Settings** → **Publishing access** → *Require two-factor
   authentication and disallow tokens*. Delete old publish tokens you no longer need (npmjs.com → Account → Access Tokens).
6. The machine that runs `task:release`: `gh auth login` done, `git push` to origin works, Node 20 or newer.

## Branch protection: decide before the first release

`--prepare` pushes the release commit straight to the release branch with the credentials of the machine that runs it. If that
branch requires pull requests, the push is rejected (SAF keeps the local commit and stops; it never forces). Either give that
account a bypass for this one push, or keep `auto` at `off` and release by hand. SAF has no pull-request release path.

## What SAF cannot do

- Set up the trusted publisher or the GitHub environment — that is you, in the npm and GitHub web pages
- Push or tag without the git and `gh` credentials of the machine that runs it
- Tell that a change is breaking when nobody wrote it under `### Breaking`
- Undo a publish — a bad release is fixed by the next patch version
- Release while CI is red, or while GitHub or npm is down

## When a run fails

- **The workflow failed before it published:** fix the cause, then use GitHub's **Re-run jobs**. Never move or delete the tag.
- **One package published, the other did not:** re-run the job. The published one is skipped, the other is published.
- **Everything published but the GitHub release failed:** re-run the job. Both publishes are skipped, the release is created.
- **The guards step fails:** the message names the guard. A tag pushed by hand, a missing CHANGELOG section or a switch turned
  off after tagging all stop here, before anything is published.
