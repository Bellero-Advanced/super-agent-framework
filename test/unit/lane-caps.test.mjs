import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, fakeCtx, gitRepo, lib, planRepo, tmp, write } from "../helpers.mjs";

/** Lane caps (docs/specs/lane-caps.md): high ceiling, per-machine caps in saf.config.local.json, port check. */
const { loadConfig, ConfigError, validateConfig, loadSchema, LANE_CEILING, MAX_PORT, LOCAL_CONFIG_FILE } = await lib("config.mjs");
const { generate } = await lib("generate.mjs");
const { loadPlan, activeMilestone } = await lib("plan.mjs");
const { pickParallel } = await lib("parallel.mjs");
const task = await lib("task.mjs");
after(cleanup);

const project = (repo = {}, local) => {
  const root = tmp();
  write(root, "saf.config.json", { version: 1, ...repo });
  if (local !== undefined) write(root, LOCAL_CONFIG_FILE, local);
  return root;
};
const wf = (w) => ({ workflow: w });
const fails = (root, ...needles) => assert.throws(() => loadConfig(root, {}), (e) => e instanceof ConfigError && needles.every((n) => e.message.includes(n)), needles.join(" + "));

test("LCAP-AC-01 the schema maxima equal LANE_CEILING; ceiling validates, ceiling + 1 names the key; lanes.main stays 1", () => {
  const w = loadSchema().properties.workflow.properties;
  assert.equal(LANE_CEILING, 32);
  assert.equal(w.lanes.properties.code.maximum, LANE_CEILING);
  assert.equal(w.sideLanes.properties.max.maximum, LANE_CEILING);
  assert.ok(LANE_CEILING > 9);
  assert.deepEqual(validateConfig({ version: 1, ...wf({ lanes: { code: LANE_CEILING }, sideLanes: { max: LANE_CEILING } }) }), []);
  assert.ok(validateConfig({ version: 1, ...wf({ lanes: { code: LANE_CEILING + 1 } }) }).some((e) => e.includes("workflow.lanes.code")));
  assert.ok(validateConfig({ version: 1, ...wf({ sideLanes: { max: LANE_CEILING + 1 } }) }).some((e) => e.includes("workflow.sideLanes.max")));
  assert.ok(validateConfig({ version: 1, ...wf({ lanes: { main: 2 } }) }).some((e) => e.includes("workflow.lanes.main")));
});

/** Ten non-overlapping code cards; M2 side cards S1, S2 when `side`. */
const manyCards = (config) =>
  planRepo({
    config,
    cards: [...Array.from({ length: 10 }, (_, i) => ({ id: `T-M1-${String(i + 1).padStart(2, "0")}`, touch: [`d${i}/**`] })), { id: "T-M2-01", touch: ["s1/**"] }, { id: "T-M2-02", touch: ["s2/**"] }],
    extra: [{ id: "M2", status: "planned", cards: ["T-M2-01", "T-M2-02"], sideCards: ["T-M2-01", "T-M2-02"] }],
  });
const reasons = (root, config) => {
  const p = loadPlan(root, config);
  return pickParallel(p, activeMilestone(p));
};

test("LCAP-AC-02 caps come from the local file, localKeys lists them, and the full-lane reasons name this machine only then", async () => {
  const repo = wf({ lanes: { code: 3 }, sideLanes: { max: 1 } });
  const r = await manyCards(repo);
  const base = loadConfig(r.root, {});
  assert.deepEqual([base.workflow.lanes.code, base.workflow.sideLanes.max, base.workflow.localKeys], [3, 1, []]);
  const without = reasons(r.root, base);
  assert.equal(without.parallel.code.length, 3);
  assert.ok(without.skipped.some((s) => /code lane is full/.test(s.reason)));
  assert.ok(without.skipped.every((s) => !s.reason.includes("this machine")));

  write(r.root, LOCAL_CONFIG_FILE, wf({ lanes: { code: 8 }, sideLanes: { max: 4 } }));
  const local = loadConfig(r.root, {});
  assert.deepEqual([local.workflow.lanes.code, local.workflow.sideLanes.max], [8, 4]);
  assert.deepEqual(local.workflow.localKeys, ["workflow.lanes.code", "workflow.sideLanes.max"]);
  const withLocal = reasons(r.root, local);
  assert.equal(withLocal.parallel.code.length, 8);
  const full = withLocal.skipped.find((s) => /code lane is full/.test(s.reason));
  assert.ok(full.reason.endsWith(`(this machine: ${LOCAL_CONFIG_FILE})`), full.reason);

  // side cap from the local file: M1 has one card, two side cards, side max 1 -> the second side card waits
  const s = await planRepo({
    config: wf({ lanes: { code: 5 }, sideLanes: { max: 3 } }),
    cards: [{ id: "T-M1-01", touch: ["a/**"] }, { id: "T-M2-01", touch: ["s1/**"] }, { id: "T-M2-02", touch: ["s2/**"] }],
    extra: [{ id: "M2", status: "planned", cards: ["T-M2-01", "T-M2-02"], sideCards: ["T-M2-01", "T-M2-02"] }],
  });
  write(s.root, LOCAL_CONFIG_FILE, wf({ sideLanes: { max: 1 } }));
  const sl = loadConfig(s.root, {});
  const sideFull = reasons(s.root, sl).skipped.find((x) => /side lanes are full/.test(x.reason));
  assert.ok(sideFull.reason.endsWith(`(this machine: ${LOCAL_CONFIG_FILE})`), sideFull.reason);
  assert.equal(sl.workflow.lanes.code, 5, "a key the local file does not set keeps the repo value");
});

test("LCAP-AC-02 task:start's own side-lane refusal carries the machine suffix inside its parentheses only when the cap came from the local file", async () => {
  const cards = [{ id: "T-M1-01", touch: ["a/**"] }, { id: "T-M2-01", touch: ["s1/**"] }, { id: "T-M2-02", touch: ["s2/**"] }];
  const extra = [{ id: "M2", status: "planned", cards: ["T-M2-01", "T-M2-02"], sideCards: ["T-M2-01", "T-M2-02"] }];
  const refusal = async (local) => {
    const r = await planRepo({ config: wf({ lanes: { code: 5 }, sideLanes: { max: 1 } }), cards, extra });
    if (local) write(r.root, LOCAL_CONFIG_FILE, wf({ sideLanes: { max: 1 } }));
    const ctx = fakeCtx(r.root, loadConfig(r.root, {}));
    task.startCard(ctx, "T-M2-01", { worktree: true });
    try { task.startCard(ctx, "T-M2-02", { worktree: true }); } catch (e) { return e.message; }
    return assert.fail("the second side card must be refused");
  };
  assert.ok((await refusal(true)).includes(`side lanes are full (1 at a time, this machine: ${LOCAL_CONFIG_FILE}): T-M2-01`));
  const repoCap = await refusal(false);
  assert.ok(repoCap.includes("side lanes are full (1 at a time): T-M2-01") && !repoCap.includes("this machine"), repoCap);
});

test("LCAP-AC-03 lanes.main and sideLanes.enabled are not local keys; bad values name key and file; SAF_LANES changes nothing", () => {
  fails(project({}, wf({ lanes: { main: 1 } })), "workflow.lanes.main", LOCAL_CONFIG_FILE);
  fails(project({}, wf({ sideLanes: { enabled: false } })), "workflow.sideLanes.enabled", LOCAL_CONFIG_FILE);
  fails(project({}, wf({ lanes: { code: LANE_CEILING + 1 } })), "workflow.lanes.code", LOCAL_CONFIG_FILE);
  fails(project({}, wf({ lanes: { code: "x" } })), "workflow.lanes.code", LOCAL_CONFIG_FILE);
  fails(project({}, wf({ sideLanes: { max: 0 } })), "workflow.sideLanes.max", LOCAL_CONFIG_FILE);
  for (const bad of [true, 2.5]) {
    fails(project({}, wf({ lanes: { code: bad } })), "workflow.lanes.code", LOCAL_CONFIG_FILE);
    fails(project({}, wf({ sideLanes: { max: bad } })), "workflow.sideLanes.max", LOCAL_CONFIG_FILE);
  }
  const ok = project(wf({ lanes: { code: 2 } }));
  const c = loadConfig(ok, { SAF_LANES: "8", SAF_LANES_CODE: "8" });
  assert.deepEqual([c.workflow.lanes.code, c.workflow.localKeys], [2, []]);
  // lanes.code 0 locally = every card in the main folder on this machine
  assert.equal(loadConfig(project(wf({ lanes: { code: 3 } }), wf({ lanes: { code: 0 } })), {}).workflow.lanes.code, 0);
});

test("LCAP-AC-04 a lane port above MAX_PORT is an error naming the three keys and the file the code cap came from", () => {
  assert.equal(MAX_PORT, 65535);
  const ports = { base: 65000, step: 200, env: ["PORT"] };
  fails(project(wf({ lanes: { code: 3 }, lanePorts: ports })), "workflow.lanes.code", "workflow.lanePorts.base", "workflow.lanePorts.step", "saf.config.json");
  const e = (() => { try { loadConfig(project(wf({ lanes: { code: 1 }, lanePorts: ports }), wf({ lanes: { code: 8 } })), {}); } catch (x) { return x; } })();
  assert.ok(e instanceof ConfigError && e.message.includes(LOCAL_CONFIG_FILE) && e.message.includes("workflow.lanePorts.step"), String(e?.message));
  assert.equal(loadConfig(project(wf({ lanes: { code: 3 }, lanePorts: { ...ports, env: [] } })), {}).workflow.lanes.code, 3, "env: [] skips the check");
  assert.equal(loadConfig(project(wf({ lanes: { code: 3 }, worktrees: false, lanePorts: ports })), {}).workflow.lanes.code, 3, "worktrees off skips the check");
  assert.equal(loadConfig(project(wf({ lanes: { code: 0 }, lanePorts: ports })), {}).workflow.lanes.code, 0, "lanes.code 0 skips the check");
  // caps set locally while the feature they belong to is off: accepted and recorded, nothing else changes
  const off = loadConfig(project(wf({ worktrees: false, sideLanes: { enabled: false } }), wf({ lanes: { code: 6 }, sideLanes: { max: 6 } })), {});
  assert.deepEqual([off.workflow.worktrees, off.workflow.sideLanes.enabled, off.workflow.sideLanes.max, off.workflow.localKeys], [false, false, 6, ["workflow.lanes.code", "workflow.sideLanes.max"]]);
});

test("LCAP-AC-05 generated files are byte-equal with and without a local file that sets both caps", () => {
  const answers = { project: { name: "Demo", type: "api" }, stack: { packageManager: "npm", commands: { test: "npm test" } }, workflow: { lanes: { code: 2 }, sideLanes: { max: 1 } } };
  const now = new Date("2026-01-02T00:00:00Z");
  const a = gitRepo();
  const b = gitRepo();
  write(b, LOCAL_CONFIG_FILE, wf({ lanes: { code: 9 }, sideLanes: { max: 7 } }));
  generate(a, answers, { now });
  generate(b, answers, { now });
  const files = (r) => JSON.parse(readFileSync(join(r, ".saf", "manifest.json"), "utf8")).files;
  assert.deepEqual(files(a), files(b));
  const rel = Object.keys(files(a));
  assert.ok(rel.length > 5 && rel.includes("docs/plan/README.md"));
  for (const f of rel) assert.equal(readFileSync(join(a, f), "utf8"), readFileSync(join(b, f), "utf8"), f);
  const readme = readFileSync(join(b, "docs", "plan", "README.md"), "utf8");
  assert.ok(readme.includes("caps: code 2 · main 1") && readme.includes("at most 1 side card(s)"), "the README shows the repo caps");
  assert.ok(!readme.includes("caps: code 9") && !readme.includes("at most 7 side card(s)"), "the README never shows the local caps");
  assert.deepEqual(JSON.parse(readFileSync(join(b, "saf.config.json"), "utf8")).workflow.lanes, { code: 2, main: 1 });
  assert.equal(JSON.parse(readFileSync(join(b, "saf.config.json"), "utf8")).workflow.sideLanes.max, 1);
});
