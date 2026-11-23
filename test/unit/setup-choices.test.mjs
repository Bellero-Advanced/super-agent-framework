import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, lib, tmp, write } from "../helpers.mjs";

const { QUESTIONS, CHOICES, FIELD_MAX, GROUPS, LABELS, NOT_ASKED, INTERNAL_KEYS, MACHINE_SWITCHES, DOCS_URL, schemaLeaves } = await lib("choices.mjs");
const { LOCAL_KEYS, MODEL_PRESETS, RIGOR, ROLE_LIBRARY, SKILL_PACKS, loadSchema } = await lib("config.mjs");

after(cleanup);

const asked = QUESTIONS.flatMap((q) => q.keys);
/** Problems of the coverage rule: leaves without a home or in several, and listed keys the schema does not have. */
const coverage = (schema) => {
  const leaves = schemaLeaves(schema);
  const homes = [asked, Object.keys(NOT_ASKED), INTERNAL_KEYS];
  return [
    ...leaves.filter((k) => homes.filter((h) => h.includes(k)).length !== 1).map((k) => `${k}: not in exactly one list`),
    ...homes.flat().filter((k) => !leaves.includes(k)).map((k) => `${k}: not in the schema`),
  ];
};

test("SETUP-AC-01 every schema leaf is asked, not asked or internal — and a fixture schema with an extra key fails naming it", () => {
  const schema = loadSchema();
  assert.deepEqual(coverage(schema), []);
  assert.ok(schemaLeaves(schema).includes("workflow.lanePorts.base") && !schemaLeaves(schema).includes("workflow.lanePorts"));
  const fixture = structuredClone(schema);
  fixture.properties.workflow.properties.brandNewKey = { type: "string" };
  assert.deepEqual(coverage(fixture), ["workflow.brandNewKey: not in exactly one list"]);
});

/** Backticked keys in the Key column of every table of questions.md that has one. */
function keyColumn() {
  const keys = [];
  let col = -1;
  for (const line of readFileSync(join(REPO, "kit", "claude", "skills", "saf-setup", "questions.md"), "utf8").split("\n")) {
    if (!line.startsWith("|")) {
      col = -1;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.includes("Key")) col = cells.indexOf("Key");
    else if (col >= 0 && !/^-+$/.test(cells[0])) keys.push(...[...(cells[col] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  }
  return keys;
}

test("SETUP-AC-02 asked keys equal the Key column of questions.md, and option values equal their source", () => {
  const col = keyColumn();
  assert.ok(col.length > 30);
  assert.ok(col.every((k) => /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(k)), "full dotted keys only");
  assert.deepEqual([...new Set(col)].sort(), [...new Set(asked)].sort());
  assert.equal(new Set(asked).size, asked.length, "a key belongs to one question");
  const node = (p) => p.split(".").reduce((n, k) => n.properties[k], loadSchema());
  for (const q of QUESTIONS.filter((x) => x.kind === "choice")) {
    const first = q.keys[0] && node(q.keys[0]);
    const source = q.id === "extra-roles" ? Object.keys(ROLE_LIBRARY).filter((r) => !ROLE_LIBRARY[r].core) : q.id === "skill-packs" ? SKILL_PACKS : first?.enum ?? (q.keys.length === 1 && first?.type === "boolean" ? ["yes", "no"] : undefined);
    if (source) assert.deepEqual(q.options, source, q.id);
    else assert.ok(q.options?.length, `${q.id} lists its values`);
  }
  assert.deepEqual(QUESTIONS.filter((q) => q.group === "flow").map((q) => q.id), ["adopt", "commit"]);
});

const run = (cwd, ...args) => spawnSync(process.execPath, [join(REPO, "kit", "tools-saf", "bin", "saf.mjs"), "choices", ...args], { cwd, encoding: "utf8" });
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((f) => `${f}`);

test("SETUP-AC-03 choices --not-asked lists every key with its summary, where to change it and the per-machine switches", () => {
  const root = tmp();
  const before = snapshot(root);
  const check = (r, lang) => {
    assert.equal(r.status, 0, r.stderr);
    for (const [k, v] of Object.entries(NOT_ASKED)) assert.ok(r.stdout.includes(k) && r.stdout.includes(v[lang]), k);
    assert.ok(r.stdout.includes("saf.config.json") && r.stdout.includes(`${DOCS_URL}#workflow`));
    for (const k of [...LOCAL_KEYS, ...Object.keys(MACHINE_SWITCHES), "SAF_TEST_MODE", "SAF_STOP_HOOK"]) assert.ok(r.stdout.includes(k), k);
    for (const k of LOCAL_KEYS) assert.ok(MACHINE_SWITCHES[k], `${k} has a line`);
    assert.ok(r.stdout.includes("saf.config.local.json"));
  };
  check(run(root, "--not-asked"), "en");
  write(root, "saf.config.json", { version: 1, people: { chatLanguage: "th" } });
  const withConfig = snapshot(root);
  check(run(root, "--not-asked"), "th");
  assert.ok(!run(root, "--not-asked").stdout.includes(NOT_ASKED["workflow.review"].en));
  check(run(root, "--not-asked", "--lang", "en"), "en");
  assert.deepEqual(snapshot(root), withConfig);
  assert.deepEqual(withConfig.filter((f) => !before.includes(f)), ["saf.config.json"]);
});

const USAGE = /usage: choices --group <1\|2\|3\|4\|5\|6\|7\|8\|flow> \[--lang en\|th\] \| choices --not-asked \[--lang en\|th\]/;

test("SETUP-AC-03 usage errors exit 2 and list the valid values", () => {
  const root = tmp();
  for (const args of [[], ["--lang", "fr", "--not-asked"], ["--not-asked", "--lang"]]) {
    const r = run(root, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, USAGE);
  }
});

const TEXT_FIELDS = ["what", "good", "cost", "when"];
const entriesOf = (id) => CHOICES.filter((e) => e.question === id);

test("SETUP-AC-04 choices --group 2 --lang th prints every option with four Thai-labelled fields and the derived rigor values", () => {
  const root = tmp();
  const before = snapshot(root);
  const r = run(root, "--group", "2", "--lang", "th");
  assert.equal(r.status, 0, r.stderr);
  for (const id of ["project-type", "project-stage", "project-rigor"]) {
    const q = QUESTIONS.find((x) => x.id === id);
    assert.ok(r.stdout.includes(q.keys[0]), q.keys[0]);
    for (const v of q.options) assert.ok(entriesOf(id).some((e) => e.values.includes(v) && r.stdout.includes(`- ${e.values.join(" · ")}`)), `${id} ${v}`);
    for (const e of entriesOf(id)) for (const f of TEXT_FIELDS) assert.ok(r.stdout.includes(e.th[f]), `${id} ${e.values} ${f}`);
  }
  const count = (text) => r.stdout.split(text).length - 1;
  for (const label of LABELS.th.fields) assert.equal(count(`    ${label}: `), CHOICES.filter((e) => QUESTIONS.find((q) => q.id === e.question).group === 2).length, label);
  for (const [name, v] of Object.entries(RIGOR)) {
    const line = r.stdout.split("\n").find((l) => l.includes(`${LABELS.th.sizes}: ${v.sizes.S} / ${v.sizes.M}`) && l.includes(`${v.testCaps.S} / ${v.testCaps.M}`) && l.includes(`${LABELS.th.review}: ${v.review}`));
    assert.ok(line && line.includes(v.merge.join(" · ")), name);
  }
  assert.ok(!r.stdout.includes(LABELS.en.fields[0]), "no English labels");
  assert.deepEqual(snapshot(root), before, "writes no file");
});

test("SETUP-AC-04 choices --group 4 appends the planner and builder models of each preset; the language follows the config unless --lang is given", () => {
  const root = tmp();
  const en = run(root, "--group", "4", "--lang", "en");
  assert.equal(en.status, 0, en.stderr);
  for (const v of Object.values(MODEL_PRESETS)) assert.ok(en.stdout.includes(`${LABELS.en.planner}: ${v.planner} · ${LABELS.en.builder}: ${v.builder}`));
  write(root, "saf.config.json", { version: 1, people: { chatLanguage: "th" } });
  assert.ok(run(root, "--group", "4").stdout.includes(LABELS.th.fields[0]));
  assert.ok(run(root, "--group", "4", "--lang", "en").stdout.includes(LABELS.en.fields[0]));
  assert.equal(run(root, "--group", "flow").status, 0);
});

test("SETUP-AC-04 a bad group, language or flag combination exits 2 and lists the valid values", () => {
  const root = tmp();
  for (const args of [["--group", "9"], ["--group", "2", "--lang", "fr"], ["--group"], ["--group", "--lang", "th"], ["--group", "2", "--not-asked"], ["--lang", "th"]]) {
    const r = run(root, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, USAGE);
    assert.equal(r.stdout, "");
  }
  assert.deepEqual(GROUPS.map(String), ["1", "2", "3", "4", "5", "6", "7", "8", "flow"]);
});

test("SETUP-AC-05 every explanation has four short fields in en and th, no numbers or model ids, and covers each option exactly once", () => {
  assert.ok(CHOICES.length > 0 && Number.isInteger(FIELD_MAX));
  for (const e of CHOICES) {
    for (const lang of ["en", "th"]) {
      assert.deepEqual(Object.keys(e[lang]), TEXT_FIELDS, `${e.question} ${lang}`);
      for (const f of TEXT_FIELDS) {
        const text = e[lang][f];
        const at = `${e.question} ${e.values} ${lang}.${f}`;
        assert.ok(typeof text === "string" && text.trim() && text.length <= FIELD_MAX, `${at}: empty or over ${FIELD_MAX} (${text.length})`);
        assert.ok(!/\d\d/.test(text) && !text.includes("claude-"), `${at}: number or model id`);
      }
    }
  }
  for (const q of QUESTIONS.filter((x) => entriesOf(x.id).length && x.kind === "choice")) {
    assert.deepEqual(entriesOf(q.id).flatMap((e) => e.values).sort(), [...q.options].sort(), `${q.id}: every option covered exactly once`);
  }
  assert.deepEqual(CHOICES.filter((e) => !QUESTIONS.some((q) => q.id === e.question)), []);
});

test("SETUP-AC-06 every choice question of every group has entries for all its values, every value question exactly one, identity none, and the flow group is adopt and commit", () => {
  for (const q of QUESTIONS) {
    const entries = entriesOf(q.id);
    if (q.kind === "identity") assert.equal(entries.length, 0, `${q.id}: identity has no explanation`);
    else if (q.kind === "value") assert.deepEqual(entries.map((e) => e.values), [[]], `${q.id}: exactly one entry`);
    else {
      assert.ok(Array.isArray(q.options) && q.options.length, `${q.id}: choice question lists its options`);
      assert.deepEqual(entries.flatMap((e) => e.values).sort(), [...q.options].sort(), `${q.id}: every option covered exactly once`);
    }
  }
  const flow = QUESTIONS.filter((q) => q.group === "flow");
  assert.deepEqual(flow.map((q) => [q.id, q.kind, q.keys]), [["adopt", "choice", []], ["commit", "choice", []]]);
  for (const g of GROUPS) assert.ok(QUESTIONS.some((q) => String(q.group) === String(g) && entriesOf(q.id).length), `group ${g} explains at least one question`);
});

test("SETUP-AC-06 choices --group prints every entry of groups 5-8 and flow in both languages", () => {
  const root = tmp();
  for (const lang of ["en", "th"]) {
    assert.ok(/^## adopt$/m.test(run(root, "--group", "flow", "--lang", lang).stdout) && /^## commit$/m.test(run(root, "--group", "flow", "--lang", lang).stdout), "flow questions are named");
    for (const g of [5, 6, 7, 8, "flow"]) {
      const r = run(root, "--group", String(g), "--lang", lang);
      assert.equal(r.status, 0, r.stderr);
      for (const q of QUESTIONS.filter((x) => String(x.group) === String(g) && x.kind !== "identity")) {
        for (const e of entriesOf(q.id)) for (const f of TEXT_FIELDS) assert.ok(r.stdout.includes(e[lang][f]), `${g} ${lang} ${q.id} ${e.values} ${f}`);
      }
    }
  }
});

const read = (...p) => readFileSync(join(REPO, ...p), "utf8");
const lines = (text) => text.split(/\r?\n/);
/** GitHub heading anchor: lowercase, punctuation dropped (letters, digits, `-`, `_` stay), spaces to `-`; repeated headings get `-1`, `-2`. */
const slug = (heading) => heading.toLowerCase().replace(/[^\p{L}\p{N}\p{M} _-]/gu, "").replace(/ /g, "-");
/** `## ` sections of a markdown file outside code fences: heading text, GitHub anchor and body. */
function sections(text) {
  const out = [];
  const seen = new Map();
  let fenced = false;
  for (const line of lines(text)) {
    if (line.startsWith("```")) fenced = !fenced;
    const h = !fenced && /^#{1,6} (.+)$/.exec(line);
    if (h) {
      const base = slug(h[1].trim());
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      out.push({ level: h[0].indexOf(" "), heading: h[1], anchor: n ? `${base}-${n}` : base, body: [] });
    } else out.at(-1)?.body.push(line);
  }
  return out.map((s) => ({ ...s, body: s.body.join("\n") }));
}
/** Text of one `## Step n` of the skill, up to the next `## `. */
const step = (skill, n) => sections(skill).find((s) => s.heading.startsWith(`Step ${n}`))?.body ?? "";

test("SETUP-AC-07 config-reference names every schema leaf in the section of its top-level key, and every printed anchor is a lowercase heading anchor", () => {
  const sec = sections(read("docs", "config-reference.md")).filter((s) => s.level === 2);
  assert.equal(slug("`saf.config.local.json`"), "safconfiglocaljson");
  assert.equal(slug("tokenSaving · firstMilestone"), "tokensaving--firstmilestone", "the helper follows GitHub: a dropped middle dot leaves two hyphens");
  const problems = [];
  for (const leaf of schemaLeaves(loadSchema()).filter((k) => !INTERNAL_KEYS.includes(k))) {
    const [top, ...rest] = leaf.split(".");
    const body = sec.find((s) => s.anchor === top.toLowerCase())?.body;
    if (body === undefined) problems.push(`${leaf}: no section "${top.toLowerCase()}"`);
    else if (![...body.matchAll(/`([^`]+)`/g)].some((m) => m[1] === rest.at(-1))) problems.push(`${leaf}: \`${rest.at(-1)}\` not named in backticks`);
  }
  assert.deepEqual(problems, []);
  const anchors = new Set(sec.map((s) => s.anchor));
  for (const lang of ["en", "th"]) {
    const printed = [...run(tmp(), "--not-asked", "--lang", lang).stdout.matchAll(/ · (https:\/\/\S+)/g)].map((m) => m[1]);
    assert.equal(printed.length, Object.keys(NOT_ASKED).length);
    for (const url of printed) {
      const [base, anchor] = url.split("#");
      assert.equal(base, DOCS_URL);
      assert.equal(anchor, anchor.toLowerCase(), `${url} is lowercase`);
      assert.ok(anchors.has(anchor), `${url}: no heading with this anchor`);
    }
  }
});

test("SETUP-AC-08 SKILL.md runs choices --group before each group in Step 1 and choices --not-asked with the adjust option in Step 2", () => {
  const skill = read("kit", "claude", "skills", "saf-setup", "SKILL.md");
  const one = step(skill, 1);
  assert.ok(one.includes("node tools/saf/bin/saf.mjs choices --group <g> --lang <chat language>"));
  assert.ok(/pick it when/i.test(one) && /option · what it is · good for · cost · pick it when/.test(one), "the compact table and the description line");
  assert.ok(/offer[^\n]*only (when|if) (the person|they|asked)/i.test(one.replace(/\s+/g, " ")), "skipped questions explain only on request");
  const two = step(skill, 2);
  assert.ok(two.includes("node tools/saf/bin/saf.mjs choices --not-asked --lang <chat language>"));
  for (const option of ["Generate (recommended)", "Change an answer", "Adjust a setting that was not asked"]) assert.ok(two.includes(option), option);
  assert.ok(two.includes(".saf/setup-answers.json"));
});

test("SETUP-AC-09 SKILL.md asks the adopt question in Step 1 and passes exactly one adopt flag in Step 3; questions.md recommends yes outside the Key tables", () => {
  const skill = read("kit", "claude", "skills", "saf-setup", "SKILL.md");
  const one = step(skill, 1).replace(/\s+/g, " ");
  assert.ok(/adopt: true/.test(one) && /keep the old docs as history/.test(one) && one.includes("choices --group flow"));
  assert.ok(/new project[^.]*skip/i.test(one), "a new project skips the question and says so");
  const three = step(skill, 3).replace(/\s+/g, " ");
  assert.ok(three.includes("--adopt") && three.includes("--no-adopt") && /exactly one/.test(three));
  assert.ok(/--adopt[^\n]*yes/i.test(three) && /--no-adopt[^\n]*(no|skipped)/i.test(three));
  const flow = sections(read("kit", "claude", "skills", "saf-setup", "questions.md")).find((s) => /^Setup flow/.test(s.heading));
  assert.ok(flow && !/^\|/m.test(flow.body), "a list, not a table");
  assert.ok(/adopt[^\n]*recommended[^\n]*yes/i.test(flow.body) && /commit[^\n]*recommended[^\n]*yes/i.test(flow.body));
});
