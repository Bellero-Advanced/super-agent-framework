# Spec — skill packs from other repositories (local folder, pinned content)

Decision: [D-013](../DECISIONS.md) (decided — deferred to M3). Cards: T-M3-13 · T-M3-14 · T-M3-15 (were T-M2-03 ·
T-M2-23 · T-M2-24). **Security-relevant:** every card of this spec is built and reviewed with the `security-review` skill.

## 1. Purpose

Teams have their own skills and want to share them across projects. Today the only packs are the six in the kit. With
this spec a pack is a folder in a documented format that can live in its own repository; the project brings it in with
its own git (a submodule or a clone), names it in `skills.external` with a content hash, and setup and upgrade install
its skills like kit packs. SAF itself never downloads anything.

## 2. Trust model

A skill is text that every agent session may load and follow. Installing a pack means trusting its text the way you
trust code: it can ask for tools (`allowed-tools`) and tell an agent to run commands (Claude Code's own permission
prompts still apply). So:

- **Explicit opt-in:** a pack is installed only when a `skills.external` entry names it; nothing is discovered.
- **Show first:** `saf pack show <path>` lists every file that would be installed, the tools each skill asks for and
  the files that are refused, before anyone adds the entry; the interview always runs it and asks.
- **Pinned content:** each entry carries the pack's sha256 content hash. Changed content is never installed until a
  person reviews it and updates the hash. The source version is pinned by the project's git (a submodule commit).
- **No network, no code:** SAF never fetches, never runs anything from a pack, and copies only Markdown files into the
  pack's own skill folders. Packs cannot ship hooks, settings, agents, commands or scripts.
- **Not covered:** signatures, a registry, sandboxing what a skill tells an agent to do.

## 3. Rules

### Format

1. A pack is a folder with `saf-pack.json` — `name`, `version` (non-empty text), `description`, `skills` (a non-empty
   list of unique skill names) — and `skills/<skill>/SKILL.md` for each listed skill, plus any other `.md` files in
   that skill's folder (sub-folders allowed). Names match the name pattern in `kit/tools-saf/lib/packs.mjs`.
2. Each `SKILL.md` has frontmatter with `name` equal to its folder and a non-empty `description`.
3. Installed files are the regular `.md` files under the listed skill folders. Any other file (other extensions, files
   outside `skills/<listed skill>/`, unlisted skill folders) is **refused**: never copied, listed by `pack show`.
4. A symbolic link anywhere in the pack, a path that leaves the pack folder, or more files or bytes than `PACK_LIMITS`
   (`packs.mjs`) → the pack is invalid.
5. A pack skill whose name equals a core skill, a kit pack, `saf-setup`, or a skill of another `skills.external` pack
   → the pack is invalid, naming the clash.

### Hash and inspection

6. The content hash is sha256 over the installed files plus `saf-pack.json`, sorted by POSIX path relative to the pack
   folder, each as path, a zero byte, its text with line endings normalised to LF, a zero byte. The same commit hashes
   the same on every OS; refused files do not count.
7. `saf pack show <path>` is read-only: it prints name, version, description, each skill with its description and the
   tools its `allowed-tools` asks for, every installed file with its size, every refused file, the hash, and the exact
   `skills.external` entry to add. Exit 0 valid · 1 invalid (problems listed) · 2 usage.

### Install (setup and upgrade)

8. `skills.external` in `saf.config.json` is a list of `{ "path", "sha256" }` (default empty). `path` is relative to
   the project root or absolute; the docs recommend a git submodule inside the repository so teammates and CI see the
   same files.
9. Setup (`generate`) and `saf upgrade` (`refreshKitFiles`) install each entry whose pack is valid and whose hash
   matches: files are rendered with the project's template data (like kit skills) into `.claude/skills/<skill>/` and
   recorded in `.saf/manifest.json`, which also records the pack's name, path, version, hash and skills.
10. Hash mismatch, missing folder or invalid pack → that pack is not installed or updated; files already installed stay
    byte-identical (never removed for this reason); the run still succeeds and warns with the reason — for a mismatch
    the new hash and the names of the files that would change.
11. A pack whose entry was removed: its unedited installed files are removed, edited ones kept (as for a dropped kit
    pack). Edited installed files are kept on upgrade and re-run like kit skills.
12. SAF writes pack files only inside `.claude/skills/<pack skill>/` and never executes, imports or fetches anything.

### Interview

13. Group 5 asks "Skill packs from a folder?" (key `skills.external`, a `value` question with one explanation in
    `choices.mjs`). For each path the person gives, the skill runs `pack show`, shows its output as printed, says in one
    line that a skill is instructions agents will follow, and asks "Install this pack?" — Yes · No, with **no**
    recommended marker. Yes → the entry with the printed hash; No → nothing.

## 4. Data

- `PACK_LIMITS`, the name pattern, `readPack`, `packHash`: `kit/tools-saf/lib/packs.mjs`
- `skills.external`: schema `kit/tools-saf/schema/saf.config.schema.json` · defaults `kit/tools-saf/lib/config.mjs`
- Core skills and kit packs: `CORE_SKILLS` · `SKILL_PACKS` in `config.mjs`

## 5. Edge cases and errors

- Two entries with the same path or the same pack name → the second is invalid (clash)
- A pack folder inside `.claude/skills/` itself → refused (it would install over itself)
- Windows checkouts with CRLF → same hash (rule 6)
- `stack.packageManager: "none"` changes nothing here

## 6. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| PACK-AC-01 | a valid fixture pack with two skills, a README and a `run.sh` | `saf pack show <path>` | exit 0; prints name, version, both skills with descriptions and asked tools, the installed files with sizes, README and `run.sh` as refused, the hash and the entry; no file written anywhere | unit |
| PACK-AC-02 | packs with: no `saf-pack.json` · a listed skill without `SKILL.md` · frontmatter name ≠ folder · a symlink · a skill named `tdd` · more files than `PACK_LIMITS` | `pack show` | exit 1 for each, naming the problem | unit |
| PACK-AC-03 | the valid pack; the same pack with CRLF line endings; one byte changed in a `SKILL.md`; a refused file changed | `packHash` | LF and CRLF hash the same; the byte change changes the hash; the refused file does not | unit |
| PACK-AC-04 | a project with a `skills.external` entry and the right hash, a `SKILL.md` holding `{{cmd.taskVerify}}` | setup | `.claude/skills/<skill>/SKILL.md` holds the project's verify command; `run.sh` is not copied; the manifest records the files and the pack | unit |
| PACK-AC-05 | the installed pack; then its content changes; then its folder is removed | `upgrade` | installed files byte-identical in both cases; warnings name the pack, the new hash and the changed file, and the missing folder; nothing written outside `.claude/skills/` | unit |
| PACK-AC-06 | the installed pack with one file edited by hand | the entry is removed, setup runs again | unedited pack files are removed, the edited one is kept and listed | unit |
| PACK-AC-07 | `choices.mjs`, `questions.md`, `SKILL.md` | the docs test runs | `skills.external` is a group-5 value question with one explanation in en and th and a Key-column row; the skill runs `pack show` before asking and the install question has no "(recommended)" | unit |

## 7. Out of scope

- Fetching a pack by URL, a registry, signatures or version ranges — the project's git does the fetching and pinning
- Packs that ship agents, commands, rules, hooks or settings
