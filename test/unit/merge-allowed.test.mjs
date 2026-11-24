import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const { loadConfig } = await lib("config.mjs");
after(cleanup);

const readConfig = (dir) => JSON.parse(readFileSync(join(dir, "saf.config.json"), "utf8"));

/** A lane that added `gen/**` to workflow.alwaysAllowed, verified (pass) and committed, then re-committed gen/out.txt. */
async function verifiedLane() {
  const { root, config } = await planRepo({
    config: { workflow: { lanes: { code: 2, main: 1 } } },
    cards: [{ id: "T-M1-01", touch: ["src/**", "saf.config.json"] }],
  });
  const ctx = fakeCtx(root, config); // keeps the config from before the lane
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  const cfg = readConfig(lane);
  cfg.workflow = { ...cfg.workflow, alwaysAllowed: ["gen/**"] };
  write(lane, "saf.config.json", cfg);
  write(lane, "src/a.ts", "a\n");
  write(lane, "gen/out.txt", "one\n");
  const v = await task.verifyCard(fakeCtx(lane, loadConfig(lane)), "T-M1-01");
  assert.equal(v.status, "done");
  assert.ok(!v.verified.files.changed.includes("gen/out.txt"));
  commitAll(lane, "T-M1-01 work");
  write(lane, "gen/out.txt", "two\n");
  commitAll(lane, "regenerated");
  return { root, ctx, lane };
}

const refused = (e, ...names) => {
  assert.equal(e.exitCode, 3);
  assert.match(e.message, /changed after verification/);
  for (const n of names) assert.ok(e.message.includes(n), `${n} named`);
  return true;
};

test("MALLOW-AC-01 a lane that adds an always-allowed glob merges in one step", async () => {
  const { root, ctx } = await verifiedLane();
  await task.mergeCard(ctx, "T-M1-01", { checks: [] });
  assert.match(git(root, "log", "-1", "--format=%s"), /merge\(M1\): T-M1-01/);
  assert.ok(git(root, "ls-files").split("\n").includes("gen/out.txt"));
  assert.equal(readFileSync(join(root, "gen/out.txt"), "utf8"), "two\n");
  assert.deepEqual(readConfig(root).workflow.alwaysAllowed, ["gen/**"]);
});

test("MALLOW-AC-02 a file neither list allows still refuses the merge and the allowed one is not named", async () => {
  const { root, ctx, lane } = await verifiedLane();
  write(lane, "src/late.ts", "late\n");
  commitAll(lane, "late");
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: [] }), (e) => {
    refused(e, "src/late.ts");
    assert.ok(!e.message.includes("gen/out.txt"));
    return true;
  });
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("MALLOW-AC-03 guard: a config edited after verification cannot widen the check", async () => {
  const { ctx, lane } = await verifiedLane();
  const cfg = readConfig(lane);
  cfg.workflow.alwaysAllowed = ["gen/**", "src/**"];
  write(lane, "saf.config.json", cfg);
  write(lane, "src/late.ts", "late\n");
  commitAll(lane, "widen after verification");
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: [] }), (e) => refused(e, "saf.config.json", "src/late.ts"));
});
