---
name: writing-for-agents
description: How to write documents agents read — CLAUDE.md, agent roles, rules, commands, skills, cards and specs. Use when creating or editing any of them.
---

# Writing for agents

- **One home per topic.** Write it once, link to it everywhere else. Add the home to `docs/INDEX.md`.
- **Rules, not essays.** Short imperative lines. The reason in half a line when it prevents a wrong guess.
- **Commands that exist.** Every command in a code block or backticks must run as written; `docs:check` verifies scripts and paths.
- **Paths that exist.** Backticked repo paths are checked. Write placeholders without backticks or with `<…>`.
- **No bare at-names in prose** — Claude Code reads them as file imports; put package or user names in backticks.
- **Caps.** CLAUDE.md ≤ 200 lines; `docs/INDEX.md` ≤ 150. Move detail to the topic's home.
- **Path-scoped rules** in `.claude/rules/` need a `paths:` list so they load only where they apply.
- **Agents.** Frontmatter: `name` = file name · `description` says when to use and what it never does · full `model` id · `effort` · read-only roles list only Read, Grep, Glob.
- **Cards.** One outcome · explicit `touch` · "Done when" items are commands · scenario ids from the spec.
- **No time estimates.** Gates, not dates.
- **Plain words.** Translate jargon; results first.
