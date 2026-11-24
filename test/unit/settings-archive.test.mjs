import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { cleanup, gitRepo, lib } from "../helpers.mjs";

const { ARCHIVE, generate, planLines, planSetup } = await lib("generate.mjs");
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const NOW = new Date("2026-01-02T03:04:05Z");
const SETTINGS = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";
const SECRET = "sk-test-not-a-real-secret-123";
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const lf = (s) => s.replace(/\r\n/g, "\n");
const read = (root, rel) => lf(readFileSync(join(root, rel), "utf8"));
const withEnv = () => JSON.stringify({ env: { API_KEY: SECRET }, permissions: { allow: ["Bash(ls)"] } });

for (const bad of ["{ nope", "[]", "null"]) {
  test(`RERUN-AC-08 an unreadable settings.local.json (${bad}) is archived, never overwritten`, () => {
    const root = gitRepo();
    put(root, SETTINGS, withEnv());
    put(root, LOCAL, bad);
    const plan = planSetup(root, ANSWERS, { now: NOW });
    const dest = plan.merges.settings.localArchivedTo;
    assert.equal(dest, `${ARCHIVE}/${LOCAL}`, "the plan names the archive target");
    const line = planLines(plan).find((l) => l.includes(`${SETTINGS}:`));
    const reason = bad === "{ nope" ? "not valid JSON" : "root is not a JSON object";
    assert.ok(line.includes(`${LOCAL} ${reason}, archived to ${dest}`), line);
    assert.ok(!planLines(plan).join("\n").includes(SECRET), "no env value in the dry run");
    assert.equal(read(root, LOCAL), bad, "a dry run writes nothing");

    const { report } = generate(root, ANSWERS, { now: NOW });
    assert.equal(read(root, dest), bad, "archive is byte-identical to the old local file");
    assert.deepEqual(JSON.parse(read(root, LOCAL)), { env: { API_KEY: SECRET } });
    assert.ok(report.archived.some((a) => a.includes(LOCAL) && a.includes(dest)));
    assert.ok(report.warnings.some((w) => w.includes(LOCAL) && w.includes(dest)));
    assert.ok(![...report.warnings, ...report.archived].join("\n").includes(SECRET), "no value printed");
    assert.ok(!JSON.parse(read(root, SETTINGS)).env, "env left settings.json");
    const ignored = spawnSync("git", ["check-ignore", "-q", dest], { cwd: root });
    assert.equal(ignored.status, 0, "the archived path is git-ignored");
    assert.equal(spawnSync("git", ["check-ignore", "-q", `${dest}.2`], { cwd: root }).status, 0);
  });
}

test("RERUN-AC-08 a second archive takes the next free name — in the plan and after a real run, which the ignore rule also covers", () => {
  const root = gitRepo();
  put(root, SETTINGS, withEnv());
  put(root, LOCAL, "{ nope");
  put(root, `${ARCHIVE}/${LOCAL}`, "older");
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.equal(plan.merges.settings.localArchivedTo, `${ARCHIVE}/${LOCAL}.1`);
  const { report } = generate(root, ANSWERS, { now: NOW });
  assert.equal(read(root, `${ARCHIVE}/${LOCAL}`), "older", "the older archive is not overwritten");
  assert.equal(read(root, `${ARCHIVE}/${LOCAL}.1`), "{ nope", "the new archive is the old local file, byte for byte");
  assert.deepEqual(JSON.parse(read(root, LOCAL)), { env: { API_KEY: SECRET } });
  assert.ok(report.archived.some((a) => a.includes(LOCAL) && a.endsWith(`${ARCHIVE}/${LOCAL}.1`)));
  assert.ok(report.warnings.some((w) => w.includes(LOCAL) && w.includes(`${LOCAL}.1`)));
  assert.equal(spawnSync("git", ["check-ignore", "-q", `${ARCHIVE}/${LOCAL}.1`], { cwd: root }).status, 0, "the .1 archive is git-ignored");
});

test("RERUN-AC-09 no env block: an invalid local file stays byte-identical and is not archived", () => {
  const root = gitRepo();
  put(root, SETTINGS, JSON.stringify({ permissions: {} }));
  put(root, LOCAL, "{ nope");
  const { report } = generate(root, ANSWERS, { now: NOW });
  assert.equal(read(root, LOCAL), "{ nope");
  assert.ok(!existsSync(join(root, ARCHIVE, LOCAL)));
  assert.ok(!report.archived.some((a) => a.includes(LOCAL)));
});

test("RERUN-AC-09 a settings.json holding [] is archived and replaced by an object with the SAF hooks", () => {
  const root = gitRepo();
  put(root, SETTINGS, "[]");
  const plan = planSetup(root, ANSWERS, { now: NOW });
  const dest = plan.merges.settings.archivedTo;
  assert.equal(dest, `${ARCHIVE}/${SETTINGS}`);
  assert.ok(planLines(plan).some((l) => l.includes(`archived to ${dest}`)));
  const { report } = generate(root, ANSWERS, { now: NOW });
  assert.equal(read(root, dest), "[]");
  assert.ok(report.archived.some((a) => a.includes(dest)));
  const now = JSON.parse(read(root, SETTINGS));
  assert.ok(now.hooks.SessionStart && now.hooks.Stop);
});

for (const [what, body] of [["null", "null"], ["a string", '"hello"'], ["a number", "42"], ["a boolean", "true"]]) {
  test(`RERUN-AC-09 a settings.json whose root is ${what} is archived and replaced by an object with the SAF hooks`, () => {
    const root = gitRepo();
    put(root, SETTINGS, body);
    const plan = planSetup(root, ANSWERS, { now: NOW });
    const dest = plan.merges.settings.archivedTo;
    assert.equal(dest, `${ARCHIVE}/${SETTINGS}`);
    assert.ok(planLines(plan).some((l) => l.includes(`root is not a JSON object, archived to ${dest}`)), planLines(plan).join("\n"));
    assert.equal(read(root, SETTINGS), body, "a dry run writes nothing");
    const { report } = generate(root, ANSWERS, { now: NOW });
    assert.equal(read(root, dest), body, "archive is byte-identical");
    assert.ok(report.archived.some((a) => a.includes(dest)));
    assert.ok(report.warnings.some((w) => w.includes(SETTINGS) && w.includes(dest)));
    const now = JSON.parse(read(root, SETTINGS));
    assert.ok(now.hooks.SessionStart && now.hooks.Stop);
    assert.ok(!("env" in now));
  });
}

test("RERUN-AC-09 both settings files unreadable: settings.json is archived and replaced, the unreadable local file stays byte-identical and is not archived", () => {
  const root = gitRepo();
  put(root, SETTINGS, "{ nope");
  put(root, LOCAL, "{ also nope");
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.equal(plan.merges.settings.archivedTo, `${ARCHIVE}/${SETTINGS}`);
  assert.equal(plan.merges.settings.localArchivedTo, null, "no env to move, so the local file is not in play");
  const { report } = generate(root, ANSWERS, { now: NOW });
  assert.equal(read(root, `${ARCHIVE}/${SETTINGS}`), "{ nope");
  assert.equal(read(root, LOCAL), "{ also nope", "local file untouched");
  assert.ok(!existsSync(join(root, ARCHIVE, LOCAL)));
  assert.ok(!report.archived.some((a) => a.includes(LOCAL)));
  const now = JSON.parse(read(root, SETTINGS));
  assert.ok(now.hooks.SessionStart && now.hooks.Stop);
});

test("RERUN-AC-08 an archived unreadable settings.json (and its .2 suffix) is git-ignored too", () => {
  const root = gitRepo();
  put(root, SETTINGS, `{ "env": { "API_KEY": "${SECRET}" }, }`);
  generate(root, ANSWERS, { now: NOW });
  const dest = `${ARCHIVE}/${SETTINGS}`;
  assert.ok(existsSync(join(root, dest)), "the unreadable settings.json was archived");
  for (const p of [dest, `${dest}.2`]) assert.equal(spawnSync("git", ["check-ignore", "-q", p], { cwd: root }).status, 0, p);
});
