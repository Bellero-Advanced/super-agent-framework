import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, lib, tmp, write } from "../helpers.mjs";

const { QUESTIONS, NOT_ASKED, INTERNAL_KEYS, MACHINE_SWITCHES, DOCS_URL, schemaLeaves } = await lib("choices.mjs");
const { LOCAL_KEYS, ROLE_LIBRARY, SKILL_PACKS, loadSchema } = await lib("config.mjs");

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

test("SETUP-AC-03 usage errors exit 2 and list the valid values", () => {
  const root = tmp();
  for (const args of [[], ["--lang", "fr", "--not-asked"], ["--group", "2"], ["--not-asked", "--lang"]]) {
    const r = run(root, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /usage: choices --not-asked \[--lang en\|th\]/);
  }
});
