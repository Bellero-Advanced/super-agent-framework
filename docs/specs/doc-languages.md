# Spec — document languages (add one with a template folder and a text-table entry)

Decision: [D-014](../DECISIONS.md) (proposed). Card: T-M2-01.

## 1. Purpose

Generated documents and status text exist in English and Thai. Adding a third language today means editing a
language-name table and a Thai-only branch in `generate.mjs`, three schema enums, the setup explanations and the
interview file, with nothing telling a contributor what they missed. With this spec one registry decides which
languages exist: a contributor adds a text-table entry and a template folder (and the code to the three schema enums,
which a test demands), any template the folder lacks falls back to English with a warning, and the setup explanations
cover the new language without new text. No third language ships with this spec.

## 2. Rules

1. The document languages are the keys of `TEXT` in `kit/tools-saf/lib/text.mjs`, exported as `LANGUAGES`.
2. Each table has `langName` (the language's own name) and `names` (names of other languages in this language, may be
   partial). The name of language X in document language D is D's `names[X]`, else English `names[X]`, else X's
   `langName`.
3. `textFor(lang)` returns the table merged over `en` key by key, nested objects included, so a partial table works and
   every missing key reads in English. An unknown language → `en`.
4. Each generated document is read from `templates/<lang>/`; a file the folder lacks is read from `templates/en/`, and
   setup's report carries one warning per such file naming the path and the language. Agent, rule and skill templates
   stay English-only.
5. `generate.mjs` holds no language-specific text and no comparison with a language code: language names and the
   session-table work labels come from the text table (`names`, `sessionWork`).
6. The schema enums of `people.docLanguage`, `people.chatLanguage` and `roles.reportLanguage` equal `LANGUAGES`; a unit
   test names any difference. The schema stays a static file so editors keep autocompletion.
7. Setup choices: the option values of the `chat-language`, `doc-language` and `report-language` questions come from
   `LANGUAGES`. Chat and document language each have one explanation covering every language; report language has an
   `en` explanation and one covering every other language, worded without naming a language. So a new language needs
   no new explanation text and SETUP-AC-02, 05 and 06 cover it.
8. The language of the explanations themselves (`choices --lang`) stays the languages that have explanation text
   (`LANGS` in `choices.mjs`); a chat language outside it reads them in English
   ([setup-choices rule 14](setup-choices.md#2-rules), unchanged).
9. Setup with `en` or `th` prints no fallback warning: both template folders are complete.
10. `CONTRIBUTING.md` has a section "Add a document language": add the table entry, copy `templates/en/` and translate,
    add the code to the three enums, run the tests (the language test names anything missing), and have a native
    reader review the text before it ships.
11. The option column of the three language questions in the setup skill's `questions.md` names the source (the
    languages `choices` lists) instead of a fixed list.

## 3. Data

- `TEXT` · `LANGUAGES` · `textFor`: `kit/tools-saf/lib/text.mjs` · templates: `kit/tools-saf/templates/<lang>/`
- Enums: `kit/tools-saf/schema/saf.config.schema.json` · explanations: `CHOICES` in `kit/tools-saf/lib/choices.mjs`

## 4. Edge cases and errors

- A text table without `langName` → the language test fails naming it
- A template folder without a table entry is ignored (the language does not exist until the table has it)
- A config naming a language the engine no longer has → schema validation fails, as for any enum value

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| LANG-AC-01 | `TEXT`, the schema | the language test runs | the three enums equal `LANGUAGES`; every table has `langName`; `textFor("xx")` is English; a partial table merged over `en` keeps the English value of a missing nested key | unit |
| LANG-AC-02 | a temp copy of `kit/tools-saf` with one table entry `xx` (only `langName`), one file `templates/xx/CLAUDE.template.md` and `xx` in the three enums | setup with `docLanguage: "xx"` | `CLAUDE.md` comes from the `xx` template; the other documents are the English ones; the report has one warning per fallen-back file naming it; status files are written with English labels | unit |
| LANG-AC-03 | the same copy | `choices --group 1 --lang en` and `--group 5 --lang en` | `xx` is listed in the chat- and document-language entries and in the report-language entry for other languages | unit |
| LANG-AC-04 | the shipped engine | setup with `en`, then `th` | no fallback warning; the session table and language names are as before; `generate.mjs` has no `LANG_NAME` and no comparison with `"th"` | unit |
| LANG-AC-05 | `CONTRIBUTING.md` | the docs test runs | it has the "Add a document language" section with the four steps and the native-reader review | unit |

## 6. Out of scope

- Shipping a third language (a contribution with a native reviewer — its own card)
- Explanation text (`choices --lang`) in more languages · translating agent, rule or skill templates
