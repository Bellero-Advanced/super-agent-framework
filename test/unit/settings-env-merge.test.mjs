import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { ARCHIVE, generate, planLines, planSetup } = await lib("generate.mjs");
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const NOW = new Date("2026-01-02T03:04:05Z");
const SAF_CLI = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const SETTINGS = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";
const PROJ = "project-secret-1";
const LOC = "local-secret-1";
const OTHER = "project-secret-2";
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const json = (root, rel) => JSON.parse(read(root, rel));
const ignored = (root, rel) => spawnSync("git", ["check-ignore", "-q", rel], { cwd: root }).status === 0;
const SECRETS = [PROJ, LOC, OTHER];
const noSecret = (text, what) => {
  for (const s of SECRETS) assert.ok(!String(text).includes(s), `${what} holds a value`);
};

/** The CLI dry run in `root`; returns its output after checking that it wrote nothing. */
function dryRun(root) {
  const file = join(tmp("saf-answers-"), "answers.json");
  writeFileSync(file, JSON.stringify(ANSWERS));
  const r = spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", file, "--dry-run"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  noSecret(r.stdout, "stdout");
  noSecret(r.stderr, "stderr");
  return r.stdout;
}

/** Plan, dry run, real run: the plan and the real run must agree; nothing leaks a value. */
function runAll(root) {
  const before = { s: read(root, SETTINGS), l: existsSync(join(root, LOCAL)) ? read(root, LOCAL) : null };
  const plan = planSetup(root, ANSWERS, { now: NOW });
  const lines = planLines(plan).join("\n");
  noSecret(lines, "plan lines");
  const out = dryRun(root);
  assert.equal(read(root, SETTINGS), before.s, "a dry run writes nothing");
  const { report } = generate(root, ANSWERS, { now: NOW });
  noSecret(JSON.stringify(report), "report");
  return { plan, lines, out, report, before };
}

for (const sameValue of [false, true]) {
  test(`RERUN-AC-12 a key in both env blocks (${sameValue ? "same" : "different"} value) keeps the local value`, () => {
    const root = gitRepo();
    const projectText = `${JSON.stringify({ env: { A: sameValue ? LOC : PROJ, B: OTHER } }, null, 2).replace(/\n/g, "\r\n")}\r\n`;
    put(root, SETTINGS, projectText);
    put(root, LOCAL, JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, env: { A: LOC, C: "l3" } }));
    const { plan, lines, out, report } = runAll(root);
    assert.deepEqual(json(root, LOCAL), { permissions: { allow: ["Bash(ls)"] }, env: { A: LOC, B: OTHER, C: "l3" } });
    assert.equal(json(root, SETTINGS).env, undefined);
    assert.ok(json(root, SETTINGS).hooks.SessionStart);
    const dest = plan.merges.settings.archivedTo;
    if (sameValue) {
      assert.equal(dest, null, "no differing key, nothing archived");
      assert.ok(!report.archived.some((a) => a.includes(SETTINGS)));
      assert.ok(!report.warnings.some((w) => w.includes("different values")));
      return;
    }
    assert.ok(dest.endsWith(SETTINGS), dest);
    assert.equal(read(root, dest), projectText, "archive is byte-identical to the project file");
    for (const text of [lines, out]) {
      assert.ok(text.includes(dest), "names the archive");
      assert.ok(text.includes("env values differ from .claude/settings.local.json"), text);
    }
    assert.ok(report.archived.some((a) => a.includes(SETTINGS) && a.includes(dest)));
    const warn = report.warnings.find((w) => w.includes("different values"));
    assert.ok(warn && warn.includes(dest) && warn.startsWith("1 env key(s)"), warn);
    assert.ok(ignored(root, dest), "the archive is git-ignored");
  });
}

for (const bad of ['"abc"', '["x"]', "5", "null", "true"]) {
  test(`RERUN-AC-13 settings.json env ${bad}: archived, nothing moves, local file untouched`, () => {
    const root = gitRepo();
    const projectText = `{ "env": ${bad}, "permissions": { "allow": [] } }`;
    const localText = JSON.stringify({ env: { A: LOC } });
    put(root, SETTINGS, projectText);
    put(root, LOCAL, localText);
    const { plan, lines, out, report } = runAll(root);
    const dest = plan.merges.settings.archivedTo;
    assert.equal(read(root, dest), projectText);
    assert.equal(read(root, LOCAL), localText, "local file byte-identical");
    const s = json(root, SETTINGS);
    assert.equal(Object.hasOwn(s, "env"), false);
    assert.ok(s.hooks.SessionStart && s.hooks.Stop);
    for (const text of [lines, out]) assert.ok(text.includes(dest) && text.includes("env is not a JSON object"), text);
    assert.ok(report.archived.some((a) => a.includes(SETTINGS) && a.includes(dest)));
    assert.ok(report.warnings.some((w) => w.includes(dest) && w.includes("nothing was moved")));
    assert.ok(!report.warnings.some((w) => w.includes("moved the env block")));
    assert.ok(ignored(root, dest));
  });
}

test("RERUN-AC-13 settings.json env a string with no local file: no index key, no local file written", () => {
  const root = gitRepo();
  put(root, SETTINGS, '{ "env": "abc" }');
  runAll(root);
  assert.ok(!existsSync(join(root, LOCAL)));
  assert.ok(!read(root, SETTINGS).includes('"0"'));
});

for (const bad of ['"abc"', "[]"]) {
  test(`RERUN-AC-13 local env ${bad}: the local file is archived, the new one is its other keys plus the moved block`, () => {
    const root = gitRepo();
    put(root, SETTINGS, JSON.stringify({ env: { A: PROJ } }));
    const localText = `{ "permissions": { "allow": ["Bash(ls)"] }, "env": ${bad} }`;
    put(root, LOCAL, localText);
    const { plan, lines, out, report } = runAll(root);
    const dest = plan.merges.settings.localArchivedTo;
    assert.equal(read(root, dest), localText, "archive is byte-identical");
    assert.deepEqual(json(root, LOCAL), { permissions: { allow: ["Bash(ls)"] }, env: { A: PROJ } });
    assert.ok(!read(root, LOCAL).includes('"0"'));
    assert.equal(plan.merges.settings.archivedTo, null, "settings.json is not archived");
    for (const text of [lines, out]) assert.ok(text.includes(dest) && text.includes("env is not a JSON object"), text);
    assert.ok(report.archived.some((a) => a.includes(LOCAL) && a.includes(dest)));
    assert.ok(report.warnings.some((w) => w.includes(dest) && w.includes(LOCAL)));
    assert.ok(ignored(root, dest));
  });
}

test("RERUN-AC-12 a collision takes the next free archive name when one exists", () => {
  const root = gitRepo();
  put(root, SETTINGS, JSON.stringify({ env: { A: PROJ } }));
  put(root, LOCAL, JSON.stringify({ env: { A: LOC } }));
  put(root, `${ARCHIVE}/${SETTINGS}`, "older");
  const { plan } = runAll(root);
  assert.equal(plan.merges.settings.archivedTo, `${ARCHIVE}/${SETTINGS}.1`);
  assert.equal(read(root, `${ARCHIVE}/${SETTINGS}`), "older", "an earlier archive is never overwritten");
  assert.deepEqual(json(root, `${ARCHIVE}/${SETTINGS}.1`), { env: { A: PROJ } });
});
