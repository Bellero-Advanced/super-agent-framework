# Upgrade

```bash
npx github:Bellero-Advanced/super-agent-framework upgrade      # in the project root (or --dir <path>)
```

`upgrade`:

- replaces `tools/saf/` (engine, schema, templates) and `.claude/skills/saf-setup/` — both are kit-owned; do not edit them
- refreshes the `/saf` commands and the skills SAF ships (core + the packs in `saf.config.json`) **unless you edited them** —
  edited files are kept and listed; new core skills are added
- removes commands and skills an older SAF shipped that are no longer part of the kit (for example the 0.0.x `/saf-fix`,
  `/saf-test`, `/saf-protect`, `/saf-help` and their short aliases) — only files `.saf/manifest.json` records as written by
  SAF and still unedited; your own commands and skills are never touched
- adds the engine's missing scripts (for example `task:culprit`) to `package.json` — scripts you already have are never changed,
  the file is never created, and nothing is added when `stack.packageManager` is `none`
- validates `saf.config.json` against the new schema and lists any errors
- never touches CLAUDE.md, docs, the plan, cards, evidence, agents or rules

To regenerate project files with the new templates, run `/saf-setup` again (or `node tools/saf/bin/saf.mjs setup --answers .saf/setup-answers.json`).
Files SAF wrote and nobody edited are replaced; edited ones are archived to `docs/archive/pre-saf/` first.
Your edited decision log, index, milestone and card files are the exception: a re-run keeps them as they are and says so in its output, so your working plan is never reset; `package.json` is written only when a script is missing.
`.saf/manifest.json` records what SAF wrote (with hashes) to make that decision.
