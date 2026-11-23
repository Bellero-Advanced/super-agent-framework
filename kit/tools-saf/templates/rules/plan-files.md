---
paths:
{{rulePathsYaml}}
---

# Rules for plan and spec files

- Format and loop: `docs/plan/README.md` — read the relevant section before editing
- Cards: file name = id · folder = milestone · `touch` required · every "Done when" item is a command
- Sizes: S ≤ {{sizeS}} / M ≤ {{sizeM}} changed code lines — bigger → split into more cards
- `role` must be one of: {{roleNames}}
- Never edit `docs/plan/STATE.md`, `.saf/plan.md` or `docs/plan/evidence/` by hand — the engine writes them
- Only the {{owner}} sets a milestone to `active` or `done`
- Specs: numbered testable rules, acceptance ids `<PREFIX>-AC-<nn>`, numbers pointed to in code, not copied
- After any edit: `{{cmd.taskStateCheck}}` and `{{cmd.docsCheck}}`
- No time estimates — gates, not dates
