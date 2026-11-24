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
    assert.ok(line.includes(`${LOCAL} not valid JSON, archived to ${dest}`), line);
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

test("RERUN-AC-08 a second archive takes the next free name", () => {
  const root = gitRepo();
  put(root, SETTINGS, withEnv());
  put(root, LOCAL, "{ nope");
  put(root, `${ARCHIVE}/${LOCAL}`, "older");
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.equal(plan.merges.settings.localArchivedTo, `${ARCHIVE}/${LOCAL}.1`);
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
