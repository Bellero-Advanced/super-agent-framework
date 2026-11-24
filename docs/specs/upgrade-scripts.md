# Spec — `saf upgrade` adds the engine's new package.json scripts

Decision: [D-010](../DECISIONS.md) (decided). Cards: T-M2-18 · T-M3-16 (rules 12–13) · T-M3-21 (rule 14). Found by the spec
review of T-M2-09.

## 1. Purpose

Setup writes one package.json script per engine command (`npm run task:verify` …). When a later SAF version adds a
command (0.1.x adds `task:culprit`), `saf upgrade` replaced the engine but never added the script, so the hints and
docs SAF prints (`npm run task:culprit -- <M>`) named a script the project did not have. With this spec `upgrade` adds
the scripts that are missing, and never changes a script the project already has.

## 2. Rules

1. The scripts SAF wants come from one function in `kit/tools-saf/lib/generate.mjs` that both setup
   (`mergePackageJson`) and `upgrade` call: `saf` plus one entry per key of the `ENGINE_SCRIPTS` table in
   `kit/tools-saf/lib/config.mjs`, with the same skip rules setup uses (today: `measure` only when
   `workflow.measure.enabled`). No second copy of the list exists in `src/`.
2. `upgrade` adds every wanted script whose key is missing from `scripts` in the project's `package.json`, with the
   value setup would write.
3. A key that exists with a different value is kept unchanged; the upgrade output lists it as kept, naming the value
   SAF expects.
4. The upgrade output lists every added script by name. The returned result carries `scripts: { added, kept }`.
5. When nothing is added, `package.json` is not rewritten (byte-identical, including formatting).
6. When something is added, the file keeps its indentation (tab or the number of spaces of its first indented line),
   its key order (new keys are appended to `scripts`) and its trailing newline.
7. `stack.packageManager: "none"` → `package.json` is never read or written (the docs and hints already print
   `node tools/saf/bin/saf.mjs …` for that case).
8. `upgrade` never creates a missing `package.json`; it prints one line saying the scripts were not added and that
   `node tools/saf/bin/saf.mjs <command>` works without them.
9. `package.json` that is not valid JSON, or a `saf.config.json` that is missing or invalid, → `package.json` stays
   unchanged and the output carries a warning.
10. The script merge runs after the engine is copied and before `refreshKitFiles`, so refreshed commands and skills
    see the project's real scripts.
11. `examples/todo-api/package.json` (this repo's example project) has every script rule 1 wants for its config — a
    unit test guards it, so a new `ENGINE_SCRIPTS` key cannot ship without refreshing the example.
12. A `scripts` value that is present but not a JSON object (a string, an array, a number, `null`) is never replaced:
    `package.json` stays unchanged and setup and `upgrade` warn that `scripts` is not a JSON object and the SAF scripts
    were not added. A missing `scripts` key is still created as an object when a script is added.
13. The warnings of rule 9 and rule 12 say what is wrong: "is not valid JSON" only for a parse failure, "is not a JSON
    object" for a valid root that is not an object, "`scripts` is not a JSON object" for rule 12. `mergeScriptsText`
    returns the reason with `invalid: true`, so setup (`planPackageJson`) and `upgrade()` print the same words.
14. A `package.json` with no indented line (minified, one line) stays minified when a script is added: no new line
    breaks or indentation are introduced (rule 6 has no indentation to keep there).

## 3. Data

- Script list: `ENGINE_SCRIPTS` in `kit/tools-saf/lib/config.mjs` · skip rules and the shared function in
  `kit/tools-saf/lib/generate.mjs`
- Caller: `upgrade()` in `src/install.mjs`

## 4. Edge cases and errors

- A project that removed a SAF script on purpose gets it back on the next upgrade — expected; a project that wants a
  different command keeps its own value under the same key (rule 3)
- `scripts` missing in `package.json` → created as an object when a key is added; present but not an object → rule 12
- A project that ran `init` without answers has a stub `saf.config.json` that passes validation, and `packageManager`
  defaults to `npm`, so `upgrade` adds the SAF scripts before setup ever ran — harmless: setup later finds them present
  and keeps them (rule 3)
- Upgrade inside a lane worktree is not special: the same rules apply to that folder's `package.json`

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| UPG-AC-01 | a set-up project whose `package.json` lacks `task:culprit` (an older script set), `measure` disabled | `upgrade` | `task:culprit` = `node tools/saf/bin/saf.mjs task culprit` is added, no `measure` script, every other key and value unchanged, the output and `result.scripts.added` name `task:culprit` | unit |
| UPG-AC-02 | `package.json` has its own different `task:verify` script and lacks `task:culprit` | `upgrade` | `task:verify` keeps its value, it is listed in `result.scripts.kept` and in the output, `task:culprit` is added | unit |
| UPG-AC-03 | every wanted script already present | `upgrade` | `package.json` is byte-identical; `result.scripts.added` is empty | unit |
| UPG-AC-04 | a `package.json` indented with 4 spaces (and one with a tab) lacking `task:culprit` | `upgrade` | the added file keeps that indentation and ends with a newline | unit |
| UPG-AC-05 | `packageManager: "none"`, or no `package.json`, or `package.json` that is not valid JSON | `upgrade` | `package.json` is unchanged or still absent; the no-file and invalid-JSON cases print a line about the scripts | unit |
| UPG-AC-06 | this repo | the unit suite runs | `examples/todo-api/package.json` has every script rule 1 wants for `examples/todo-api/saf.config.json` | unit |
| UPG-AC-07 | `package.json` holding `[]`; then `{ "scripts": "build.sh" }`; then `{ nope` | `upgrade`; `setup --dry-run` | every file byte-identical; the warnings say "is not a JSON object", "`scripts` is not a JSON object" and "is not valid JSON" respectively, the same words in setup and `upgrade`; `mergeScriptsText` returns `invalid: true` with the reason | unit |
| UPG-AC-08 | a one-line minified `package.json` lacking `task:culprit` | `upgrade` | `task:culprit` is added and the file is still one line (plus its trailing newline if it had one) | unit |

## 6. Out of scope

- Removing scripts an older SAF wrote that the engine no longer has (none exist yet)
- Changing `init` or setup behaviour (setup keeps `mergePackageJson` as it is, now reading the shared list)
- Rewriting the hint or templates to the raw `node tools/saf/bin/saf.mjs` form — not needed once upgrade adds the script
