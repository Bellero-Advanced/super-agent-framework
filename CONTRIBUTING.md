# Contributing to SAF

Thanks for helping. SAF is small on purpose: a zero-dependency engine, a set of templates and a setup interview.

## Ground rules

- **Zero dependencies.** The engine in `kit/tools-saf/` is vendored into users' repos — plain Node ≥ 20 ESM, no packages.
- **Every OS.** Linux, macOS and Windows (CI runs all three on Node 20 and 22). Use `node:path`, never assume `/` in
  filesystem paths (git output is always `/`), never assume bash, spawn `.cmd` shims through the shell on Windows.
- **Evidence before done.** A pull request that changes behaviour adds or changes a test that fails without it.
- **Templates are bilingual.** Anything under `kit/tools-saf/templates/en/` has a twin under `th/` — change both.
  Thai text addresses the user as "คุณ" and refers to itself as "ผม".
- **Short skill descriptions.** Every skill description sits in every session's context; keep it to one or two lines.

## Layout

| Path | What |
|---|---|
| `bin/cli.mjs` · `src/install.mjs` | the `saf` CLI: `init`, `upgrade`, `version` |
| `kit/tools-saf/` | the engine, schema and templates copied into projects as `tools/saf/` |
| `kit/claude/skills/saf-setup/` | the setup interview skill |
| `packages/create-saf/` | the `npx create-saf` / `npm create saf` wrapper |
| `examples/todo-api/` | a real project taken through two milestones |
| `test/` | `unit/` · `e2e/` (real CLI into temp folders) · `package/` (npm pack + offline install) |
| `scripts/` | test runner and the demo/preview generators |

This repository also runs SAF on itself: `tools/saf/`, `.claude/`, `CLAUDE.md`, `docs/plan/` and `saf.config.json` at the
root are the maintainers' own setup, not what users get. Edit the kit under `kit/`, then refresh the installed copy with
`npm run saf:refresh` (a test fails while they differ).

## Develop

```bash
npm test                 # unit + e2e + package (node:test, no install needed)
npm run test:unit        # one suite
node scripts/demo.mjs    # rebuild docs/assets/demo.svg from a real run
```

## Pull requests

1. One change per pull request; describe the problem first, then the change.
2. Add a `CHANGELOG.md` line under "Unreleased".
3. `npm test` passes locally; CI must pass on all three operating systems.

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE) and you follow the
[code of conduct](CODE_OF_CONDUCT.md).
