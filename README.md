# SAF — Super Agent Framework

A card-and-milestone workflow for [Claude Code](https://claude.com/claude-code), installable into any new or existing
project. SAF gives your AI team roles with fixed models, a plan made of small verifiable cards, exit gates per
milestone, and evidence for every "done" — set up through a short interview.

[ภาษาไทย](README.th.md)

## What you get

- **Cards and milestones** in `docs/plan/` — each card lists the files it may touch and the commands that prove it works
- **`task:verify`** — the only way a card becomes done: it runs the card's commands, checks every changed file is inside the
  card's `touch` list, and checks acceptance scenarios have tests. Results are written as evidence
- **Generated status** — `STATE.md` and a SessionStart hook that tells every new Claude session the milestone, the card in
  progress and its criteria
- **Agent roles** with full model ids and effort: designer · spec-reviewer (read only) · implementer · qa-runner, plus a
  library (art-producer · db-guardian · release-operator · security-auditor · data-engineer · content-writer) and custom roles
- **Parallel lanes** — independent cards run in their own git worktrees; `task:merge` merges one at a time with checks and rollback
- **Guards** — `docs:check` keeps agent docs true, `check-secrets` blocks secret values, `spec:matrix` maps scenarios to tests,
  a measure lock queues heavy test runs
- **`/saf` commands** — `/saf` · `/saf-plan` · `/saf-fix` · `/saf-test` · `/saf-protect` · `/saf-help` (+ short aliases)

The engine is plain Node (≥ 20) with **zero dependencies**, vendored into your repo at `tools/saf/`. It works with pnpm,
npm, yarn, bun, or no package manager at all.

## Install

```bash
cd your-project
npx github:Bellero-Advanced/super-agent-framework init
claude
/saf-setup
```

`init` copies the engine and the setup skill. `/saf-setup` interviews you (grouped questions, each with a recommended
default), generates everything, runs the self-checks and the first card, then has the designer draft your first milestone
and waits for your Go.

Non-interactive: `npx github:Bellero-Advanced/super-agent-framework init --answers answers.json` — see
[docs/install.md](docs/install.md).

## The card loop

```
owner says Go → designer writes cards → task:start → implementer → task:verify → spec-reviewer → qa-runner → commit / task:merge
             → task:verify M<n> (exit gates) → report → owner closes the milestone
```

Details: [docs/card-lifecycle.md](docs/card-lifecycle.md).

## Documentation

| Topic | Doc |
|---|---|
| Install, non-interactive setup, adopting an existing project | [docs/install.md](docs/install.md) |
| Every setup question and the config key it sets | [docs/setup-questions.md](docs/setup-questions.md) |
| Cards, milestones, lanes, evidence | [docs/card-lifecycle.md](docs/card-lifecycle.md) |
| Agent roles | [docs/roles.md](docs/roles.md) |
| Model presets | [docs/model-presets.md](docs/model-presets.md) |
| `saf.config.json` reference | [docs/config-reference.md](docs/config-reference.md) |
| Upgrading | [docs/upgrade.md](docs/upgrade.md) |
| FAQ | [docs/faq.md](docs/faq.md) |

## Develop SAF itself

```bash
npm test          # unit + end-to-end (node:test, no dependencies)
```

Layout: `bin/` CLI · `src/` installer · `kit/tools-saf/` the engine and templates copied into projects ·
`kit/claude/skills/saf-setup/` the interview skill · `test/`.

## License

[MIT](LICENSE)
