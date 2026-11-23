import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, fakeCtx, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const tm = await lib("testmode.mjs");
const { IS_WINDOWS } = await lib("run.mjs");
after(cleanup);

const CARD = { id: "T-M1-01", touch: ["src/**", "test/**"], scenarios: ["AUTH-AC-01"], criteria: ["npm test", "echo lint"] };
const TEST_SRC = 'test("AUTH-AC-01 signs in", () => {});\n';

/** A repo whose config has a full-suite command and (optionally) a targeted one, in the given mode. */
async function setup(mode, { testFiles = "run-tests {files}", card = CARD, extra = {} } = {}) {
  const commands = { test: "npm test", ...(testFiles === null ? {} : { testFiles }) };
  const made = await planRepo({ config: { stack: { packageManager: "none", commands }, workflow: { lanes: { code: 3, main: 1 } } }, cards: [card], ...extra });
  made.config.workflow.testMode = mode;
  made.config.workflow.testModeSource = "repo";
  return made;
}

test("helpers: full-suite match, mode table, targeted command quoting", () => {
  const config = { stack: { commands: { test: " npm test ", e2e: "", testFiles: "run-tests {files}" } }, workflow: { testMode: "targeted" } };
  assert.equal(tm.isFullSuite(config, "npm test"), true);
  assert.equal(tm.isFullSuite(config, "  npm test"), true);
  assert.equal(tm.isFullSuite(config, "npm run test:e2e"), false);
  assert.equal(tm.isFullSuite({ stack: { commands: { test: "", e2e: "" } } }, ""), false, "an empty command is never the full suite");
  assert.deepEqual([tm.defersAtVerify(config, false), tm.defersAtVerify(config, true)], [false, true]);
  assert.deepEqual(["every-card", "milestone"].map((m) => [tm.defersAtVerify({ workflow: { testMode: m } }, false), tm.defersAtVerify({ workflow: { testMode: m } }, true)]), [[false, false], [true, true]]);
  assert.equal(tm.defersAtVerify({ workflow: {} }, true), false, "no mode resolved → nothing deferred");
  const cmd = tm.targetedCommand(config, ["test/a b.test.js", "test/c.test.js"]);
  assert.equal(cmd, IS_WINDOWS ? 'run-tests "test/a b.test.js" test/c.test.js' : "run-tests 'test/a b.test.js' 'test/c.test.js'");
  assert.equal(tm.targetedCommand(config, []), null);
  assert.equal(tm.targetedCommand({ stack: { commands: {} } }, ["a.test.js"]), null, "testFiles unset (undefined) = no command");
  assert.equal(tm.targetedCommand({ stack: { commands: { testFiles: "  " } } }, ["a.test.js"]), null);
  assert.equal(tm.targetedCommand({ stack: { commands: { testFiles: "run-tests" } } }, ["a.test.js"]), null, "no {files} placeholder");
});

test("TMODE-AC-05 milestone mode: other criteria + one targeted run, the full suite is deferred and shown", async () => {
  const { root, config } = await setup("milestone");
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "test/auth.test.js", TEST_SRC);
  write(root, "src/a.js", "export const a = 1;\n");
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "done");
  const expected = IS_WINDOWS ? "run-tests test/auth.test.js" : "run-tests 'test/auth.test.js'";
  assert.deepEqual(ctx.ran, ["echo lint", expected]);
  assert.ok(!ctx.ran.includes("npm test"));
  assert.deepEqual(r.verified.testMode, { mode: "milestone", source: "repo" });
  assert.deepEqual(r.verified.deferred, ["npm test"]);
  assert.deepEqual(r.verified.targeted, { files: ["test/auth.test.js"] });
  assert.deepEqual(r.verified.commands.map((c) => c.cmd), ["echo lint", expected]);
  assert.match(readFileSync(join(root, "docs/plan/STATE.md"), "utf8"), /full suite deferred to gate/);
});

test("TMODE-AC-05 targeted files also include a test file that only holds the scenario id, not a changed one", async () => {
  const { root, config } = await setup("milestone", { extra: { files: { "test/old.test.js": TEST_SRC } } });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.js", "export const a = 1;\n");
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.deepEqual(r.verified.targeted, { files: ["test/old.test.js"] });
  assert.equal(r.status, "done");
});

test("TMODE-AC-06 milestone mode without a testFiles command (unset or empty): the full suite runs, fallback recorded", async () => {
  for (const testFiles of [null, ""]) {
    const { root, config } = await setup("milestone", { testFiles });
    const ctx = fakeCtx(root, config);
    task.startCard(ctx, "T-M1-01");
    write(root, "test/auth.test.js", TEST_SRC);
    const r = await task.verifyCard(ctx, "T-M1-01");
    assert.deepEqual(ctx.ran, ["npm test", "echo lint"], `testFiles ${JSON.stringify(testFiles)}`);
    assert.equal(r.verified.deferred, undefined);
    assert.match(r.verified.targeted.fallback, /testFiles/);
    assert.equal(r.verified.targeted.files, undefined);
    assert.equal(r.status, "done");
    assert.doesNotMatch(readFileSync(join(root, "docs/plan/STATE.md"), "utf8"), /full suite deferred to gate/);
  }
});

test("TMODE-AC-06 milestone mode with no targeted files: the full suite runs, fallback recorded", async () => {
  const { root, config } = await setup("milestone", { card: { ...CARD, scenarios: [] } });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.js", "export const a = 1;\n");
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.deepEqual(ctx.ran, ["npm test", "echo lint"]);
  assert.equal(r.verified.deferred, undefined);
  assert.match(r.verified.targeted.fallback, /no targeted test files/);
});

test("TMODE-AC-07 targeted mode: a lane card runs the targeted run, a main-folder card runs the full suite", async () => {
  const { root, config } = await setup("targeted", { card: { ...CARD, scenarios: [] } });
  const mainCtx = fakeCtx(root, config);
  task.startCard(mainCtx, "T-M1-01");
  write(root, "test/a.test.js", TEST_SRC);
  const main = await task.verifyCard(mainCtx, "T-M1-01");
  assert.deepEqual(mainCtx.ran, ["npm test", "echo lint"]);
  assert.equal(main.verified.deferred, undefined);
  assert.equal(main.verified.targeted, undefined);
  assert.deepEqual(main.verified.testMode, { mode: "targeted", source: "repo" });

  const lanes = await setup("targeted", { card: { ...CARD, scenarios: [] } });
  const ctx = fakeCtx(lanes.root, lanes.config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(lanes.root, ev.worktree);
  const laneCtx = fakeCtx(lane, lanes.config);
  write(lane, "test/a.test.js", TEST_SRC);
  const r = await task.verifyCard(laneCtx, "T-M1-01");
  assert.equal(r.status, "done");
  assert.deepEqual(laneCtx.ran, ["echo lint", IS_WINDOWS ? "run-tests test/a.test.js" : "run-tests 'test/a.test.js'"]);
  assert.deepEqual(r.verified.deferred, ["npm test"]);
  assert.deepEqual(r.verified.targeted, { files: ["test/a.test.js"] });
});

test("TMODE-AC-08 every-card mode: criteria run exactly as written, nothing deferred", async () => {
  const { root, config } = await setup("every-card");
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "test/auth.test.js", TEST_SRC);
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.deepEqual(ctx.ran, ["npm test", "echo lint"]);
  assert.equal("deferred" in r.verified, false);
  assert.equal("targeted" in r.verified, false);
  assert.deepEqual(r.verified.testMode, { mode: "every-card", source: "repo" });
});

test("TMODE-AC-05 a card with no full-suite command runs as written in every mode (rule 14)", async () => {
  const { root, config } = await setup("milestone", { card: { ...CARD, criteria: ["echo one", "echo two"] } });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "test/auth.test.js", TEST_SRC);
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.deepEqual(ctx.ran, ["echo one", "echo two"]);
  assert.equal("deferred" in r.verified, false);
});
