# Model presets

Roles are in two tiers. Planner/reviewer roles (designer, spec-reviewer, security-auditor, planner custom roles) get the
planner model; every other role gets the builder model. **Effort is set per role and is the same in every preset.**

| Preset | Planner | Builder | When |
|---|---|---|---|
| Max | `claude-fable-5-2` | `claude-opus-5-5` | the hardest planning and review, largest budget |
| Balanced (default) | `claude-opus-5-5` | `claude-sonnet-5-5` | most projects |
| Economy | `claude-sonnet-5-5` | `claude-haiku-5-5` | small projects, tight budgets |
| Custom | your choice | your choice | `models.planner` + `models.builder` (full ids) |

`models.sessionDefault` (default: the builder model) is the model for sessions opened without `--model`; set it in
`.claude/settings.local.json`, which git does not track. The generated `CLAUDE.md` has a table telling you which
`claude --model <id>` to open per kind of work; `--model` beats `ANTHROPIC_MODEL` and the value saved by `/model`.

Model ids are always full ids (`claude-opus-5-5`, never `opus`) so it is visible which model runs. Changing the preset:
re-run `/saf-setup` (or `setup --answers`), which rewrites the agents.
