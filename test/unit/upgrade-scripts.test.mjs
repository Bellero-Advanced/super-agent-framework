import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

const { engineScripts } = await lib("generate.mjs");
const { resolveConfig } = await lib("config.mjs");
const { init, upgrade } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const CULPRIT = "node tools/saf/bin/saf.mjs task culprit";
const readPkg = (root) => readFileSync(join(root, "package.json"), "utf8");

async function project(answers = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } } }) {
  const root = gitRepo();
  await init(root, { answers });
  return root;
}

/** Rewrite package.json: drop keys from scripts, serialize with the given indent / eol. */
function rewritePkg(root, { drop = ["task:culprit"], indent = 2, eol = "\n", tail = true, edit } = {}) {
  const pkg = JSON.parse(readPkg(root));
  for (const k of drop) delete pkg.scripts[k];
  edit?.(pkg);
  const text = JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + (tail ? eol : "");
  writeFileSync(join(root, "package.json"), text);
  return text;
}

test("UPG-AC-01 upgrade adds the missing task:culprit and nothing else", async () => {
  const root = await project();
  rewritePkg(root, { edit: (p) => Object.assign(p, { version: "1.2.3", dependencies: { left: "^1.0.0" }, custom: { keep: [1, "two", null] } }) });
  const before = JSON.parse(readPkg(root));
  assert.equal(before.scripts["task:culprit"], undefined);
  const lines = [];
  const res = await upgrade(root, { log: (s) => lines.push(s) });
  const after = JSON.parse(readPkg(root));
  assert.equal(after.scripts["task:culprit"], CULPRIT);
  assert.equal(after.scripts.measure, undefined, "measure is disabled → no measure script");
  const { "task:culprit": _, ...rest } = after.scripts;
  assert.deepEqual(rest, before.scripts, "every other script unchanged");
  assert.deepEqual(res.scripts.added, ["task:culprit"]);
  assert.ok(lines.some((l) => l.includes("added script: task:culprit")));
  assert.deepEqual(Object.keys(after.scripts).at(-1), "task:culprit", "appended last");
  const { scripts: _s1, ...otherAfter } = after;
  const { scripts: _s2, ...otherBefore } = before;
  assert.deepEqual(otherAfter, otherBefore, "UPG-AC-04 every top-level key besides scripts is unchanged");
  assert.deepEqual(Object.keys(after), Object.keys(before), "UPG-AC-04 top-level key order is unchanged");
});

test("UPG-AC-02 a different existing script is kept and listed, the missing one is added", async () => {
  const root = await project();
  rewritePkg(root, { edit: (p) => (p.scripts["task:verify"] = "echo mine") });
  const lines = [];
  const res = await upgrade(root, { log: (s) => lines.push(s) });
  const pkg = JSON.parse(readPkg(root));
  assert.equal(pkg.scripts["task:verify"], "echo mine");
  assert.deepEqual(res.scripts.kept, ["task:verify"]);
  assert.ok(lines.some((l) => l.includes("kept script: task:verify") && l.includes("node tools/saf/bin/saf.mjs task verify")));
  assert.equal(pkg.scripts["task:culprit"], CULPRIT);
});

test("UPG-AC-03 nothing missing → package.json is byte-identical", async () => {
  const root = await project();
  // odd formatting a rewrite would normalise: 3-space indent, no trailing newline, CRLF
  const text = rewritePkg(root, { drop: [], indent: 3, eol: "\r\n", tail: false });
  const res = await upgrade(root);
  assert.equal(readPkg(root), text);
  assert.deepEqual(res.scripts.added, []);
});

test("UPG-AC-04 indentation (4 spaces, tab), CRLF and trailing newline are kept when adding", async () => {
  for (const indent of [4, "\t"]) {
    const root = await project();
    rewritePkg(root, { indent });
    await upgrade(root);
    const text = readPkg(root);
    assert.match(text, new RegExp(`^\\{\\n${indent === 4 ? " {4}" : "\\t"}"`), `indent ${JSON.stringify(indent)}`);
    assert.ok(text.endsWith("}\n"));
    assert.equal(JSON.parse(text).scripts["task:culprit"], CULPRIT);
  }
  const crlf = await project();
  rewritePkg(crlf, { eol: "\r\n" });
  await upgrade(crlf);
  const text = readPkg(crlf);
  assert.ok(text.endsWith("}\r\n"));
  assert.ok(!/[^\r]\n/.test(text), "no bare LF in a CRLF file");
  const bare = await project();
  rewritePkg(bare, { tail: false });
  await upgrade(bare);
  assert.ok(readPkg(bare).endsWith("}"), "no trailing newline stays none");
});

test("UPG-AC-04 a byte-order mark is kept when adding, with the indentation and line endings after it", async () => {
  const root = await project();
  rewritePkg(root, { indent: "\t", eol: "\r\n", tail: false });
  writeFileSync(join(root, "package.json"), `\uFEFF${readPkg(root)}`);
  const res = await upgrade(root);
  const text = readPkg(root);
  assert.deepEqual(res.scripts.added, ["task:culprit"]);
  assert.ok(text.startsWith('\uFEFF{\r\n\t"'), "BOM, CRLF and tab kept");
  assert.ok(!text.slice(1).includes("\uFEFF"), "one BOM only");
  assert.ok(text.endsWith("}") && !text.endsWith("\n"), "no trailing newline stays none");
  assert.equal(JSON.parse(text.slice(1)).scripts["task:culprit"], CULPRIT);
});

test("UPG-AC-05 a saf.config.json that fails the schema, and a package.json with a non-object root or scripts, are left alone with a line", async () => {
  const schemaBad = await project();
  const text = rewritePkg(schemaBad);
  const cfg = JSON.parse(readFileSync(join(schemaBad, "saf.config.json"), "utf8"));
  cfg.stack.packageManager = "not-a-manager";
  writeFileSync(join(schemaBad, "saf.config.json"), JSON.stringify(cfg, null, 2));
  const lines0 = [];
  const r0 = await upgrade(schemaBad, { log: (s) => lines0.push(s) });
  assert.equal(readPkg(schemaBad), text, "package.json untouched");
  assert.deepEqual(r0.scripts.added, []);
  assert.ok(lines0.some((l) => l.includes("saf.config.json") && l.includes("package.json scripts were not checked")), lines0.join("\n"));
  assert.ok(r0.errors.length > 0, "the schema errors are returned");

  for (const [name, body, words] of [
    ["array root", "[1, 2]", "package.json is not a JSON object"],
    ["null root", "null", "package.json is not a JSON object"],
    ["string scripts", '{ "name": "x", "scripts": "nope" }', "`scripts` is not a JSON object"],
    ["null scripts", '{ "name": "x", "scripts": null }', "`scripts` is not a JSON object"],
    ["array scripts", '{ "name": "x", "scripts": [] }', "`scripts` is not a JSON object"],
  ]) {
    const root = await project();
    writeFileSync(join(root, "package.json"), body);
    const lines = [];
    const res = await upgrade(root, { log: (s) => lines.push(s) });
    assert.equal(readPkg(root), body, `${name}: untouched`);
    assert.deepEqual(res.scripts.added, [], name);
    assert.ok(lines.some((l) => l.includes(words) && l.includes("scripts were not added")), `${name}: ${lines.join("\n")}`);
  }
});

test("UPG-AC-05 packageManager none, no package.json and invalid JSON leave package.json alone", async () => {
  const none = await project({ stack: { packageManager: "none" } });
  assert.ok(!existsSync(join(none, "package.json")));
  const r0 = await upgrade(none);
  assert.ok(!existsSync(join(none, "package.json")), "none → not created");
  assert.deepEqual(r0.scripts.added, []);
  writeFileSync(join(none, "package.json"), "{ not json");
  const lines0 = [];
  await upgrade(none, { log: (s) => lines0.push(s) });
  assert.equal(readPkg(none), "{ not json");
  assert.ok(!lines0.some((l) => l.includes("package.json")), "none → package.json not even mentioned");

  const missing = await project();
  rmSync(join(missing, "package.json"));
  const lines1 = [];
  await upgrade(missing, { log: (s) => lines1.push(s) });
  assert.ok(!existsSync(join(missing, "package.json")), "never created");
  assert.ok(lines1.some((l) => l.includes("no package.json") && l.includes("node tools/saf/bin/saf.mjs")));

  const bad = await project();
  writeFileSync(join(bad, "package.json"), "{ not json");
  const lines2 = [];
  await upgrade(bad, { log: (s) => lines2.push(s) });
  assert.equal(readPkg(bad), "{ not json");
  assert.ok(lines2.some((l) => l.includes("package.json is not valid JSON")));

  const noConfig = await project();
  const text = rewritePkg(noConfig);
  rmSync(join(noConfig, "saf.config.json"));
  const lines3 = [];
  await upgrade(noConfig, { log: (s) => lines3.push(s) });
  assert.equal(readPkg(noConfig), text);
  assert.ok(lines3.some((l) => l.includes("saf.config.json") && l.includes("package.json")));
});

test("UPG-AC-06 examples/todo-api/package.json has every script the engine wants", () => {
  const dir = join(REPO, "examples", "todo-api");
  const config = resolveConfig(JSON.parse(readFileSync(join(dir, "saf.config.json"), "utf8")));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const want = engineScripts(config);
  for (const [name, value] of Object.entries(want)) assert.equal(pkg.scripts[name], value, name);
});
