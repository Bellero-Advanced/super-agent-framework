# Install

Requirements: Node ≥ 20, git, [Claude Code](https://claude.com/claude-code). A package manager is optional.

## Interactive (recommended)

```bash
cd your-project            # new or existing; a git repo is needed before the first card
npx github:Bellero-Advanced/super-agent-framework init
claude
/saf-setup
```

`init` does only three things:

1. copies the engine and templates to `tools/saf/` (vendored — commit it; no install step, no dependencies)
2. copies the interview skill to `.claude/skills/saf-setup/`
3. writes a `saf.config.json` stub and adds SAF lines to `.gitignore` (local settings, lane label, worktrees, env files)

`/saf-setup` then runs the interview ([setup-questions.md](setup-questions.md)), generates the project files, runs the
self-checks, asks to commit locally, runs the first card (T-M0-01) and has the designer draft M1.

## Non-interactive

```bash
npx github:Bellero-Advanced/super-agent-framework init --answers answers.json [--adopt | --no-adopt] [--dir <path>]
```

`answers.json` has the shape of `saf.config.json` and may be partial — every missing key gets its default. Example in
[setup-questions.md](setup-questions.md#example-answers-file). Later re-configuration without the interview:

```bash
node tools/saf/bin/saf.mjs setup --answers answers.json
```

## Existing projects (adopt mode)

SAF detects an existing project (package.json, CLAUDE.md, `.claude/`, `docs/INDEX.md` or `src/`). Then:

- files in `.claude/agents`, `.claude/commands`, `.claude/rules` and `docs/plan` that SAF did not write are **moved** to
  `docs/archive/pre-saf/` (same relative path) — nothing is deleted
- `CLAUDE.md`, `docs/INDEX.md`, `docs/DECISIONS.md` are archived the same way before SAF writes its own
- `.claude/settings.json` is merged: SAF adds its two hooks; an `env` block moves to `.claude/settings.local.json` (untracked)
- `package.json` scripts are merged: SAF adds `task:*`, `docs:check`, `spec:matrix`, `check-secrets`, `measure`; an existing
  script with the same name is kept and reported
- the detected test/lint/typecheck/build commands become the project checks; commands whose scripts do not exist are listed
  as "not set up yet" instead of being used

Move what you still need from `docs/archive/pre-saf/` into the new homes listed in `docs/INDEX.md`.

## Without a package manager

Choose `none`. No package.json is created; every command in the generated docs is `node tools/saf/bin/saf.mjs …`
(for example `node tools/saf/bin/saf.mjs task verify T-M1-01`).

## npm note

npm passes arguments only after `--`: `npm run task:verify -- T-M1-01`. Generated docs already write it that way.
