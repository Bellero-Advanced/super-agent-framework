import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanup, fakeCtx, lib, planRepo } from "../helpers.mjs";

const task = await lib("task.mjs");
const tm = await lib("testmode.mjs");
const { loadPlan } = await lib("plan.mjs");
after(cleanup);

const COMMANDS = { test: "npm test", e2e: "npm run test:e2e" };

async function setup(mode, gates) {
  const made = await planRepo({ config: { stack: { packageManager: "none", commands: COMMANDS } }, cards: [{ id: "T-M1-01", criteria: ["true"] }], gates });
  made.config.workflow.testMode = mode;
  made.config.workflow.testModeSource = "repo";
  return made;
}

test("TMODE-AC-14 milestone mode: the extra gate holds only the full-suite commands no declared gate runs", async () => {
  const { root, config } = await setup("milestone", [{ id: "G1", text: "unit", run: ["npm test"] }]);
  const ctx = fakeCtx(root, config);
  const res = await task.verifyMilestone(ctx, "M1");
  assert.deepEqual(res.evidence.verified.gates.map((g) => g.id), ["G1", "full-suite"]);
  assert.deepEqual(ctx.ran, ["npm test", "npm run test:e2e"]);
  assert.deepEqual(ctx.ran.filter((c) => c === "npm test"), ["npm test"], "npm test ran once");
  assert.deepEqual(tm.gatesWithFullSuite(config, [{ id: "G1", text: "unit", run: ["npm test"] }])[1].run, ["npm run test:e2e"]);
});

test("TMODE-AC-14 gates that run both full-suite commands get no extra gate", async () => {
  const { root, config } = await setup("milestone", [{ id: "G1", text: "unit", run: ["npm test"] }, { id: "G2", text: "e2e", run: ["npm run test:e2e"] }]);
  const ctx = fakeCtx(root, config);
  const res = await task.verifyMilestone(ctx, "M1");
  assert.deepEqual(res.evidence.verified.gates.map((g) => g.id), ["G1", "G2"]);
  assert.deepEqual(ctx.ran, ["npm test", "npm run test:e2e"]);
});

test("TMODE-AC-14 a gate command with extra spaces around npm test still covers it", () => {
  const { config } = { config: { workflow: { testMode: "milestone" }, stack: { commands: COMMANDS } } };
  const out = tm.gatesWithFullSuite(config, [{ id: "G1", text: "unit", run: ["  npm test  "] }]);
  assert.deepEqual(out.map((g) => g.id), ["G1", "full-suite"]);
  assert.deepEqual(out[1].run, ["npm run test:e2e"]);
  assert.equal(out[1].text, tm.FULL_SUITE_GATE.text);
});

test("TMODE-AC-14 other modes add no gate", () => {
  const gates = [{ id: "G1", text: "lint", run: ["echo lint"] }];
  for (const mode of ["targeted", "every-card"]) assert.equal(tm.gatesWithFullSuite({ workflow: { testMode: mode }, stack: { commands: COMMANDS } }, gates), gates);
});

test("TMODE-AC-15 a milestone gate with the id full-suite is a plan issue in every mode", async () => {
  for (const mode of ["every-card", "targeted", "milestone"]) {
    const { root, config } = await setup(mode, [{ id: "full-suite", text: "mine", run: ["npm test"] }]);
    const plan = loadPlan(root, config);
    const issue = plan.issues.find((i) => i.includes('gate id "full-suite" is reserved'));
    assert.ok(issue, mode);
    assert.ok(issue.startsWith("docs/plan/milestones/M1.md:"), issue);
  }
});

test("TMODE-AC-15 task:verify <M> refuses before any command runs", async () => {
  const { root, config } = await setup("milestone", [{ id: "full-suite", text: "mine", run: ["npm test"] }]);
  const ctx = fakeCtx(root, config);
  await assert.rejects(task.verifyMilestone(ctx, "M1"), /full-suite/);
  assert.deepEqual(ctx.ran, []);
});
