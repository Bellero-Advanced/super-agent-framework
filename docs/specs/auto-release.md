# Spec — automatic release (guarded, with a kill switch)

Decision: [D-015](../DECISIONS.md) (proposed, amends D-004). Cards: T-M3-09 (`task:release` dry run and guards) ·
T-M3-10 (`--prepare` and `--tag`) · T-M3-11 (release workflow with npm trusted publishing, `release-check`, docs).
**Security-relevant:** every card of this spec is built and reviewed with the `security-review` skill — it pushes to
`main`, creates tags and publishes packages.

## 1. Purpose

SAF should ship its own fixes without waiting for a person to type release commands, but a release is the one step
that cannot be undone (npm versions are immutable). So the engine releases only when every guard holds, writes down
what it did before it does it, and stops when the kill switch is off. The engine's part (`task:release`) is generic
and ships to every project, off by default; the npm publish runs only in this repository's GitHub workflow, on a tag
the engine created, through npm trusted publishing (no stored token).

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
    exactly those files as `chore(release): v<next> (<M>)`; pushes the release branch with a plain `git push` (never
    `--force`; a rejected push leaves the local commit and exits 1 with the reason).
11. `task:release <M> --tag` runs only when HEAD's subject is `chore(release): v<version in package.json> (<M>)` and
    rules 4–9 hold. It creates the annotated tag `v<version>` on HEAD (message: the CHANGELOG section) and pushes only
    that tag (`git push origin refs/tags/v<version>`). It never moves, replaces or deletes a tag.
12. The engine source for release contains no `--force`, `-f` push, `push --delete`, `tag -d`, `unpublish` or
    `deprecate`, and never runs `npm publish` — publishing belongs to the workflow.
13. Every `task:release` run (dry, prepare, tag) prints the guard list; `--prepare` and `--tag` print each git command
    before running it.
14. The generated `/saf` command: when `policies.release.auto` is `on` and the owner has closed a milestone, the main
    session runs `task:release <M>` (dry), then `--prepare`, waits for CI, then `--tag`, and reports the result; when
    it is `off` it says releases need the owner's order (D-004 wording).

### Release workflow (this repository, T-M3-11)

15. `.github/workflows/release.yml` runs only on `push` of tags matching `v*`. Top-level `permissions: contents: read`;
    the publish job has `contents: write` and `id-token: write`, runs in the GitHub environment `npm`, on Node ≥ the
    minimum npm trusted publishing needs and an npm CLI ≥ its minimum (both pinned in the workflow, with a comment
    linking npm's trusted-publishing docs).
16. No step references `secrets.NPM_TOKEN`, `NODE_AUTH_TOKEN` or any npm token; publishing authenticates through OIDC
    only, and provenance is attached (trusted publishing adds it).
17. Before publishing, `node scripts/release-check.mjs guards <tag>` checks: the tag equals `v` + the version of every
    released package and the version file · the tag commit's subject is the release commit · `CHANGELOG.md` has the
    `## <version>` section · the CI run for the tag commit is green with every job successful and at least one job per
    OS of the CI matrix (`ubuntu`, `macos`, `windows`, read from `ci.yml`) · `policies.release.auto` is `on` on
    `origin/main`. Reuses `nextVersion`, the CHANGELOG reader and the release-log reader from
    `tools/saf/lib/release.mjs` (no copy).
18. Publish order: `super-agent-framework`, then wait until `npm view super-agent-framework@<version>` answers (bounded
    retries), then `create-saf`; each publish is skipped when that exact version is already on npm (safe re-run after
    a partial failure); the kill-switch check of rule 17 runs again right before each publish. Then
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
    GitHub/npm are down.

## 3. Data

- `nextVersion`, `releaseGuards`, `readChangelog`, `RELEASE_LOG`, `appendReleaseLog`, `RELEASE_LIMITS` (registry
  wait): `kit/tools-saf/lib/release.mjs`
- `policies.release`: schema `kit/tools-saf/schema/saf.config.schema.json` · defaults `config.mjs` · not-asked lines
  `choices.mjs` (en, th)
- Script `task:release`: `ENGINE_SCRIPTS` in `config.mjs`
- Workflow `.github/workflows/release.yml` · checks `scripts/release-check.mjs` · guide `docs/releasing.md`

## 4. Edge cases and errors

- Network down during a guard → that guard fails with the reason; never treated as success.
- `--prepare` ran but the push was rejected (someone pushed first) → local release commit stays; dry run shows
  G-branch failing; the fix is a person's call (reset the local commit or rebase) — SAF never rewrites history.
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
| REL-AC-08 | `release.yml` | `release-check workflow` | passes; fails for a token reference, a missing `id-token: write`, a trigger other than `v*` tags, or a missing guards step | unit |
| REL-AC-09 | a tag that differs from a package version, a missing CHANGELOG section, auto off on main, a CI run without a windows job | `release-check guards <tag>` (injected runners) | each fails with the reason; a consistent fixture passes | unit |

## 6. Out of scope

- Publishing to registries other than npm, or from a machine instead of CI
- Release candidates, pre-release tags and dist-tags other than `latest`
- Generating CHANGELOG entries from commits (entries are written by the cards; T-M3-10 only moves `Unreleased`)
- Signing tags
