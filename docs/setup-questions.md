# Setup questions

The interview `/saf-setup` runs, grouped in this order — each question shows a recommended default, and you can answer
"use the recommendations for the rest" at any point:

1. **Language and people** — chat language · document language (en / th) · how agents address you (owner title) · UI languages and i18n
2. **Project** — name · pitch · users/market · domain · type (web-app/SaaS · mobile · game · API · ERP · data/AI · library/CLI · other) ·
   stage (idea · prototype · MVP · production) · rigor (light · standard · strict)
3. **Stack** — package manager (pnpm · npm · yarn · bun · none) · the real typecheck/lint/test/e2e/build commands · database ·
   monorepo · submodules
4. **Models** — preset (Max · Balanced · Economy · Custom) · default session model ([model-presets.md](model-presets.md))
5. **Roles and skills** — optional library roles · a custom role · report language ([roles.md](roles.md)) · optional skill
   packs (ui-frontend · db-migrations · performance · i18n · mobile · game — [skills.md](skills.md))
6. **Workflow** — parallel lanes and caps · side lanes (on/off, how many at a time) · solo paths · ports and test database per lane · measure lock · performance budgets ·
   card size caps · merge checks
7. **Policies** — push · deploy (target, exceptions) · protected and auto-deploy branches · no force-push · env files ·
   forbidden and owner-only paths · external services
8. **Token saving and the first milestone** — token-saving mode · the goal of M1

Always on, not asked: no time estimates (gates, not dates) · "done" needs real run evidence.

The complete table — every question, the `saf.config.json` key it sets, the options and the recommended default — lives in
one place, the skill's own reference: [`kit/claude/skills/saf-setup/questions.md`](../kit/claude/skills/saf-setup/questions.md).

## Example answers file

See the end of [questions.md](../kit/claude/skills/saf-setup/questions.md#example-answers-file).
