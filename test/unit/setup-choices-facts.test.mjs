import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

const { generate, refreshKitFiles } = await lib("generate.mjs");
const { CHOICES, NOT_ASKED, LABELS } = await lib("choices.mjs");
const { EXIT_BUSY } = await lib("measure.mjs");
const { RIGOR, ROLE_LIBRARY, SIZE_CAPS, resolveConfig, roleTable } = await lib("config.mjs");
after(cleanup);

/** Renders a project from answers and returns its folder; the code facts below are read from what it wrote. */
const render = (answers) => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "none" }, ...answers }, { now: new Date("2026-01-02T00:00:00Z") });
  return root;
};
const read = (root, f) => readFileSync(join(root, f), "utf8");
const has = (root, f) => existsSync(join(root, f));
const entry = (question, value) => CHOICES.find((e) => e.question === question && (value === undefined || e.values.includes(value)));
const text = (e, lang) => Object.values(e[lang]).join(" ");
const modelOf = (root, role) => read(root, `.claude/agents/${role}.md`).match(/^model: (.+)$/m)[1];
const group2 = (lang) => spawnSync(process.execPath, [join(REPO, "kit", "tools-saf", "bin", "saf.mjs"), "choices", "--group", "2", "--lang", lang], { cwd: gitRepo(), encoding: "utf8" }).stdout;

test("SETUP-AC-11 the UI rule is present exactly when the type has one or translation is required, and the api, several and one/none explanations say so", () => {
  const api = render({ project: { type: "api" } });
  assert.ok(has(api, ".claude/rules/server-authority.md") && !has(api, ".claude/rules/ui.md"), "api without i18n: server rule, no UI rule");
  const apiI18n = render({ project: { type: "api" }, people: { uiLanguages: ["en", "th"], i18nRequired: true } });
  assert.ok(has(apiI18n, ".claude/rules/ui.md") && has(apiI18n, ".claude/rules/server-authority.md"), "api with i18n: both rules");
  assert.match(read(apiI18n, ".claude/rules/ui.md"), /i18n keys/);
  const libCli = render({ project: { type: "library-cli" }, people: { uiLanguages: ["en", "th"], i18nRequired: true } });
  assert.ok(has(libCli, ".claude/rules/ui.md") && !has(libCli, ".claude/rules/server-authority.md"), "library-cli with i18n: UI rule only");
  const web = render({ project: { type: "web-app" } });
  assert.match(read(web, ".claude/rules/ui.md"), /user-facing text stays in one place/, "without i18n the UI rule still keeps text in one place");
  assert.equal(resolveConfig({ project: { type: "api" }, people: { uiLanguages: ["en", "th"], i18nRequired: true } }).skills.packs.includes("i18n"), true, "several recommends the translation pack");
  assert.equal(resolveConfig({ project: { type: "api" } }).skills.packs.includes("i18n"), false);

  const api2 = entry("project-type", "api");
  assert.doesNotMatch(api2.en.what, /\bonly\b/i);
  assert.match(text(api2, "en"), /UI rule/);
  assert.match(api2.en.what, /translation is required/);
  assert.match(api2.th.what, /กฎ UI/);
  assert.match(api2.th.what, /หลายภาษา/);
  assert.match(api2.en.cost, /UI rule unless translation is required/);
  assert.match(api2.th.cost, /ถ้าไม่ต้องรองรับหลายภาษา/);
  const several = entry("ui-languages", "several");
  for (const lang of ["en", "th"]) assert.match(text(several, lang), /content-writer/, lang);
  assert.match(several.en.what, /every project type gets the UI rule/);
  assert.match(several.th.what, /ทุกประเภทโปรเจกต์ได้กฎ UI/);
  assert.match(several.en.good, /translation pack/);
  assert.match(several.th.good, /pack การแปล/);
  const one = entry("ui-languages", "one");
  assert.match(one.en.cost, /UI rule, where the type has one, only asks to keep text in one place/);
  assert.match(one.th.cost, /กฎ UI \(ในประเภทที่มี\) แค่ขอให้เก็บข้อความไว้ที่เดียว/);
});

test("SETUP-AC-11 a set planner or builder id wins under any preset, a custom planner role gets the planner id, an override wins, and the custom-models explanation says so", () => {
  const roles = { enabled: ["security-auditor", "content-writer"], custom: [{ name: "lead-writer", description: "Leads copy", tier: "planner" }, { name: "helper", description: "Helps" }] };
  const answers = { models: { preset: "balanced", planner: "claude-fable-9-1", builder: "claude-haiku-9-2", overrides: { "qa-runner": { model: "claude-haiku-9-3" } } }, roles };
  const root = render(answers);
  const planners = Object.keys(ROLE_LIBRARY).filter((r) => ROLE_LIBRARY[r].tier === "planner");
  assert.deepEqual(planners, ["designer", "spec-reviewer", "security-auditor"], "the role names the explanation lists");
  for (const r of planners) assert.equal(modelOf(root, r), "claude-fable-9-1", r);
  for (const r of ["implementer", "content-writer", "helper"]) assert.equal(modelOf(root, r), "claude-haiku-9-2", r);
  assert.equal(modelOf(root, "lead-writer"), "claude-fable-9-1", "a custom role marked planner");
  assert.equal(modelOf(root, "qa-runner"), "claude-haiku-9-3", "models.overrides wins for one role");
  for (const preset of ["max", "economy", "custom"]) assert.equal(roleTable(resolveConfig({ models: { preset, planner: "claude-fable-9-1" } })).find((r) => r.name === "designer").model, "claude-fable-9-1", preset);
  const modelsOf = (models) => Object.fromEntries(roleTable(resolveConfig({ models })).filter((r) => ["designer", "implementer"].includes(r.name)).map((r) => [r.name, r.model]));
  const balanced = modelsOf({ preset: "balanced" });
  assert.deepEqual(modelsOf({ preset: "custom" }), balanced, "Custom with empty ids falls back to Balanced");
  assert.deepEqual(modelsOf({ preset: "economy", builder: "claude-haiku-9-2" }).designer, resolveConfig({ models: { preset: "economy" } }).models.planner, "an empty id falls back to the chosen preset");

  const e = entry("custom-models");
  for (const lang of ["en", "th"]) {
    const all = text(e, lang);
    for (const token of ["designer", "spec-reviewer", "security-auditor", "models.overrides", "Balanced", "Custom"]) assert.ok(all.includes(token), `${lang}: ${token}`);
  }
  assert.match(e.en.what, /wins over any preset/);
  assert.match(e.en.cost, /chosen preset's model/);
  assert.match(e.th.what, /ชนะทุก preset/);
  assert.match(e.th.cost, /preset ที่เลือก/);
  assert.match(e.en.good, /custom roles marked planner/);
  assert.match(e.th.good, /custom role ที่ตั้งเป็น planner/);
  assert.doesNotMatch(e.en.when, /^the preset is Custom/);
});

test("SETUP-AC-11 strict rigor puts a security-auditor review in the Definition of done without the role, and the strict and not-asked explanations say so", () => {
  const strict = render({ project: { rigor: "strict" } });
  assert.ok(!has(strict, ".claude/agents/security-auditor.md"), "the role is not enabled");
  for (const [lang, line] of [["en", "`security-auditor` reviewed the milestone before its exit gate"], ["th", "`security-auditor` ตรวจ milestone ก่อนประตูออก"]]) {
    const root = render({ project: { rigor: "strict" }, people: { docLanguage: lang } });
    assert.ok(read(root, "CLAUDE.md").includes(line), `${lang}: the strict CLAUDE.md requires the review`);
  }
  assert.ok(!read(render({ project: { rigor: "standard" } }), "CLAUDE.md").includes("`security-auditor` reviewed"), "standard does not");
  const strictEntry = entry("project-rigor", "strict");
  for (const lang of ["en", "th"]) assert.match(text(strictEntry, lang), /security-auditor/, lang);
  assert.match(strictEntry.en.cost, /requires a security-auditor review per milestone even if that role is off/);
  assert.match(strictEntry.th.cost, /แม้ไม่ได้เปิด role นี้/);
  assert.match(strictEntry.en.when, /the interview then suggests the security-auditor role/);
  assert.match(text(entry("ui-languages", "several"), "en"), /suggests the content-writer role/);
  const row = read(REPO, "kit/claude/skills/saf-setup/questions.md").split(/\r?\n/).find((l) => l.includes("`roles.enabled`")) ?? "";
  for (const [role, when] of [["security-auditor", "strict rigor"], ["content-writer", "several UI languages"]]) {
    assert.ok(!ROLE_LIBRARY[role].core, `${role} is an optional role`);
    assert.ok(row.includes(`${when} → ${role}`), `questions.md suggests ${role} for ${when}`);
  }
  assert.equal(ROLE_LIBRARY["security-auditor"].tier, "planner");

  for (const lang of ["en", "th"]) {
    assert.ok(NOT_ASKED["workflow.measure.waitMs"][lang].includes(`exit ${EXIT_BUSY}`), `${lang}: the exit code comes from EXIT_BUSY`);
    for (const key of ["models.overrides", "workflow.review"]) assert.match(NOT_ASKED[key][lang], /\/saf/, `${lang}: ${key} names the /saf command`);
  }
  for (const key of ["models.overrides", "workflow.review"]) {
    assert.doesNotMatch(NOT_ASKED[key].en, /\bonly after\b/, `${key}: the /saf command also changes on upgrade`);
    assert.match(NOT_ASKED[key].en, /when setup runs again.+the \/saf command also on upgrade/, key);
    assert.match(NOT_ASKED[key].th, /ตอน upgrade ด้วย/, key);
  }
  assert.match(NOT_ASKED["models.overrides"].en, /docs:check/);
  assert.match(NOT_ASKED["models.overrides"].th, /docs:check/);
});

test("SETUP-AC-11 choices --group 2 names the unit of card sizes and test caps and prints the review level as words", () => {
  for (const lang of ["en", "th"]) {
    const out = group2(lang);
    const L = LABELS[lang];
    for (const [name, v] of Object.entries(RIGOR)) {
      const line = out.split("\n").find((l) => l.includes(`${L.sizes}: ${SIZE_CAPS.M.code} / ${SIZE_CAPS.L.code}`) && l.includes(`${L.review}: ${L.reviewWords[v.review]}`));
      assert.ok(line, `${lang} ${name}: the rigor line`);
      assert.ok(line.includes(`${L.caps}: ${SIZE_CAPS.M.test} / ${SIZE_CAPS.L.test}`) && line.includes(`${L.review}: ${L.reviewWords[v.review]}`), `${lang} ${name}: caps and review words`);
      assert.ok(!line.includes(v.review), `${lang} ${name}: no raw review id`);
    }
  }
  assert.match(LABELS.en.sizes, /changed code lines/);
  assert.match(LABELS.en.caps, /changed test lines/);
  assert.match(LABELS.th.sizes, /บรรทัดโค้ดที่เปลี่ยน/);
  assert.match(LABELS.th.caps, /บรรทัดเทสต์ที่เปลี่ยน/);
});

test("SETUP-AC-11 after models.overrides is set, upgrade re-renders the /saf command but not the agent files or CLAUDE.md, and docs:check flags the model", () => {
  const root = render({});
  const before = { agent: read(root, ".claude/agents/qa-runner.md"), claude: read(root, "CLAUDE.md"), saf: read(root, ".claude/commands/saf.md") };
  const cfg = JSON.parse(read(root, "saf.config.json"));
  cfg.models.overrides = { "qa-runner": { model: "claude-haiku-9-3" } };
  writeFileSync(join(root, "saf.config.json"), JSON.stringify(cfg, null, 2));
  refreshKitFiles(root);
  assert.notEqual(read(root, ".claude/commands/saf.md"), before.saf, "the /saf command lists the override");
  assert.match(read(root, ".claude/commands/saf.md"), /claude-haiku-9-3/);
  assert.equal(read(root, ".claude/agents/qa-runner.md"), before.agent, "agent files wait for setup");
  assert.equal(read(root, "CLAUDE.md"), before.claude, "CLAUDE.md waits for setup");
  const check = spawnSync(process.execPath, [join(REPO, "kit", "tools-saf", "bin", "saf.mjs"), "docs-check"], { cwd: root, encoding: "utf8" });
  assert.notEqual(check.status, 0, "docs:check fails");
  assert.match(check.stderr, /qa-runner\.md.+differs from saf\.config\.json/, "docs:check flags the model");
});
