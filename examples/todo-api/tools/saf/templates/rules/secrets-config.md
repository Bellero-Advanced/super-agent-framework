---
paths:
{{rulePathsYaml}}
---

# Rules for settings, env and config files

- Never commit {{envFilesText}} or any secret value; examples go in `.env.example` with empty values
- Never print a secret value to the screen, a log or a report — inspect env files by counting key names only
- `.claude/settings.json` is tracked: hooks and permissions only, **no `env` block** — machine values go in `.claude/settings.local.json` (untracked)
- CI secrets live in the CI secret store, referenced by name
- After editing: `{{cmd.checkSecrets}}` and `{{cmd.docsCheck}}`
{{#if policies.externalServices}}
- Only these external services may be configured or touched: {{policies.externalServices}}
{{/if}}
