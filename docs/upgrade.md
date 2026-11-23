# Upgrade

```bash
npx github:Bellero-Advanced/super-agent-framework upgrade      # in the project root (or --dir <path>)
```

`upgrade`:

- replaces `tools/saf/` (engine, schema, templates) and `.claude/skills/saf-setup/` — both are kit-owned; do not edit them
- refreshes the generic skills SAF shipped (`code-review`, `debug-protocol`, …) **unless you edited them** — edited files are kept and listed
- validates `saf.config.json` against the new schema and lists any errors
- never touches CLAUDE.md, docs, the plan, cards, evidence, agents, rules or commands

To regenerate project files with the new templates, run `/saf-setup` again (or `node tools/saf/bin/saf.mjs setup --answers .saf/setup-answers.json`).
Files SAF wrote and nobody edited are replaced; edited ones are archived to `docs/archive/pre-saf/` first.
`.saf/manifest.json` records what SAF wrote (with hashes) to make that decision.
