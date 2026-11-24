import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { REPO, cleanup, lib, tmp } from "../helpers.mjs";

const { LANGUAGES, TEXT, languageName, mergeText, textFor } = await lib("text.mjs");
const { generate, templateData } = await lib("generate.mjs");
const { loadSchema, resolveConfig } = await lib("config.mjs");
const { detectProject } = await lib("detect.mjs");

after(cleanup);

const ENUMS = ["people.docLanguage", "people.chatLanguage", "roles.reportLanguage"];
const enumAt = (schema, path) => path.split(".").reduce((n, k) => n.properties[k], schema).enum;
const ANSWERS = (docLanguage) => ({ people: { docLanguage }, stack: { packageManager: "none" }, firstMilestone: { goal: "Ship the first screen. More later." } });
const read = (root, rel) => readFileSync(join(root, rel), "utf8");

/** A temp copy of kit/tools-saf with a fixture language `xx` (only `langName`), one template and `xx` in the three enums. Built once, imported by file URL (Windows-safe: no path compares). */
const FIXTURE_DOC = "XX-FIXTURE-DOCUMENT\n";
let copied;
async function fixture() {
  if (copied) return copied;
  const dir = tmp("saf-lang-");
  const engine = join(dir, "tools-saf");
  // the th templates are not needed by the fixture: copying them would only cost time
  cpSync(join(REPO, "kit", "tools-saf"), engine, { recursive: true, filter: (src) => !/[\\/]templates[\\/]th([\\/]|$)/.test(src) });
  const textFile = join(engine, "lib", "text.mjs");
  const text = readFileSync(textFile, "utf8");
  const edited = text.replace("export const TEXT = { en, th };", 'const xx = { langName: "Xx" };\nexport const TEXT = { en, th, xx };');
  assert.notEqual(edited, text, "the TEXT line was found");
  writeFileSync(textFile, edited);
  const schemaFile = join(engine, "schema", "saf.config.schema.json");
  const schema = JSON.parse(readFileSync(schemaFile, "utf8"));
  for (const p of ENUMS) enumAt(schema, p).push("xx");
  writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);
  mkdirSync(join(engine, "templates", "xx"), { recursive: true });
  const en = readFileSync(join(engine, "templates", "en", "CLAUDE.template.md"), "utf8");
  writeFileSync(join(engine, "templates", "xx", "CLAUDE.template.md"), FIXTURE_DOC + en);
  const url = (...p) => pathToFileURL(join(engine, ...p)).href;
  copied = { engine, gen: await import(url("lib", "generate.mjs")), choices: await import(url("lib", "choices.mjs")) };
  return copied;
}

test("LANG-AC-01 the three enums equal LANGUAGES, every table has langName, textFor of an unknown language is English, a partial table keeps the English value of a missing nested key", () => {
  assert.deepEqual(LANGUAGES, Object.keys(TEXT));
  const schema = loadSchema();
  for (const p of ENUMS) assert.deepEqual([...enumAt(schema, p)].sort(), [...LANGUAGES].sort(), `${p} differs from LANGUAGES in text.mjs`);
  for (const l of LANGUAGES) assert.ok(typeof TEXT[l].langName === "string" && TEXT[l].langName, `TEXT.${l} has no langName`);
  assert.equal(textFor("xx"), TEXT.en);
  assert.equal(textFor(undefined), TEXT.en);
  const partial = { langName: "Xx", status: { done: "DONE-XX" }, report: { cards: "CARDS-XX" } };
  const m = mergeText(TEXT.en, partial);
  assert.equal(m.status.done, "DONE-XX");
  assert.equal(m.status.failed, TEXT.en.status.failed, "a missing nested key reads in English");
  assert.equal(m.report.cards, "CARDS-XX");
  assert.equal(m.report.title, TEXT.en.report.title);
  assert.equal(m.stateTitle, TEXT.en.stateTitle);
  assert.equal(TEXT.en.status.done === "DONE-XX", false, "the base is not modified");
  assert.equal(mergeText(TEXT.en, undefined).stateTitle, TEXT.en.stateTitle);
});

test("LANG-AC-01 languageName reads the document language's names, then English names, then the language's own name, then the code", () => {
  assert.equal(languageName("th", "en"), "Thai");
  assert.equal(languageName("en", "en"), "English");
  assert.equal(languageName("th", "th"), "ภาษาไทย");
  assert.equal(languageName("en", "th"), "ภาษาอังกฤษ");
  assert.equal(languageName("th", "xx"), "Thai", "an unknown document language reads English names");
  assert.equal(languageName("xx", "en"), "xx", "no table, no name: the code");
  assert.equal(languageName("constructor", "en"), "constructor", "an inherited object key is not a language");
  assert.equal(textFor("constructor"), TEXT.en);
  assert.equal(textFor("__proto__"), TEXT.en);
});

test("LANG-AC-02 a language with one template reads it for that file, falls back to English with one warning per other file, and writes status files in English", async () => {
  const { gen } = await fixture();
  const root = tmp("saf-xx-");
  const plan = gen.planSetup(root, ANSWERS("xx"));
  const warned = plan.report.warnings.filter((w) => w.includes("is missing"));
  // every document except CLAUDE.md (the xx template); the goal in ANSWERS gives the M1 draft too
  const fallen = ["docs/INDEX.md", "docs/DECISIONS.md", "docs/plan/README.md", "docs/plan/milestones/M0.md", "docs/plan/milestones/M1.md", "docs/plan/tasks/T-M0-01.md", "docs/plan/tasks/_template.md", "docs/specs/_template.md", "commands/saf.md", "commands/saf-plan.md"];
  assert.equal(warned.length, fallen.length, `one warning per fallen-back document, got ${warned.length}`);
  assert.ok(warned.every((w) => w.includes("templates/xx/") && w.includes('"xx"')), "each warning names the path and the language");
  assert.ok(!warned.some((w) => w.includes("CLAUDE.template.md")), "the file xx has is not reported");
  for (const f of fallen) {
    assert.equal(warned.filter((w) => w.includes(`templates/xx/${f}`)).length, 1, f);
  }
  const { report } = gen.generate(root, ANSWERS("xx"));
  assert.deepEqual(report.warnings.filter((w) => w.includes("is missing")), warned, "the applied report carries the same warnings as the dry run");
  assert.ok(read(root, "CLAUDE.md").startsWith(FIXTURE_DOC), "CLAUDE.md comes from the xx template");
  const english = tmp("saf-en-");
  gen.generate(english, ANSWERS("en"));
  for (const f of ["docs/INDEX.md", "docs/plan/README.md", "docs/plan/tasks/M0/T-M0-01.md", ".claude/commands/saf.md"]) {
    assert.equal(read(root, f), read(english, f), `${f} is the English document`);
  }
  assert.ok(read(root, "docs/DECISIONS.md").includes("Documents in Xx"), "the language name comes from the table (langName)");
  assert.ok(read(root, "docs/plan/STATE.md").includes(TEXT.en.stateTitle), "status files use English labels");
});

test("LANG-AC-02 upgrade's refreshKitFiles warns once per command or skill whose template the language lacks, and writes the English one", async () => {
  const { gen } = await fixture();
  const root = tmp("saf-xx-up-");
  gen.generate(root, ANSWERS("en"));
  const cfgFile = join(root, "saf.config.json");
  const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
  cfg.people.docLanguage = "xx";
  writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  const report = gen.refreshKitFiles(root);
  const warned = report.warnings.filter((w) => w.includes("is missing"));
  assert.equal(warned.length, 2, `one warning per fallen-back file (the two commands), got ${warned.length}`);
  for (const f of ["commands/saf.md", "commands/saf-plan.md"]) {
    assert.equal(warned.filter((w) => w.includes(`templates/xx/${f}`)).length, 1, f);
  }
  assert.equal(new Set(warned).size, warned.length, "no warning repeats");
  assert.ok(warned.every((w) => w.includes('"xx"') && w.includes("the English template is used")), warned.join("\n"));
  assert.ok(!warned.some((w) => /docs\/|CLAUDE\.template/.test(w)), "refreshKitFiles only reads commands and skills");
  const english = tmp("saf-en-up-");
  gen.generate(english, ANSWERS("en"));
  for (const f of [".claude/commands/saf.md", ".claude/commands/saf-plan.md"]) assert.equal(read(root, f), read(english, f), `${f} is the English command`);
  // the shipped engine has no xx entry: the same project, language en again, gives no warning
  cfg.people.docLanguage = "en";
  writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  assert.deepEqual(gen.refreshKitFiles(root).warnings.filter((w) => w.includes("is missing")), []);
});

test("LANG-AC-03 choices lists the fixture language in the chat- and document-language entries and in the report-language entry for other languages, and its coverage rule still holds", async () => {
  const { engine, choices } = await fixture();
  const run = (group) => spawnSync(process.execPath, [join(engine, "bin", "saf.mjs"), "choices", "--group", String(group), "--lang", "en"], { cwd: tmp("saf-cwd-"), encoding: "utf8" });
  const one = run(1);
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout.split("\n").filter((l) => l === "- en · th · xx").length, 2, "chat and document language list xx");
  const five = run(5);
  assert.equal(five.status, 0, five.stderr);
  const lines = five.stdout.split("\n");
  assert.ok(lines.includes("- en") && lines.includes("- th · xx"), "report language: en, then every other language in one entry");
  // the SETUP-AC-02/05/06 rule on the copy: every option of the three questions is covered exactly once
  for (const id of ["chat-language", "doc-language", "report-language"]) {
    const q = choices.QUESTIONS.find((x) => x.id === id);
    const covered = choices.CHOICES.filter((e) => e.question === id).flatMap((e) => e.values);
    assert.deepEqual([...covered].sort(), [...q.options].sort(), id);
    assert.ok(q.options.includes("xx"), `${id} offers xx`);
  }
});

test("LANG-AC-04 with the shipped engine en and th give no fallback warning, the session table and language names are as before, and generate.mjs holds no language name or code comparison", () => {
  for (const lang of LANGUAGES) {
    const root = tmp("saf-ship-");
    const { report } = generate(root, ANSWERS(lang));
    assert.deepEqual(report.warnings.filter((w) => w.includes("is missing")), [], lang);
  }
  const rows = (lang) => templateData(resolveConfig(ANSWERS(lang)), detectProject(tmp("saf-det-"))).sessionRows;
  const en = rows("en");
  const th = rows("th");
  assert.deepEqual(en.map((r) => r.work), ["design · write cards/specs · review against specs", "build cards · test · specialist work"]);
  assert.deepEqual(th.map((r) => r.work), ["ออกแบบ · เขียนการ์ด/สเปก · ตรวจงานกับสเปก", "ลงมือทำการ์ด · ทดสอบ · งานเฉพาะทาง"]);
  const names = (lang) => {
    const d = templateData(resolveConfig(ANSWERS(lang)), detectProject(tmp("saf-det-")));
    return [d.docLanguageName, d.chatLanguageName, d.reportLanguageName];
  };
  assert.deepEqual(names("en"), ["English", "English", "English"]);
  assert.deepEqual(names("th"), ["ภาษาไทย", "ภาษาอังกฤษ", "ภาษาอังกฤษ"]);
  const src = readFileSync(join(REPO, "kit", "tools-saf", "lib", "generate.mjs"), "utf8");
  assert.ok(!/LANG_NAME|===\s*"th"/.test(src), "no LANG_NAME and no comparison with \"th\"");
  assert.ok(!/isTh|chatTh/.test(src));
});

test("LANG-AC-05 CONTRIBUTING.md has the Add a document language section with the four steps and the native-reader review", () => {
  const text = readFileSync(join(REPO, "CONTRIBUTING.md"), "utf8").replace(/\r\n/g, "\n");
  const at = text.indexOf("\n## Add a document language\n");
  assert.ok(at >= 0, "section heading");
  const section = text.slice(at + 1).split(/\n## /)[0];
  for (const step of ["1. **Table entry.**", "2. **Templates.**", "3. **Schema.**", "4. **Refresh, then test.**"]) assert.ok(section.includes(step), step);
  assert.ok(section.includes("kit/tools-saf/lib/text.mjs") && section.includes("templates/en/") && section.includes("people.docLanguage") && section.includes("roles.reportLanguage"));
  assert.ok(section.includes("npm run saf:refresh") && section.includes("upgrade --dir examples/todo-api") && section.includes("npm test"), "refresh both engine copies, then test");
  assert.ok(/native reader/i.test(section), "native-reader review");
});
