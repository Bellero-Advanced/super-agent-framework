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
  for (const q of QUESTIONS.filter((x) => [1, 2, 3, 4].includes(x.group))) {
    const entries = entriesOf(q.id);
    if (q.kind === "identity") assert.equal(entries.length, 0, q.id);
    else if (q.kind === "value") assert.deepEqual(entries.map((e) => e.values), [[]], `${q.id}: exactly one entry`);
    else assert.deepEqual(entries.flatMap((e) => e.values).sort(), [...q.options].sort(), `${q.id}: every option covered exactly once`);
  }
  assert.deepEqual(CHOICES.filter((e) => !QUESTIONS.some((q) => q.id === e.question)), []);
});
