# Changelog

## 0.1.0 — unreleased

First version.

- Engine (`tools/saf/`, zero dependencies, Node ≥ 20): `task start|verify|abandon|merge|state|next|probe|env|report`,
  SessionStart and Stop hooks, `docs-check`, `spec-matrix`, `check-secrets`, measure lock, `setup`, `detect`, `config --check`
- Worktree lanes: `task:start --worktree` (exit 6 + `--resume`), `task:merge` (exit 3 refused · 4 conflict · 5 checks failed, rolled back)
- Generator: CLAUDE.md, docs/INDEX.md, DECISIONS (§0 precedence), plan README, M0 setup gate, T-M0-01, M1 draft, card and spec
  templates, `/saf` commands with aliases, 10 library roles + custom roles, path-scoped rules, 6 generic skills, settings hooks
  — in English or Thai
- Installer CLI: `init` (interactive via `/saf-setup` or `--answers`), adopt mode for existing projects, `upgrade`
- Model presets Max · Balanced · Economy · Custom
