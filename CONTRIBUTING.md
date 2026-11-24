# Contributing to SAF

Thanks for helping. SAF is small on purpose: a zero-dependency engine, a set of templates and a setup interview.

## Ground rules

- **Zero dependencies.** The engine in `kit/tools-saf/` is vendored into users' repos — plain Node ≥ 20 ESM, no packages.
- **Every OS.** Linux, macOS and Windows (CI runs all three on Node 20 and 22). Use `node:path`, never assume `/` in
  filesystem paths (git output is always `/`), never assume bash, spawn `.cmd` shims through the shell on Windows.
- **Evidence before done.** A pull request that changes behaviour adds or changes a test that fails without it.
- **Templates are bilingual.** Anything under `kit/tools-saf/templates/en/` has a twin under `th/` — change every language
  folder that has the file (a language folder may lack files; those fall back to English, see "Add a document language").
  Thai text addresses the user as "คุณ" and refers to itself as "ผม".
- **Short skill descriptions.** Every skill description sits in every session's context; keep it to one or two lines.

## Layout

| Path | What |
|---|---|
| `bin/cli.mjs` · `src/install.mjs` | the `saf` CLI: `init`, `upgrade`, `version` |
| `kit/tools-saf/` | the engine, schema and templates copied into projects as `tools/saf/` |
| `kit/claude/skills/saf-setup/` | the setup interview skill |
| `packages/create-saf/` | the `npx create-saf` / `npm create saf` wrapper |
| `examples/todo-api/` | a real project taken through two milestones |
| `test/` | `unit/` · `e2e/` (real CLI into temp folders) · `package/` (npm pack + offline install) |
| `scripts/` | test runner and the demo/preview generators |

This repository also runs SAF on itself: `tools/saf/`, `.claude/`, `CLAUDE.md`, `docs/plan/` and `saf.config.json` at the
root are the maintainers' own setup, not what users get. Edit the kit under `kit/`, then refresh the installed copy with
`npm run saf:refresh` and `node bin/cli.mjs upgrade --dir examples/todo-api` (a test fails while either copy differs).

## Develop

```bash
npm test                 # unit + e2e + package (node:test, no install needed)
npm run test:unit        # one suite
node scripts/demo.mjs    # rebuild docs/assets/demo.svg from a real run
```

## Add a document language

A document language is one entry in the text table plus a template folder (spec: `docs/specs/doc-languages.md`). Any
document the folder lacks is read from `templates/en/`, and setup (and its dry run) warns once per such file, so a
language can ship in parts. Agent, rule and skill templates stay English.

1. **Table entry.** Add a table for the language code to `TEXT` in `kit/tools-saf/lib/text.mjs`. It needs `langName`
   (the language's own name); `names` (the names of other languages in this one) and `sessionWork` (the three work labels
   of the session summary) are optional, and any key the table lacks reads in English. Also add the new language's
   name to `names` in the `en` and `th` tables (otherwise English and Thai documents show its `langName` instead).
2. **Templates.** Copy `kit/tools-saf/templates/en/` to `kit/tools-saf/templates/<code>/` and translate; a file you leave
   out falls back to English with a warning.
3. **Schema.** Add the code to the three enums in `kit/tools-saf/schema/saf.config.schema.json`: `people.docLanguage`,
   `people.chatLanguage` and `roles.reportLanguage`.
4. **Refresh, then test.** Run `npm run saf:refresh` and `node bin/cli.mjs upgrade --dir examples/todo-api` (the tests
   fail while either installed engine copy differs from `kit/`), then `npm test`. The language test names any enum that
   differs from the languages in `TEXT` and any table without `langName`; the setup-choices tests list the new language
   automatically (the explanations of the three questions cover every language, so no explanation text is added). The
   example upgrade may also rewrite `examples/todo-api/.claude/` and its `package.json`; no test checks those, so do not
   commit them unless you changed them (`git checkout -- examples/todo-api/.claude examples/todo-api/package.json`).

A native reader must review the text before it ships; machine translation alone is not enough. Setup's own explanations
(`saf choices --lang`) stay in the languages that have explanation text, and a new language reads them in English.

## Pull requests

1. One change per pull request; describe the problem first, then the change.
2. Add a `CHANGELOG.md` line under "Unreleased".
3. `npm test` passes locally; CI must pass on all three operating systems.

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE) and you follow the
[code of conduct](CODE_OF_CONDUCT.md).
