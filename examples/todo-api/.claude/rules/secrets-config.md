---
paths:
  - ".claude/settings*.json"
  - "**/*.env*"
  - "**/config/**"
  - ".github/workflows/**"
  - "**/wrangler.*"
  - "**/docker-compose*.yml"
---

# Rules for settings, env and config files

- Never commit `.env` · `.env.local` · `.env.*.local` or any secret value; examples go in `.env.example` with empty values
- Never print a secret value to the screen, a log or a report — inspect env files by counting key names only
- `.claude/settings.json` is tracked: hooks and permissions only, **no `env` block** — machine values go in `.claude/settings.local.json` (untracked)
- CI secrets live in the CI secret store, referenced by name
- After editing: `npm run check-secrets` and `npm run docs:check`
