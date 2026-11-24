import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, lib, tmp } from "../helpers.mjs";

/** The effort question of setup group 4 (docs/specs/effort-by-size.md rules 13-14, scenario EFFORT-AC-08). */
const { QUESTIONS, CHOICES, FIELD_MAX, NOT_ASKED, MACHINE_SWITCHES } = await lib("choices.mjs");
const { EFFORT_MODES, EFFORT_BY_SIZE, LOCAL_KEYS, resolveConfig } = await lib("config.mjs");
const { cardEffort, variantAgents } = await lib("effort.mjs");
after(cleanup);

const FIELDS = ["what", "good", "cost", "when"];
const entries = (id) => CHOICES.filter((e) => e.question === id);
const entry = (id, value) => entries(id).find((e) => e.values.includes(value));
const joined = (e, lang) => FIELDS.map((f) => e[lang][f]).join(" ");
/** Code names an explanation uses (`task:report`, `saf.config.local.json`, `models.overrides`): the same in en and th. */
const names = (text) => [...new Set(text.match(/[A-Za-z][\w-]*(?:[.:][\w-]+)+/g) ?? [])].sort();
const read = (...p) => readFileSync(join(REPO, ...p), "utf8").replace(/\r\n/g, "\n");
const choices = (lang) => spawnSync(process.execPath, [join(REPO, "kit", "tools-saf", "bin", "saf.mjs"), "choices", "--group", "4", "--lang", lang], { cwd: tmp(), encoding: "utf8" });
/** Body of the `## <heading>` section of a markdown text, up to the next `## `. */
const section = (text, heading) => text.split(/^## /m).find((s) => s.startsWith(heading))?.split("\n").slice(1).join("\n") ?? "";

test("EFFORT-AC-08 models.effort is asked in group 4 with both options and is no longer in the not-asked list", () => {
  const q = QUESTIONS.find((x) => x.id === "effort");
  assert.ok(q && q.group === 4 && q.kind === "choice", "a group-4 choice question");
  assert.deepEqual(q.keys, ["models.effort"]);
  assert.deepEqual(q.options, ["fixed", "by-size"]);
  assert.deepEqual(q.options, EFFORT_MODES, "the options are the engine's modes");
  assert.ok(!("models.effort" in NOT_ASKED), "asked, so not in the not-asked list");
  assert.ok(MACHINE_SWITCHES["models.effort"], "the per-machine line stays");
});

test("EFFORT-AC-08 both options are explained in every field in en and th, within FIELD_MAX, with no digits or model ids", () => {
  for (const value of ["fixed", "by-size"]) {
    const e = entry("effort", value);
    assert.ok(e, value);
    for (const lang of ["en", "th"]) {
      assert.deepEqual(Object.keys(e[lang]), FIELDS);
      for (const f of FIELDS) {
        const text = e[lang][f];
        assert.ok(text.trim() && text.length <= FIELD_MAX, `${value} ${lang}.${f}: ${text.length}`);
        assert.ok(!/\d/.test(text) && !text.includes("claude-"), `${value} ${lang}.${f}: digit or model id`);
      }
    }
    assert.deepEqual(names(joined(e, "th")), names(joined(e, "en")), `${value}: en and th name the same things`);
  }
  for (const lang of ["en", "th"]) {
    const r = choices(lang);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/^## models\.effort$/m.test(r.stdout) && r.stdout.includes("- fixed") && r.stdout.includes("- by-size"));
    for (const value of ["fixed", "by-size"]) for (const f of FIELDS) assert.ok(r.stdout.includes(entry("effort", value)[lang][f]), `${lang} ${value} ${f}`);
  }
});

test("EFFORT-AC-08 each effort sentence names the fact the code makes true: table-only lowering, extra agent files, review cost, report, local file, overrides", () => {
  const fixed = entry("effort", "fixed");
  const bySize = entry("effort", "by-size");
  for (const lang of ["en", "th"]) for (const t of ["task:report", "saf.config.local.json", "models.overrides"]) assert.ok(joined(bySize, lang).includes(t), `${lang}: ${t}`);
  assert.match(bySize.en.what, /only for the roles and card sizes[^.]*table/);
  assert.match(bySize.en.what, /one extra agent file per role and lowered effort/);
  assert.match(bySize.en.cost, /small cards[^.]*bounce more in review/i);
  assert.match(bySize.en.cost, /review rounds by size and effort/);
  assert.match(bySize.en.when, /per machine/);
  assert.match(bySize.en.when, /models\.overrides still wins for one role/);
  assert.match(fixed.en.what, /one effort for every card/);
  assert.match(fixed.en.what, /agent files stay as they are/);
  assert.match(bySize.th.cost, /ตีกลับ/);
  assert.match(bySize.th.when, /ต่อเครื่อง/);
  // The code behind the sentences.
  assert.ok(LOCAL_KEYS.includes("models.effort"), "the local file may override it");
  const by = (models, role, size) => cardEffort(resolveConfig({ stack: { packageManager: "none" }, models: { effort: "by-size", effortTracked: "by-size", ...models }, roles: { custom: [{ name: "helper", description: "Helps" }] } }), { role, size });
  const fixedEffort = (role) => cardEffort(resolveConfig({ stack: { packageManager: "none" }, roles: { custom: [{ name: "helper", description: "Helps" }] } }), { role, size: "S" }).effort;
  assert.equal(by({}, "helper", "S").effort, fixedEffort("helper"), "a role outside the table keeps its effort");
  assert.notEqual(by({}, "implementer", "S").effort, fixedEffort("implementer"), "a table role is lowered");
  assert.equal(by({ overrides: { implementer: { effort: "max" } } }, "implementer", "S").effort, "max", "models.overrides wins for one role");
  assert.equal(variantAgents(resolveConfig({ stack: { packageManager: "none" } })).length, 0, "fixed: no extra agent file");
  const planned = variantAgents(resolveConfig({ stack: { packageManager: "none" }, models: { effort: "by-size" } }));
  assert.ok(planned.length > 0 && planned.every((v) => Object.hasOwn(EFFORT_BY_SIZE, v.role)), "by-size: one extra file per table role and lowered effort");
});

test("EFFORT-AC-08 the model-preset explanations name the exception: a set models.planner or models.builder id wins under any preset", () => {
  for (const value of ["max", "balanced", "economy"]) {
    const e = entry("model-preset", value);
    for (const lang of ["en", "th"]) {
      assert.ok(e[lang].what.includes("models.planner") && e[lang].what.includes("models.builder"), `${value} ${lang}`);
      assert.ok(e[lang].what.length <= FIELD_MAX, `${value} ${lang}: ${e[lang].what.length}`);
    }
    assert.match(e.en.what, /a set models\.planner \/ models\.builder id replaces that tier's model/);
    assert.match(e.th.what, /id ที่ตั้งใน models\.planner \/ models\.builder จะแทนโมเดลของฝั่งนั้น/);
  }
  const resolved = resolveConfig({ stack: { packageManager: "none" }, models: { preset: "max", planner: "claude-fable-9-1", builder: "claude-haiku-9-2" } });
  assert.deepEqual([resolved.models.planner, resolved.models.builder], ["claude-fable-9-1", "claude-haiku-9-2"], "set ids replace the preset's models");
});

test("EFFORT-AC-08 questions.md group 4 has the models.effort row with default fixed and no longer says effort is always fixed", () => {
  const q = read("kit", "claude", "skills", "saf-setup", "questions.md");
  const models = section(q, "4. Models").replace(/\s+/g, " ");
  const row = section(q, "4. Models").split("\n").find((l) => l.includes("`models.effort`"));
  assert.ok(row, "a row with the key");
  const cells = row.split("|").slice(1, -1).map((c) => c.trim());
  assert.deepEqual([cells[2], cells[3]], ["fixed · by-size", "fixed"]);
  assert.ok(!/Effort is fixed per role/.test(models), "the old always-fixed sentence is gone");
  assert.match(models, /`models\.effort` decides.*`by-size` lowers.*`\.claude\/agents\/<role>-<effort>\.md`/, "the paragraph names the extra agent files");
  assert.match(section(q, "6. Workflow").replace(/\s+/g, " "), /`by-size` there lowers effort only when the project's `saf\.config\.json` also says `by-size`/);
});

test("EFFORT-AC-08 docs: setup-questions lists the effort question, config-reference defines the table and the variant files, roles names the variant agents", () => {
  const sq = read("docs", "setup-questions.md");
  const line = sq.split("\n").findIndex((l) => l.startsWith("4. **Models**"));
  assert.match(sq.split("\n").slice(line, line + 3).join(" "), /effort\s+\(`fixed` · `by-size`/, "the group-4 line lists the effort question");
  const cr = read("docs", "config-reference.md");
  const row = section(cr, "models").split("\n").find((l) => l.startsWith("| `effort`"));
  assert.ok(row);
  assert.ok(!/\byet\b/.test(row) && !/not asked/.test(row), "no plan state in the row");
  for (const t of ["EFFORT_BY_SIZE", "lib/config.mjs", "D-016", ".claude/agents/<role>-<effort>.md", "models.overrides", "saf.config.local.json", "roles.md"]) assert.ok(row.includes(t), t);
  const roles = read("docs", "roles.md");
  const variants = section(roles, "Variant agent files");
  assert.ok(variants, "a section on variant files");
  const planned = variantAgents(resolveConfig({ stack: { packageManager: "none" }, models: { effort: "by-size" } })).map((v) => v.name);
  assert.ok(planned.length > 0);
  for (const name of planned) assert.ok(variants.includes(`\`${name}\``), `${name} is named: the doc follows the table`);
  for (const t of ["models.effort", "task:start", "models.overrides", "saf upgrade", "docs:check", "fixed"]) assert.ok(variants.includes(t), t);
});

test("EFFORT-AC-08 SKILL.md per-machine paragraph says by-size on this machine needs a project whose saf.config.json says by-size", () => {
  const skill = read("kit", "claude", "skills", "saf-setup", "SKILL.md").replace(/\s+/g, " ");
  const para = skill.slice(skill.indexOf("Test mode and the two lane caps are per-machine"));
  assert.match(para, /^Test mode and the two lane caps are per-machine choices, and so is the effort mode\./);
  assert.match(para.slice(0, 900), /`by-size` there lowers effort only when the project's `saf\.config\.json` also says `by-size`[^.]*otherwise the role's own agent is used[^.]*`fixed` there always turns it off/);
});

test("EFFORT-AC-08 shipped texts name decision D-016 as SAF's own, the designer variant is explained, and SKILL.md lists the effort question in group 4", () => {
  for (const [file, text] of [["questions.md", read("kit", "claude", "skills", "saf-setup", "questions.md")], ["SKILL.md", read("kit", "claude", "skills", "saf-setup", "SKILL.md")], ["roles.md", read("docs", "roles.md")], ["config-reference.md", read("docs", "config-reference.md")]]) {
    for (const m of text.matchAll(/D-016/g)) assert.match(text.slice(Math.max(0, m.index - 20), m.index), /SAF's decision (\[)?$/, `${file}: D-016 is introduced as SAF's decision`);
  }
  const who = section(read("docs", "roles.md"), "Variant agent files").replace(/\s+/g, " ");
  assert.match(who, /`\/saf-plan` hands plan work to `designer-medium` and keeps `designer` for large design work/);
  assert.match(who, /a plan that adds a new spec file, or a decision row that affects more than one card/);
  const skill = read("kit", "claude", "skills", "saf-setup", "SKILL.md");
  assert.match(skill.split("\n").find((l) => l.startsWith("4. **Models**")), /effort \(fixed · by-size\)/);
});
