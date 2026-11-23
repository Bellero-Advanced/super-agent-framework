import assert from "node:assert/strict";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const tm = await lib("testmode.mjs");
after(cleanup);

const CARD = { id: "T-M1-01", touch: ["src/**", "test/**"], criteria: ["echo lint"] };
const MERGE_CHECKS = ["npm test", "echo secrets", "npm run test:e2e"];

/** A repo whose config has full-suite commands (test + e2e) and mergeChecks, in the given mode. */
async function setup(mode, { gates = [], cards = [CARD], mergeChecks = MERGE_CHECKS } = {}) {
  const commands = { test: "npm test", e2e: "npm run test:e2e" };
  const made = await planRepo({ config: { stack: { packageManager: "none", commands }, workflow: { lanes: { code: 3, main: 1 }, mergeChecks } }, cards, gates });
  made.config.workflow.testMode = mode;
  made.config.workflow.testModeSource = "repo";
  return made;
}

/** Open a lane card, change one file, verify it in the lane and commit — ready for task:merge. */
async function laneReady(root, config, id = "T-M1-01") {
  const ctx = fakeCtx(root, config);
  const ev = task.startCard(ctx, id, { worktree: true });
  const lane = join(root, ev.worktree);
  write(lane, "src/a.js", "export const a = 1;\n");
  const v = await task.verifyCard(fakeCtx(lane, config), id);
  assert.equal(v.status, "done");
  commitAll(lane, `${id} work`);
  return ctx;
}

test("helpers: mergeChecksFor and fullSuiteCommands follow the mode table", () => {
  const base = { stack: { commands: { test: "npm test", e2e: "npm run test:e2e", testFiles: "run {files}" } } };
  const cfg = (testMode) => ({ ...base, workflow: { testMode, mergeChecks: MERGE_CHECKS } });
  assert.deepEqual(tm.mergeChecksFor(cfg("milestone")), ["echo secrets"]);
  assert.deepEqual(tm.mergeChecksFor(cfg("targeted")), MERGE_CHECKS);
  assert.deepEqual(tm.mergeChecksFor(cfg("every-card")), MERGE_CHECKS);
  assert.deepEqual(tm.mergeChecksFor(cfg(undefined)), MERGE_CHECKS, "no mode resolved → nothing skipped");
  assert.deepEqual(tm.fullSuiteCommands(base), ["npm test", "npm run test:e2e"]);
  assert.deepEqual(tm.fullSuiteCommands({ stack: { commands: { test: "npm test", e2e: "npm test" } } }), ["npm test"]);
  assert.deepEqual(tm.fullSuiteCommands({ stack: { commands: { test: "", e2e: "" } } }), []);
});

test("TMODE-AC-09 milestone mode: task:merge skips the full suite, reports it and runs the other checks", async () => {
  const { root, config } = await setup("milestone");
  await laneReady(root, config);
  const logs = [];
  const mctx = fakeCtx(root, config, { log: (l) => logs.push(l) });
  const r = await task.mergeCard(mctx, "T-M1-01");
  assert.deepEqual(mctx.ran, ["echo secrets"]);
  assert.deepEqual(r.checks, ["echo secrets"]);
  assert.deepEqual(r.skipped, ["npm test", "npm run test:e2e"]);
  assert.ok(logs.some((l) => l.includes("skipped (full suite deferred to gate): npm test · npm run test:e2e")));
  assert.match(git(root, "log", "-1", "--format=%s"), /merge\(M1\): T-M1-01/);
});

test("TMODE-AC-09 targeted and every-card modes: task:merge runs every merge check, nothing skipped", async () => {
  for (const mode of ["targeted", "every-card"]) {
    const { root, config } = await setup(mode);
    await laneReady(root, config);
    const logs = [];
    const mctx = fakeCtx(root, config, { log: (l) => logs.push(l) });
    const r = await task.mergeCard(mctx, "T-M1-01");
    assert.deepEqual(mctx.ran, MERGE_CHECKS, mode);
    assert.deepEqual(r.skipped, []);
    assert.ok(!logs.some((l) => l.includes("skipped")));
  }
});

test("TMODE-AC-09 explicit opts.checks are used as given", async () => {
  const { root, config } = await setup("milestone");
  await laneReady(root, config);
  const mctx = fakeCtx(root, config);
  const r = await task.mergeCard(mctx, "T-M1-01", { checks: ["npm test"] });
  assert.deepEqual(mctx.ran, ["npm test"]);
  assert.deepEqual(r.skipped, []);
});

test("TMODE-AC-10 milestone mode, no gate runs the full suite: an extra full-suite gate runs it; evidence has testMode and deferredCards", async () => {
  const { root, config } = await setup("milestone", { gates: [{ id: "G1", text: "lint", run: ["echo lint"] }, { id: "G2", text: "manual" }], cards: [CARD, { id: "T-M1-02", criteria: ["true"] }] });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.js", "export const a = 1;\n");
  assert.equal((await task.verifyCard(ctx, "T-M1-01")).status, "done");
  commitAll(root, "card 1");
  ctx.ran.length = 0;
  const res = await task.verifyMilestone(ctx, "M1");
  assert.deepEqual(ctx.ran, ["echo lint", "npm test", "npm run test:e2e"]);
  assert.deepEqual(res.evidence.verified.gates.map((g) => g.id), ["G1", "G2", "full-suite"]);
  assert.equal(res.evidence.verified.gates[1].pass, null);
  assert.equal(res.evidence.verified.gates[2].pass, true);
  assert.deepEqual(res.evidence.verified.testMode, { mode: "milestone", source: "repo" });
  assert.deepEqual(res.evidence.verified.deferredCards, []);
});

test("TMODE-AC-10 deferredCards lists the milestone's cards whose evidence has deferred", async () => {
  const card = { ...CARD, criteria: ["npm test"], scenarios: ["AUTH-AC-01"] };
  const { root, config } = await setup("milestone", { cards: [card, { id: "T-M1-02", criteria: ["true"] }] });
  config.stack.commands.testFiles = "run-tests {files}";
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "test/auth.test.js", 'test("AUTH-AC-01 signs in", () => {});\n');
  const v = await task.verifyCard(ctx, "T-M1-01");
  assert.deepEqual(v.verified.deferred, ["npm test"]);
  const gctx = fakeCtx(root, config);
  const res = await task.verifyMilestone(gctx, "M1");
  assert.deepEqual(res.evidence.verified.deferredCards, ["T-M1-01"]);
  assert.deepEqual(gctx.ran, ["npm test", "npm run test:e2e"]);
});

test("TMODE-AC-10 no extra gate when a gate already runs a full-suite command, or in another mode", async () => {
  const gates = [{ id: "G1", text: "suite", run: ["npm test"] }];
  const a = await setup("milestone", { gates });
  const actx = fakeCtx(a.root, a.config);
  const ar = await task.verifyMilestone(actx, "M1");
  assert.deepEqual(ar.evidence.verified.gates.map((g) => g.id), ["G1"]);
  assert.deepEqual(actx.ran, ["npm test"]);
  for (const mode of ["targeted", "every-card"]) {
    const b = await setup(mode, { gates: [{ id: "G1", text: "lint", run: ["echo lint"] }] });
    const bctx = fakeCtx(b.root, b.config);
    const br = await task.verifyMilestone(bctx, "M1");
    assert.deepEqual(br.evidence.verified.gates.map((g) => g.id), ["G1"], mode);
    assert.deepEqual(bctx.ran, ["echo lint"]);
  }
});

test("TMODE-AC-10 the full-suite gate decides pass or fail like any gate", async () => {
  const { root, config } = await setup("milestone", { gates: [{ id: "G1", text: "lint", run: ["echo lint"] }] });
  config.stack.commands.test = "npm test FAIL";
  const res = await task.verifyMilestone(fakeCtx(root, config), "M1");
  const g = res.evidence.verified.gates.find((x) => x.id === "full-suite");
  assert.equal(g.pass, false);
  assert.equal(res.pass, false);
});
