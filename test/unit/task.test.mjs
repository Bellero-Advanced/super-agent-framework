import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, lib, planRepo, tmp, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const { samePath, topLevel } = await lib("git.mjs");
const { loadPlan, cardStatus } = await lib("plan.mjs");
after(cleanup);

const status = (ctx, id) => cardStatus(loadPlan(ctx.root, ctx.config), id);

test("card loop: start → verify passes only with files inside touch", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch: ["src/**"], dontTouch: ["src/secret/**"], criteria: ["echo ok"] }] });
  const ctx = fakeCtx(root, config);
  write(root, "notes.txt", "dirty before start\n"); // pre-existing change is not the card's
  const ev = task.startCard(ctx, "T-M1-01");
  assert.equal(ev.status, "in_progress");
  assert.equal(status(ctx, "T-M1-01"), "in_progress");
  write(root, "src/a.ts", "export const a = 1;\n");
  let r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "done");
  assert.deepEqual(r.verified.files.changed, ["src/a.ts"]);
  assert.deepEqual(ctx.ran, ["echo ok"]);
  assert.deepEqual(task.stateCheck(ctx).stale, []);
  assert.throws(() => task.startCard(ctx, "T-M1-01"), /already passed/);

  task.startCard(ctx, "T-M1-01", { restart: true });
  write(root, "other/b.ts", "x\n");
  write(root, "src/secret/k.ts", "x\n");
  r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "failed");
  assert.deepEqual(r.verified.files.outside, ["other/b.ts"]);
  assert.deepEqual(r.verified.files.forbidden, ["src/secret/k.ts"]);
});

test("verify fails on a failing command and on a scenario without a test", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", criteria: ["run FAIL"] }, { id: "T-M1-02", scenarios: ["AUTH-AC-01"], touch: ["src/**", "test/**"] }] });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-01");
  let r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "failed");
  assert.equal(r.failures.length, 1);
  task.abandonCard(ctx, "T-M1-01");
  assert.equal(status(ctx, "T-M1-01"), "todo");

  task.startCard(ctx, "T-M1-02");
  r = await task.verifyCard(ctx, "T-M1-02");
  assert.deepEqual(r.verified.scenarios.missing, ["AUTH-AC-01"]);
  write(root, "test/auth.test.js", 'test("AUTH-AC-01 signs in", () => {});\n');
  task.startCard(ctx, "T-M1-02", { restart: true });
  r = await task.verifyCard(ctx, "T-M1-02");
  assert.equal(r.status, "done");
});

test("start refuses: inactive milestone, unmet depends, a second main-folder card", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch: ["a/**"] }, { id: "T-M1-02", depends: ["T-M1-01"], touch: ["b/**"] }, { id: "T-M1-03", touch: ["c/**"] }] });
  const ctx = fakeCtx(root, config);
  assert.throws(() => task.startCard(ctx, "T-M1-02"), /waits for T-M1-01/);
  task.startCard(ctx, "T-M1-01");
  assert.throws(() => task.startCard(ctx, "T-M1-03"), /one folder works one card at a time/);
  write(root, "docs/plan/milestones/M1.md", readFileSync(join(root, "docs/plan/milestones/M1.md"), "utf8").replace("status: active", "status: planned"));
  task.abandonCard(ctx, "T-M1-01");
  assert.throws(() => task.startCard(ctx, "T-M1-01"), /not status: active/);
});

test("milestone gates: commands run, manual gates stay open, open cards block", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01" }], gates: [{ id: "auto", text: "checks", run: ["echo ok"] }, { id: "owner", text: "approve" }] });
  const ctx = fakeCtx(root, config);
  let r = await task.verifyMilestone(ctx, "M1");
  assert.equal(r.pass, false);
  assert.deepEqual(r.openCards.map((c) => c.id ?? c), ["T-M1-01"]);
  task.startCard(ctx, "T-M1-01");
  await task.verifyCard(ctx, "T-M1-01");
  r = await task.verifyMilestone(ctx, "M1");
  assert.equal(r.pass, true);
  assert.deepEqual(r.evidence.verified.gates.map((g) => g.pass), [true, null]);
});

test("lanes: start --worktree → verify in lane → merge; conflicts and failed checks roll back", async () => {
  const { root, config } = await planRepo({
    config: { workflow: { lanes: { code: 3, main: 1 } } },
    cards: [
      { id: "T-M1-01", touch: ["src/a/**"] },
      { id: "T-M1-02", touch: ["src/b/**"] },
      { id: "T-M1-03", touch: ["src/c/**"] },
    ],
    files: { "src/c/x.ts": "base\n" },
  });
  const ctx = fakeCtx(root, config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  assert.equal(ev.lane, 1);
  const lane = join(root, ev.worktree);
  assert.ok(existsSync(join(lane, task.LANE_FILE)));
  assert.match(git(root, "log", "-1", "--format=%s"), /start T-M1-01 lane 1/);
  assert.deepEqual(task.laneEnvLines(config, 1, { SHELL: "/bin/bash" }, "linux").slice(0, 2), ["export SAF_LANE=1", "export PORT=3010"]);
  assert.deepEqual(task.laneEnvLines(config, 1, { SHELL: "/usr/bin/bash" }, "win32").slice(0, 2), ["export SAF_LANE=1", "export PORT=3010"], "Git Bash");
  assert.deepEqual(task.laneEnvLines(config, 1, {}, "win32").slice(0, 2), ['$env:SAF_LANE = "1"', '$env:PORT = "3010"'], "PowerShell");

  // merging before the lane passed is refused (exit 3)
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: [] }), (e) => e.exitCode === 3);

  const laneCtx = fakeCtx(lane, config);
  assert.throws(() => task.startCard(laneCtx, "T-M1-02"), /lane/);
  write(lane, "src/a/one.ts", "1\n");
  const v = await task.verifyCard(laneCtx, "T-M1-01");
  assert.equal(v.status, "done");
  commitAll(lane, "T-M1-01 work");

  // failing merge check → exit 5, nothing committed
  const head = git(root, "rev-parse", "HEAD");
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: ["check FAIL"] }), (e) => e.exitCode === 5);
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "status", "--porcelain"), "");

  const m = await task.mergeCard(ctx, "T-M1-01", { checks: ["echo merged"] });
  assert.match(git(root, "log", "-1", "--format=%s"), /merge\(M1\): T-M1-01/);
  assert.equal(status(ctx, "T-M1-01"), "done");
  assert.ok(!existsSync(lane));
  assert.ok(m.next);

  // conflict: lane edits a file main also edits → exit 4, rolled back
  const ev3 = task.startCard(ctx, "T-M1-03", { worktree: true });
  const lane3 = join(root, ev3.worktree);
  write(lane3, "src/c/x.ts", "lane\n");
  await task.verifyCard(fakeCtx(lane3, config), "T-M1-03");
  commitAll(lane3, "lane edit");
  writeFileSync(join(root, "src/c/x.ts"), "main\n");
  commitAll(root, "main edit");
  await assert.rejects(task.mergeCard(ctx, "T-M1-03", { checks: [] }), (e) => e.exitCode === 4);
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("lane start step 5 failure exits 6 and --resume finishes it", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch: ["src/**"] }] });
  const ctx = fakeCtx(root, config, { install: "install-deps", runSync: () => 1 });
  assert.throws(() => task.startCard(ctx, "T-M1-01", { worktree: true }), (e) => e instanceof task.StartIncomplete && e.exitCode === 6);
  const ok = fakeCtx(root, config, { install: "install-deps", runSync: () => 0 });
  const ev = task.startCard(ok, "T-M1-01", { worktree: true, resume: true });
  assert.equal(ev.lane, 1);
});

test("hooks: session-start text, stop guidance, probe judging", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", title: "login" }] });
  const ctx = fakeCtx(root, config);
  assert.match(task.sessionStartText(ctx), /next: T-M1-01 login/);
  task.startCard(ctx, "T-M1-01");
  assert.match(task.sessionStartText(ctx), /card in progress: T-M1-01 login/);
  assert.ok(task.checkStop(ctx, {}, {}));
  assert.equal(task.checkStop(ctx, {}, { SAF_STOP_HOOK: "off" }), null);
  const t = { milestone: "M1", done: 0, total: 1, cards: [{ id: "T-M1-01", title: "login" }] };
  assert.ok(task.judgeProbe(t, "M1 done 0/1 · T-M1-01 login"));
  assert.ok(!task.judgeProbe(t, "unknown"));
  assert.ok(!task.judgeProbe(t, "M1 done 1/1 · T-M1-01"));
  assert.ok(task.judgeProbe({ ...t, cards: [] }, "M1 done 0/1 · none"));
});

const lines = (n) => `${Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")}\n`;

test("size: a card under the cap reports counts and no warning", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", size: "S", touch: ["src/**", "test/**"] }] });
  const ctx = fakeCtx(root, config, { logged: [] });
  ctx.log = (s) => ctx.logged.push(s);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.js", lines(10));
  write(root, "test/a.test.js", lines(4));
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "done");
  assert.deepEqual(r.verified.size, { size: "S", code: { lines: 10, cap: config.workflow.sizes.S }, test: { lines: 4, cap: config.workflow.testCaps.S }, over: [] });
  assert.ok(!ctx.logged.some((l) => /over the size cap/.test(l)));
});

test("size: over the cap warns in the output and the evidence but still passes", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", size: "S", touch: ["src/**", "test/**"] }] });
  config.workflow.sizes.S = 5; // caps come from the config
  const ctx = fakeCtx(root, config, { logged: [] });
  ctx.log = (s) => ctx.logged.push(s);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.js", lines(6));
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "done");
  assert.deepEqual(r.verified.size.over, ["code"]);
  assert.equal(r.verified.size.code.lines, 6);
  assert.ok(ctx.logged.some((l) => /over the size cap/.test(l) && /code 6 > 5/.test(l)));
  assert.equal(JSON.parse(readFileSync(join(root, task.evidencePath("T-M1-01")), "utf8")).verified.size.code.lines, 6);
});

test("size: test lines are counted apart from code lines (added + removed, modified files too)", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", size: "S", touch: ["src/**", "test/**"] }] });
  config.workflow.testCaps.S = 3;
  write(root, "src/old.js", lines(5));
  write(root, "test/old.test.js", lines(2));
  commitAll(root, "seed");
  const ctx = fakeCtx(root, config, { logged: [] });
  ctx.log = (s) => ctx.logged.push(s);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/old.js", lines(2)); // 3 removed
  write(root, "test/old.test.js", `${lines(2)}extra 1\nextra 2\n`); // 2 added
  write(root, "test/new.spec.ts", lines(2)); // untracked, 2 added
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.verified.size.code.lines, 3);
  assert.equal(r.verified.size.test.lines, 4);
  assert.deepEqual(r.verified.size.over, ["test"]);
  assert.ok(ctx.logged.some((l) => /test 4 > 3/.test(l)));
  assert.equal(r.status, "done");
});

test("lane guard: a SAF project in a subfolder of a lane worktree is not a lane; a lane root that lost its label is still refused", async () => {
  const { resolveConfig } = await lib("config.mjs");
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch: ["src/**"] }] });
  const ev = task.startCard(fakeCtx(root, config), "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  // a second, independent SAF project that lives in a subfolder of the lane worktree (on the card/* branch)
  const sub = join(lane, "examples", "demo");
  write(sub, "saf.config.json", { version: 1, stack: { packageManager: "none" } });
  write(sub, "docs/plan/milestones/M1.md", "---\nid: M1\ntitle: m\nstatus: active\ncards: []\n---\n\n# M1\n");
  const subConfig = resolveConfig({ version: 1, stack: { packageManager: "none" } });
  assert.equal(task.laneFolder(sub, loadPlan(sub, subConfig)), null);
  assert.deepEqual(task.stateCheck(fakeCtx(sub, subConfig)).issues, []);
  // the lane root itself: label present → lane; label lost → refused
  assert.equal(task.laneFolder(lane, loadPlan(lane, config)).card, "T-M1-01");
  rmSync(join(lane, task.LANE_FILE));
  assert.throws(() => task.laneFolder(lane, loadPlan(lane, config)), /no lane label/);
});

test("lane guard: samePath treats two spellings of one folder as equal and two folders as different", () => {
  const dir = tmp();
  mkdirSync(join(dir, "a", "b"), { recursive: true });
  mkdirSync(join(dir, "other"));
  assert.equal(samePath(join(dir, "a", "b", ".."), join(dir, "a")), true);
  assert.equal(samePath(join(dir, "a"), join(dir, "other")), false);
  assert.equal(samePath(join(dir, "missing"), join(dir, "missing")), true); // not on disk: plain string compare
  assert.equal(samePath(join(dir, "missing"), join(dir, "other")), false);
  try {
    symlinkSync(join(dir, "a"), join(dir, "link"), "junction");
  } catch {
    return; // no symlink right (some Windows setups): the cases above still ran
  }
  assert.equal(samePath(join(dir, "link"), join(dir, "a")), true);
  assert.equal(samePath(join(dir, "link"), join(dir, "other")), false);
  assert.notEqual(join(dir, "link"), join(dir, "a")); // a plain string compare would call them different
});

test("lane guard: samePath sees a Windows 8.3 short name as the long name", { skip: process.platform !== "win32" }, () => {
  const dir = tmp();
  let short = dir;
  try {
    short = execFileSync("cmd.exe", ["/d", "/c", "for", "%I", "in", `(${dir})`, "do", "@echo", "%~sI"], { encoding: "utf8" }).trim();
  } catch {
    // no short name available: the assertion below still holds for equal spellings
  }
  assert.equal(samePath(short, realpathSync.native(dir)), true);
});

test("lane guard: a linked worktree that only its card/* branch name reveals is refused; a subfolder of it is not", async () => {
  const { resolveConfig } = await lib("config.mjs");
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch: ["src/**"] }] });
  commitAll(root, "seed");
  // a linked worktree outside worktreeDir, on card/T-M1-09: no lane label, no open evidence for it
  const wt = join(tmp(), "elsewhere");
  git(root, "worktree", "add", "-q", "-b", "card/T-M1-09", wt);
  assert.ok(samePath(topLevel(wt), wt));
  assert.throws(() => task.laneFolder(wt, loadPlan(wt, config)), /no lane label.*T-M1-09/);
  // a SAF project in a subfolder of that worktree: the top level is another folder → not a lane
  const sub = join(wt, "examples", "demo");
  write(sub, "saf.config.json", { version: 1, stack: { packageManager: "none" } });
  const subConfig = resolveConfig({ version: 1, stack: { packageManager: "none" } });
  assert.equal(samePath(topLevel(sub), sub), false);
  assert.equal(task.laneFolder(sub, loadPlan(sub, subConfig)), null);
});
