import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { generate, planSetup, mergeScriptsText, refreshKitFiles } = await lib("generate.mjs");
const { init, upgrade } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const sha = (s) => createHash("sha1").update(s).digest("hex");
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const manifest = (root) => JSON.parse(read(root, ".saf/manifest.json")).files;
const ENTRY = ".claude/rules/mine.md";

async function project() {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  return root;
}

/** Every file under root (outside .git) with its bytes, so "byte-identical" is one deepEqual. */
function snapshot(root, dir = root, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) snapshot(root, p, out);
    else out[p.slice(root.length)] = readFileSync(p).toString("base64");
  }
  return out;
}

/** A file SAF wrote once (manifest entry), is no longer planned and was edited since: `keep-unplanned`. */
function unplanned(root) {
  writeFileSync(join(root, ENTRY), "edited since SAF wrote it\n");
  const m = JSON.parse(read(root, ".saf/manifest.json"));
  m.files[ENTRY] = sha("what SAF wrote\n");
  writeFileSync(join(root, ".saf/manifest.json"), `${JSON.stringify(m, null, 2)}\n`);
}

test("RERUN-AC-14 a same file is not rewritten (CRLF stays) and a keep-unplanned file keeps its manifest entry", async () => {
  const root = await project();
  const rel = "docs/plan/README.md";
  const crlf = Buffer.from(read(root, rel).replace(/\r?\n/g, "\r\n"));
  writeFileSync(join(root, rel), crlf);
  unplanned(root);
  const entry = manifest(root)[ENTRY];

  const plan = planSetup(root, ANSWERS);
  assert.equal(plan.actions.find((a) => a.path === rel).action, "same");
  generate(root, ANSWERS);
  assert.ok(readFileSync(join(root, rel)).equals(crlf), "the CRLF file is byte-identical");
  assert.equal(manifest(root)[ENTRY], entry, "the keep-unplanned file keeps its manifest entry");
  assert.equal(read(root, ENTRY), "edited since SAF wrote it\n");

  const third = planSetup(root, ANSWERS);
  assert.equal(third.actions.find((a) => a.path === ENTRY).action, "keep-unplanned", "not forgotten, not removed");
  generate(root, ANSWERS);
  assert.equal(manifest(root)[ENTRY], entry);
});

test("RERUN-AC-15 an unreadable manifest stops setup, the dry run and refreshKitFiles before anything is changed", async () => {
  const saf = (root, ...args) => {
    const answers = join(tmp(), "answers.json");
    writeFileSync(answers, JSON.stringify(ANSWERS));
    try {
      execFileSync(process.execPath, [join(root, "tools", "saf", "bin", "saf.mjs"), "setup", "--answers", answers, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { status: 0, stderr: "" };
    } catch (e) {
      return { status: e.status, stderr: String(e.stderr) };
    }
  };
  for (const bad of ["{ nope", "[]", '{ "files": [] }']) {
    const root = await project();
    writeFileSync(join(root, ".saf/manifest.json"), bad);
    writeFileSync(join(root, "docs/plan/README.md"), "my own readme\n");
    const before = snapshot(root);
    for (const args of [["--dry-run"], []]) {
      const r = saf(root, ...args);
      assert.equal(r.status, 1, `${bad} ${args}`);
      const lines = r.stderr.split(/\r?\n/).filter(Boolean);
      assert.equal(lines.length, 1, `one error line, no stack: ${r.stderr}`);
      assert.ok(lines[0].includes(".saf/manifest.json") && lines[0].includes("nothing was changed") && lines[0].includes("git checkout"), lines[0]);
    }
    assert.throws(() => planSetup(root, ANSWERS), /\.saf\/manifest\.json is not readable/);
    const report = refreshKitFiles(root);
    assert.ok(report.warnings.length === 1 && report.warnings[0].includes(".saf/manifest.json"), report.warnings.join("|"));
    assert.deepEqual(report.written, []);
    assert.deepEqual(snapshot(root), before, `${bad}: every file byte-identical, nothing archived`);
    assert.ok(!existsSync(join(root, "docs/archive/pre-saf")));
  }
});

test("RERUN-AC-16 report.kept holds plain paths, each kept path has exactly one warning", async () => {
  const root = await project();
  writeFileSync(join(root, "docs/DECISIONS.md"), `${read(root, "docs/DECISIONS.md")}\n| D-900 | ours | decided |\n`);
  unplanned(root);
  const { report } = generate(root, ANSWERS);
  assert.deepEqual([...report.kept].sort(), [ENTRY, "docs/DECISIONS.md"]);
  for (const k of report.kept) {
    assert.ok(existsSync(join(root, k)), `${k} is a file on disk`);
    assert.equal(report.warnings.filter((w) => w.includes(k)).length, 1, `one warning for ${k}`);
  }

  const up = await project();
  const cmd = ".claude/commands/saf.md";
  writeFileSync(join(up, cmd), `${read(up, cmd)}\nour own line\n`);
  const r = refreshKitFiles(up);
  assert.deepEqual(r.kept, [cmd]);
  assert.equal(r.warnings.filter((w) => w.includes(cmd)).length, 1);
  assert.ok(r.warnings[0].includes("edited in this project — kept"));
});

test("UPG-AC-07 a package.json that is not an object, or whose scripts is not one, is never replaced; setup and upgrade say the same words", async () => {
  assert.deepEqual(mergeScriptsText("[]", { a: "b" }), { text: null, added: [], kept: [], scripts: null, invalid: true, reason: "root" });
  assert.equal(mergeScriptsText('{ "scripts": "build.sh" }', { a: "b" }).reason, "scripts");
  for (const text of ['{ "scripts": [] }', '{ "scripts": null }', '{ "scripts": 3 }']) {
    const r = mergeScriptsText(text, { a: "b" });
    assert.ok(r.invalid && r.reason === "scripts" && r.text === null, text);
  }
  assert.equal(mergeScriptsText("{ nope", { a: "b" }).reason, "json");
  assert.equal(mergeScriptsText("{}", { a: "b" }).invalid, false);

  const cases = [
    ["[]", "package.json is not a JSON object"],
    ['{ "scripts": "build.sh" }', "`scripts` is not a JSON object"],
    ["{ nope", "package.json is not valid JSON"],
  ];
  for (const [text, words] of cases) {
    const root = await project();
    writeFileSync(join(root, "package.json"), text);
    const plan = planSetup(root, ANSWERS);
    assert.ok(plan.report.warnings.some((w) => w.includes(words)), `setup: ${words}`);
    assert.equal(plan.merges.packageJson.state, "invalid");
    const lines = [];
    await upgrade(root, { log: (s) => lines.push(s) });
    assert.ok(lines.some((l) => l.includes(words)), `upgrade: ${words}`);
    assert.equal(read(root, "package.json"), text, "package.json byte-identical");
    generate(root, ANSWERS);
    assert.equal(read(root, "package.json"), text, "setup leaves it byte-identical too");
  }
});
