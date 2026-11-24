# Spec — automatic release (guarded, with a kill switch)

Decision: [D-015](../DECISIONS.md) (decided, amends D-004). Cards: T-M3-09 (`task:release` dry run and guards) ·
T-M3-10 (`--prepare` and `--tag`) · T-M3-11 (release workflow with npm trusted publishing, `release-check`, docs).
**Security-relevant:** every card of this spec is built and reviewed with the `security-review` skill — it pushes to
`main`, creates tags and publishes packages.

## 1. Purpose

SAF should ship its own fixes without waiting for a person to type release commands, but a release is the one step
that cannot be undone (npm versions are immutable). So the engine releases only when every guard holds, writes down
what it did before it does it, and stops when the kill switch is off. The engine's part (`task:release`) is generic
and ships to every project, off by default; the npm publish runs only in this repository's GitHub workflow, on a tag
the engine created, through npm trusted publishing (no stored token). The workflow and its guards run from the tagged
commit, so a hand-pushed tag stops before publishing only while that commit's workflow and checks are unchanged —
the owner's tag ruleset is what stops the rest (rule 21).

## 2. Rules

### Setting and kill switch

1. New settings under `policies.release`: `auto` (`off` default · `on`), `packages` (folders whose `package.json` is
   released together, default `["."]`), `versionFiles` (text files that hold only the version, default `[]`),
   `ciWorkflow` (the CI workflow file name, default `ci.yml`). Not per machine (never in `LOCAL_KEYS`). This
   repository: `auto: on`, packages `.` and `packages/create-saf`, version file `kit/tools-saf/VERSION`.
2. Kill switch: `policies.release.auto` must be `on` in `saf.config.json` at HEAD **and** on `origin/<release branch>`
   (read with `git show` after `git fetch`). The release branch is the first entry of `policies.protectedBranches`
   (`main` when empty). The release workflow checks `origin/main` again right before each publish step (rule 18), so
   turning it `off` on `main` stops every release that has not published yet.

### `task:release <M>` — dry run (default)

3. `task:release <M>` evaluates every guard (rules 4–9), prints each as `✓`/`✗` with the reason, then the version and
   the exact actions `--prepare` or `--tag` would take. It writes nothing, pushes nothing, creates no tag. Exit 0 when
   the guards for the next step all hold, 1 when one fails, 2 on usage errors.
4. **G-switch:** rule 2.
5. **G-branch:** the current branch is the release branch, the worktree is clean, no card is in progress in the main
   folder, and HEAD equals `origin/<release branch>` after a fetch (for `--tag`: HEAD is the release commit, rule 11).
6. **G-milestone:** milestone `<M>` has `status: done` (the owner closed it), every card of it is done, its gate
   evidence `docs/plan/evidence/<M>.json` has no gate with `pass: false`, and the files changed between the gate
   evidence `head` and HEAD are only release files: `CHANGELOG.md`, the `package.json` of each released package, the
   version files, anything under `docs/plan/` (closing the milestone, the report, evidence, the release log, friction)
   and `.saf/plan.md`. Anything else → "run `task:verify <M>` again".
7. **G-version:** `CHANGELOG.md` has a non-empty `## Unreleased` section. The bump (`nextVersion` in
   `kit/tools-saf/lib/release.mjs`): a `### Breaking` sub-section → major (minor while the major is 0) · any other
   non-empty sub-section except `### Fixed` → minor · only `### Fixed` → patch. Every released package has the same
   current version; the next version is greater than every version of each package on the registry
   (`npm view <name> versions --json`; unreachable registry → guard fails) and no tag `v<next>` exists locally or on
   origin.
8. **G-ci** (only for `--tag`): the newest run of `ciWorkflow` for the exact HEAD commit (`gh run list --commit`) is
   completed with conclusion `success`, and every job of that run (`gh run view --json jobs`) concluded `success` — a
   skipped, cancelled or missing job fails the guard. `gh` missing or not logged in → guard fails with the reason.
9. **G-log** (only for `--tag`): the release log has the entry for `<next>` written by `--prepare` (rule 10).

### `--prepare` and `--tag`

10. `task:release <M> --prepare` runs only when rules 4–7 hold. It sets `<next>` in the `version` of every released
    package, in each dependency of one released package on another (exact version), and in every version file;
    renames `## Unreleased` to `## <next> — <date>` and adds a new empty `## Unreleased` above it; appends to the
    release log `docs/plan/releases.md` (append-only, created with a header on first use) one entry:
    `- v<next> · <date> · <M> · gate <short head> · from v<previous> · bump <major|minor|patch> (<reason>)`; commits
    exactly those files as `chore(release): v<next> (<M>)`; pushes that one commit with one explicit refspec,
    `git push --no-follow-tags origin <release sha>:refs/heads/<branch>` (never a plain `git push`, never `--force`;
    a rejected push leaves the local commit and exits 1 with the reason and the next step of §4). It pushes nothing
    and exits 1 when HEAD moved while the guards ran, or when another commit landed under the release commit (its
    parent is not the HEAD the guards checked).
11. `task:release <M> --tag` runs only when HEAD's subject is `chore(release): v<version in package.json> (<M>)` and
    rules 4–9 hold. It creates the annotated tag `v<version>` on HEAD (message: the CHANGELOG section) and pushes only
    that tag (`git push --no-follow-tags origin refs/tags/v<version>`). It never moves, replaces or deletes a tag.
12. The engine source for release contains no `--force`, `-f` push, `push --delete`, `tag -d`, `unpublish` or
    `deprecate`, and never runs `npm publish` — publishing belongs to the workflow.
13. Every `task:release` run (dry, prepare, tag) prints the guard list; `--prepare` and `--tag` print each git command
    before running it.
14. The generated `/saf` command: when `policies.release.auto` is `on` and the owner has closed a milestone, the main
    session runs `task:release <M>` (dry), then `--prepare`, waits for CI, then `--tag`, and reports the result; when
    it is `off` it says releases need the owner's order (D-004 wording).

### Release workflow (this repository, T-M3-11)

15. `.github/workflows/release.yml` runs only on `push` of tags matching `v*`. Top-level `permissions: contents: read`;
    the publish job has `contents: write`, `id-token: write` and `actions: read` — nothing more than these three
    (`actions: read` lets the guards of rule 17 read the CI run with `gh run list` / `gh run view`; an explicit
    permissions block leaves every other scope at none) — and runs in the GitHub environment `npm`, on Node ≥ the
    minimum npm trusted publishing needs and an npm CLI ≥ its minimum (both pinned in the workflow, with a comment
    linking npm's trusted-publishing docs).
16. No step references `secrets.NPM_TOKEN`, `NODE_AUTH_TOKEN` or any npm token; publishing authenticates through OIDC
    only, and provenance is attached (trusted publishing adds it).
17. Before publishing, `node scripts/release-check.mjs guards <tag>` checks: the tag equals `v` + the version of every
    released package and the version file · the tag commit is the release commit on the release branch (G-commit,
    rule 22) · `CHANGELOG.md` has the
    `## <version>` section · the CI run for the tag commit is green with every job successful and at least one job per
    OS of the CI matrix (`ubuntu`, `macos`, `windows`, read from `ci.yml`) · `policies.release.auto` is `on` on
    `origin/main`. Reuses `nextVersion`, the CHANGELOG reader and the release-log reader from
    `tools/saf/lib/release.mjs` (no copy). The policy is read from the tag commit's `saf.config.json`: when that file
    is missing, is not valid JSON or fails schema validation, `guards` fails with that reason — never a silent
    default. These checks stop a hand-pushed tag only when the tagged commit's own `release.yml` and
    `scripts/release-check.mjs` are unchanged (rule 21).
18. Publish order: `super-agent-framework`, then wait until `npm view super-agent-framework@<version>` answers (bounded
    retries), then `create-saf`. Before each publish the step runs `node scripts/release-check.mjs published <dir>
    <version>`, whose own exit code decides: 0 (that exact version is on npm) → that publish is skipped (safe re-run
    after a partial failure); 3 (npm answers definitely not found, E404) → publish; every other outcome — exit 1 (a
    crash or Node's default failure exit), exit 2 (usage error), any error, `saf.config.json` unreadable, the folder
    not in `policies.release.packages`, an `npm view` failure other than not-found — stops the job and nothing more is
    published. Exit 3, not 1, means "publish" so that a crashed process can never lead to a publish. The kill-switch check of rule 17 runs again right before each publish. Then
    `gh release create v<version>` with the CHANGELOG section as notes (skipped when it exists), then
    `node scripts/release-check.mjs npm` and `release`.
19. `node scripts/release-check.mjs workflow` (read-only, no network) checks `release.yml` statically for rules 15–16
    and the guards step of rule 17 — the M3 gate runs it.
20. `docs/releasing.md` explains, for maintainers of any SAF project: the setting, the guards, the dry run, prepare and
    tag, the kill switch, what the project's own tag workflow must do (with this repository's workflow as the
    example), npm trusted publishing setup, and what SAF cannot do (rule 21).
21. Honest limits written in `docs/releasing.md`: SAF cannot set up the trusted publisher or the GitHub environment
    (owner, web UI); cannot push or tag without the git and `gh` credentials of the machine running it; cannot tell a
    breaking change nobody wrote under `### Breaking`; cannot undo a publish; cannot release while CI is red or
    GitHub/npm are down; cannot stop a tag on a commit whose workflow was changed: GitHub runs the `release.yml` of
    the tagged commit, which runs that commit's own `scripts/release-check.mjs`, and npm trusted publishing binds only
    repository + workflow file name + environment (not the ref), while the environment rule `v*` accepts any `v*`
    tag — so anyone with write access could push a branch whose workflow or checks skip the guards, tag it, and
    publish through OIDC (the `origin/main` ancestry and kill-switch checks do not help, because that commit's script
    runs). Only the owner's GitHub tag rulesets stop this — two rulesets for `v*`: one restricts creations with a
    bypass only for the account, role, team or app that runs `task:release --tag`; the other restricts updates and
    deletions with no bypass (a bypass belongs to a whole ruleset) — and, optionally,
    required reviewers on the environment `npm`.
22. **G-commit** (in `release-check guards <tag>`, rule 17): the checked-out HEAD is the commit of `<tag>`; the
    release log has the entry for `<tag>` and HEAD's subject is the release commit subject of that entry's milestone;
    the release branch is a plain branch name and `git merge-base --is-ancestor HEAD origin/<release branch>` holds
    (the tagged commit is on the release branch). Any miss → the guard fails with the reason and nothing is published.

## 3. Data

- `nextVersion`, `releaseGuards`, `readChangelog`, `RELEASE_LOG`, `appendReleaseLog`: `kit/tools-saf/lib/release.mjs`
- Registry wait after a publish (tries and delay), job permissions and the other workflow rules: `POLICY` (`wait`,
  `jobPermissions`) in `scripts/release-check.mjs`
- `policies.release`: schema `kit/tools-saf/schema/saf.config.schema.json` · defaults `config.mjs` · not-asked lines
  `choices.mjs` (en, th)
- Script `task:release`: `ENGINE_SCRIPTS` in `config.mjs`
- Workflow `.github/workflows/release.yml` · checks `scripts/release-check.mjs` · guide `docs/releasing.md`

## 4. Edge cases and errors

- Network down during a guard → that guard fails with the reason; never treated as success.
- `--prepare` ran but the push was rejected (someone pushed first) → local release commit stays; dry run shows
  G-branch failing; the fix is a person's call: "reset the local commit, pull, then run --prepare again — or rebase
  it onto origin and push it yourself, then run --tag" (pulling alone does not help: the version is already bumped) —
  SAF never rewrites history.
- HEAD moved while the `--prepare` guards ran, or another commit landed under the release commit → `--prepare`
  pushes nothing and exits 1 (rule 10); the same person's call as above.
- The tag push of `--tag` failed → the annotated tag stays local; running `--tag` again pushes that existing
  annotated tag on HEAD as it is (never a second tag, never a moved one). Once the tag is on origin, a third `--tag`
  refuses at G-version: "tag v<x> exists on origin".
- CI red on the release commit → `--tag` refuses; the fix is a new card and a new release commit (the old release
  commit's version is never published, so the next `--prepare` reuses the version only if no tag exists).
- Tag pushed but the workflow failed before publishing → fix the cause, then re-run the workflow job (GitHub
  "Re-run jobs") — publishing is idempotent per package (rule 18); never move the tag.
- `create-saf` published but `gh release create` failed → re-run the job; both publishes are skipped, the release is
  created.

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| REL-AC-01 | `policies.release.auto` off at HEAD, or on at HEAD and off on `origin/main` (git fixture with a bare remote) | `task:release M1` | G-switch ✗ with the reason, exit 1, nothing written | integration |
| REL-AC-02 | CHANGELOG `Unreleased` with Breaking / Added / only Fixed / empty, versions 0.x and 1.x | `nextVersion` | minor / minor / patch / refused at 0.x; major / minor / patch / refused at 1.x | unit |
| REL-AC-03 | milestone not done, a card open, a gate with `pass: false`, a code file changed since the gate head | the dry run | G-milestone ✗ naming each cause; with only release files changed it is ✓ | integration |
| REL-AC-04 | all guards hold (fake registry and `gh` through injected runners) | the dry run | every guard ✓, the planned actions listed, exit 0, the worktree byte-identical | integration |
| REL-AC-05 | guards hold, a bare origin | `--prepare` | versions bumped in every package, dependency and version file; CHANGELOG renamed with a new empty Unreleased; one release-log line; one commit with exactly those files; pushed without force | integration |
| REL-AC-06 | the release commit at HEAD, CI fake reports one skipped job, then all green | `--tag` | first refused (G-ci), then the annotated tag is created and only it is pushed | integration |
| REL-AC-07 | the release engine source | scanned | no force push, tag deletion, unpublish, deprecate or `npm publish` | unit |
| REL-AC-08 | `release.yml` | `release-check workflow` | passes; fails for a token reference, a missing `id-token: write`, a missing `actions: read` or any fourth job permission, a trigger other than `v*` tags, or a missing guards step | unit |
| REL-AC-09 | a tag that differs from a package version, a missing CHANGELOG section, auto off on main, a CI run without a windows job | `release-check guards <tag>` (injected runners) | each fails with the reason; a consistent fixture passes | unit |
| REL-AC-10 | the tag commit's `saf.config.json` missing, not valid JSON, or failing schema validation | `release-check guards <tag>` (injected runners) | fails naming that cause, exit 1 | unit |
| REL-AC-11 | `npm view` (injected runner) answers the version / not found (E404) / another failure; the folder not in `policies.release.packages`; `saf.config.json` unreadable | `release-check published <dir> <version>` | exit 0 / 3 / 1 / 1 / 1 with the reason (never 3 except for E404); the workflow check fails when a publish step publishes on any exit other than 3 or skips on any exit other than 0 | unit |
| REL-AC-12 | a fixture where the checkout is not the tag commit, the release log has no entry for the tag, HEAD's subject is not the entry's release subject, or the tagged commit is not on `origin/main` | `release-check guards <tag>` (injected runners) | G-commit fails naming each cause; a consistent fixture passes G-commit | unit |

REL-AC-12 (rule 22) is covered today by the `REL-AC-09` tests in `test/unit/release-check.test.mjs` ("the release log entry, the commit subject, the tag commit and the branch are checked by G-commit") until a later card adds the id REL-AC-12 to their names; no card names REL-AC-12 yet, so `spec:matrix -- --check` lists it as a gap without failing.

## 6. Out of scope

- Publishing to registries other than npm, or from a machine instead of CI
- Release candidates, pre-release tags and dist-tags other than `latest`
- Generating CHANGELOG entries from commits (entries are written by the cards; T-M3-10 only moves `Unreleased`)
- Signing tags
