# Skills

Skills live in `.claude/skills/<name>/SKILL.md` in your project. Claude loads one by itself when the work matches its
description, so there is nothing to type — `/saf` routes a request and the right skill comes with it. Descriptions are kept
short because every description sits in the context of every session.

Skills are rendered from templates with your settings, so they show your real commands (for example `test-runner` lists
the project's own test, lint and typecheck commands).

## Core — always installed

| Skill | Loads when |
|---|---|
| `debug-protocol` | a bug, error, crash or flaky test — root cause with evidence before any edit, then a fix with a proving test |
| `tdd` | building a feature or fixing a bug test-first |
| `code-review` | reviewing a card, branch or work in progress against the spec and the repo rules |
| `security-review` | anything security — quick pass while building, full audit before a gate or release |
| `writing-for-agents` | editing CLAUDE.md, agents, rules, commands, skills, cards or specs |
| `handoff` | delegating or ending a session mid-card |
| `evidence-before-done` | before any "done", "fixed" or "passes" — real run output or it did not happen |
| `test-runner` | "run the tests", "is it working", gates — the project's real checks, in order, with real numbers |

## Optional packs — chosen in `/saf-setup`

Key: `skills.packs` in `saf.config.json`. Leaving it out uses the recommendation from your answers.

| Pack | Recommended when | Covers |
|---|---|---|
| `ui-frontend` | web app · mobile · game · ERP | every state (loading · empty · error), keyboard and focus, design tokens, overflow, screenshot evidence |
| `db-migrations` | a database is set | forward-only expand → migrate → contract, rehearsal on a `_test` database, backfills, production only on order |
| `performance` | game | budgets, measure-before-change, one change per measurement, before/after numbers |
| `i18n` | more than one UI language | keys not strings, whole sentences, plurals and formats by locale, overflow checks |
| `mobile` | mobile | touch targets, offline and lifecycle, permissions, device matrix, store builds on order |
| `game` | game | balance in data tables, server authority, deterministic simulation, frame and asset budgets, playtest evidence |

Change packs by re-running `/saf-setup` (or `node tools/saf/bin/saf.mjs setup --answers …`). A pack you drop is removed
if you did not edit it; edited skill files are kept. Your own skills in `.claude/skills/` are never touched.

## Packs from other repositories

A team can keep its own skills in one folder, share it across projects and look at it before it is trusted. This page
describes the format and `saf pack show`; installing a pack into a project comes in a later release.

**A skill is instructions.** Every agent session may load it and follow it, so a pack deserves the trust you give code.
SAF never downloads a pack and never runs anything from one. Bring the folder in with your own git — a git submodule inside
your repository is best, because it pins the exact version and your teammates and CI see the same files — and pin the
content with the hash that `saf pack show` prints.

### The format

```text
my-pack/
  saf-pack.json
  skills/
    my-skill/
      SKILL.md
      checklist.md        any other .md files, sub-folders allowed
```

`saf-pack.json` has four fields:

```json
{ "name": "team-pack", "version": "1.2.0", "description": "Our team skills", "skills": ["my-skill"] }
```

- `name` and every skill name: lower-case letters, digits and `-`, at most 64 characters. A skill may not be named like
  a core skill, an optional pack or `saf-setup`
- `version` and `description`: non-empty text
- `skills`: a non-empty list of different names; each needs `skills/<name>/SKILL.md`

Each `SKILL.md` starts with frontmatter: `name` (the same as its folder) and a non-empty `description`. Allowed keys:
`name`, `description`, `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `license`, `metadata`, `version`.
Any other key (for example `hooks`, `model` or `context`) makes the pack invalid. `allowed-tools` is text or a list of text;
any other shape, or a tool name longer than the limit below, makes the pack invalid, so `saf pack show` always lists every tool a
skill asks for.

Only regular `.md` files inside a listed skill folder are ever copied. Everything else — a README, a script, a file in an
unlisted folder, a name with odd characters — is **refused**: never copied, and listed by `saf pack show`. A symbolic link
anywhere, an installed file or `saf-pack.json` that is not plain UTF-8 text, or a pack over a limit makes the pack invalid.

| Limit | Value |
|---|---|
| Files to install | 200 |
| Bytes of all files to install | 1048576 |
| Bytes of one installed file | 262144 |
| Bytes of `saf-pack.json` | 65536 |
| Files and folders looked at | 2000 |
| Folder levels | 8 |
| Skills | 50 |
| Asked tools per skill | 50 |
| Characters of one asked tool | 100 |

### Look before you trust: `saf pack show`

```bash
node tools/saf/bin/saf.mjs pack show path/to/my-pack
```

Run it from the project root: the `path` in the entry it prints is the path you typed, and `skills.external` reads a relative
path from the project root. It only reads. It prints the name, version and description, each skill with its description and the tools its
`allowed-tools` asks for, every file that would be installed with its size, every refused file, the content hash and the exact
`skills.external` entry to add. Nothing from the pack is run, nothing is written and nothing is fetched. Exit code 0: the pack
is valid · 1: it is invalid and the problems are listed · 2: wrong arguments.

The hash covers the installed files and `saf-pack.json` (line endings are read as LF, so a Windows checkout gives the same
hash). Refused files do not count. Read the listed files before you use the hash: it proves the content did not change, not
that the content is good.
