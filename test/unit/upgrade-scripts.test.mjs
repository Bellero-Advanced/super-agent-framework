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
  rewritePkg(root);
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
