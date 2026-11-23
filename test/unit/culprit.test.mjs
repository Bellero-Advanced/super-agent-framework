import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const culprit = await lib("culprit.mjs");
after(cleanup);

/** The check: fails (exit 1) when the marker file exists in the folder it runs in. */
const CHECK = `node -e "process.exit(require('fs').existsSync('marker.txt')?1:0)"`;
const IDS = ["T-M1-01", "T-M1-02", "T-M1-03", "T-M1-04"];
const CARDS = IDS.map((id) => ({ id, touch: ["src/**", "marker.txt"], criteria: ["true"] }));

/** Evidence of a started (and finished) card: started.base and the files it changed. */
function evidence(root, id, base, changed) {
  task.writeJson(root, task.evidencePath(id), { id, milestone: "M1", status: "done", started: { at: "2026-01-01T00:00:00Z", base, dirty: {} }, attempts: 1, verified: { pass: true, files: { changed, outside: [], forbidden: [] } } });
}

/**
 * A repo with four card commits on top of the plan commit; `breaks` = the card whose commit creates marker.txt.
 * `subjects(id)` is the commit subject; evidence is committed with the plan afterwards (so it never changes a commit under test).
 */
async function fourCards({ breaks = "T-M1-03", subjects = (id) => `feat: ${id} work`, files = {} } = {}) {
  const made = await planRepo({ config: { stack: { packageManager: "none", commands: { test: CHECK } } }, cards: CARDS, files });
  const base = git(made.root, "rev-parse", "HEAD");
  for (const id of IDS) {
    write(made.root, `src/${id}.js`, `export const x = "${id}";\n`);
    if (id === breaks) write(made.root, "marker.txt", "broken\n");
    commitAll(made.root, subjects(id));
  }
  for (const id of IDS) evidence(made.root, id, base, [`src/${id}.js`, ...(id === breaks ? ["marker.txt"] : [])]);
  commitAll(made.root, "evidence");
  return { ...made, base };
}

const ctxFor = (made, extra = {}) => {
  const logs = [];
  return { ctx: { root: made.root, config: made.config, install: null, log: (l) => logs.push(l), ...extra }, logs };
};

const worktrees = (root) => git(root, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length;
const leftovers = (root, config) => {
  const dir = join(root, config.workflow.worktreeDir);
  return existsSync(dir) ? readdirSync(dir) : [];
};

test("TMODE-AC-11 four card commits, the third breaks the suite: names the third card and its commit in at most 4 runs; worktree gone; docs/plan unchanged", async () => {
  const made = await fourCards();
  // the evidence commit sits after the four card commits: it is part of the range but changes no source file
  const thirdSha = git(made.root, "log", "--format=%H", "--grep=T-M1-03 work").trim();
  const head = git(made.root, "rev-parse", "HEAD");
  const { ctx, logs } = ctxFor(made);
  const r = await culprit.findCulprit(ctx, "M1");
  assert.equal(r.kind, "found");
  assert.equal(r.exit, 0);
  assert.equal(r.card, "T-M1-03");
  assert.equal(r.sha, thirdSha);
  assert.match(r.subject, /T-M1-03 work/);
  assert.equal(r.by, "subject");
  assert.ok(Array.isArray(r.tail));
  assert.ok(r.commits >= 4);
  assert.ok(r.runs <= 2 + Math.ceil(Math.log2(r.commits)), `used ${r.runs} runs for ${r.commits} commits`);
  assert.equal(logs.filter((l) => l.startsWith("▶ run")).length, r.runs, "every run is a real run");
  assert.match(culprit.culpritLines(r).join("\n"), /card: T-M1-03 card T-M1-03/);
  // nothing left behind, nothing changed
  assert.equal(worktrees(made.root), 1);
  assert.deepEqual(leftovers(made.root, made.config), []);
  assert.equal(git(made.root, "rev-parse", "HEAD"), head);
  assert.equal(git(made.root, "status", "--porcelain"), "");
  assert.equal(git(made.root, "diff", "--stat", made.base, "HEAD", "--", "docs/plan/milestones", "docs/plan/tasks", "docs/plan/STATE.md"), "");
});

test("TMODE-AC-11 each of the four cards is found, with the run limit; a commit subject without an id falls back to the files it changed", async () => {
  for (const [i, id] of IDS.entries()) {
    const made = await fourCards({ breaks: id, subjects: () => "wip" });
    const { ctx } = ctxFor(made);
    const r = await culprit.findCulprit(ctx, "M1");
    assert.equal(r.kind, "found", id);
    assert.equal(r.card, id, `card ${i + 1}`);
    assert.equal(r.by, "files");
    assert.ok(r.runs <= 2 + Math.ceil(Math.log2(r.commits)), `${id}: used ${r.runs} runs for ${r.commits} commits`);
    assert.equal(worktrees(made.root), 1);
  }
});

test("TMODE-AC-11 a failing commit that no card owns is reported as 'no card'", async () => {
  const made = await fourCards({ breaks: "none", subjects: () => "wip" });
  write(made.root, "marker.txt", "late\n");
  commitAll(made.root, "stray change");
  const { ctx } = ctxFor(made);
  const r = await culprit.findCulprit(ctx, "M1");
  assert.equal(r.kind, "found");
  assert.equal(r.card, null);
  assert.match(culprit.culpritLines(r).join("\n"), /no card of this milestone matches/);
});

test("TMODE-AC-11 uncommitted changes in the main folder are reported and not tested; --cmd overrides the command", async () => {
  const made = await fourCards({ breaks: "T-M1-02" });
  write(made.root, "scratch.txt", "not committed\n");
  const { ctx, logs } = ctxFor(made);
  const r = await culprit.findCulprit(ctx, "M1", { cmd: CHECK });
  assert.equal(r.card, "T-M1-02");
  assert.equal(r.command, CHECK);
  assert.ok(logs.some((l) => l.includes("1 uncommitted file(s)")));
  assert.equal(existsSync(join(made.root, "scratch.txt")), true, "the main folder is untouched");
  const none = ctxFor({ ...made, config: { ...made.config, stack: { ...made.config.stack, commands: { test: "" } } } });
  await assert.rejects(culprit.findCulprit(none.ctx, "M1"), /no full-suite command/);
});

test("TMODE-AC-12 the suite already fails before the first card: exit 2 after two runs", async () => {
  const made = await fourCards({ files: { "marker.txt": "broken from the start\n" }, breaks: "none" });
  const { ctx } = ctxFor(made);
  const r = await culprit.findCulprit(ctx, "M1");
  assert.equal(r.kind, "base-fails");
  assert.equal(r.exit, 2);
  assert.equal(r.runs, 2);
  assert.match(culprit.culpritLines(r)[0], /already fails before the first card/);
  assert.equal(worktrees(made.root), 1);
});

test("TMODE-AC-12 the suite passes at HEAD: exit 3 after one run", async () => {
  const made = await fourCards({ breaks: "none" });
  const { ctx } = ctxFor(made);
  const r = await culprit.findCulprit(ctx, "M1");
  assert.equal(r.kind, "passes-at-head");
  assert.equal(r.exit, 3);
  assert.equal(r.runs, 1);
  assert.match(culprit.culpritLines(r)[0], /flaky or already fixed/);
  assert.deepEqual(leftovers(made.root, made.config), []);
});

test("TMODE-AC-12 the CLI exits with 3 when the suite passes at HEAD and with 1 for an unknown milestone", async () => {
  const made = await fourCards({ breaks: "none" });
  const bin = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
  const cli = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: made.root, encoding: "utf8" });
  const ok = cli("task", "culprit", "M1");
  assert.equal(ok.status, 3, ok.stderr);
  assert.match(ok.stdout, /flaky or already fixed/);
  const bad = cli("task", "culprit", "M9");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no milestone M9/);
  assert.equal(cli("task", "culprit").status, 1);
});

test("TMODE-AC-11 the temporary worktree is removed when a run cannot be judged (install fails), and no card started is an error", async () => {
  const made = await fourCards();
  const { ctx } = ctxFor(made, { install: "install-step", runSync: () => 1 });
  await assert.rejects(culprit.findCulprit(ctx, "M1"), /install-step exited 1/);
  assert.equal(worktrees(made.root), 1);
  assert.deepEqual(leftovers(made.root, made.config), []);
  const fresh = await planRepo({ config: { stack: { packageManager: "none", commands: { test: CHECK } } }, cards: CARDS });
  await assert.rejects(culprit.findCulprit(ctxFor(fresh).ctx, "M1"), /no card of M1 has started/);
  await assert.rejects(culprit.findCulprit(ctxFor(fresh).ctx, "M7"), /no milestone M7/);
});

test("TMODE-AC-11 refuses in a lane worktree", async () => {
  const made = await planRepo({ config: { stack: { packageManager: "none", commands: { test: CHECK }, }, workflow: { lanes: { code: 2, main: 1 } } }, cards: CARDS });
  const ctx = fakeCtx(made.root, made.config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(made.root, ev.worktree);
  await assert.rejects(culprit.findCulprit(fakeCtx(lane, made.config), "M1"), /task:culprit M1 runs in the main folder/);
});

test("TMODE-AC-13 the full-suite gate fails and a card has deferred evidence: the output names task:culprit <M>", async () => {
  const card = { id: "T-M1-01", touch: ["src/**", "test/**"], criteria: ["npm test FAIL"], scenarios: ["AUTH-AC-01"] };
  const made = await planRepo({ config: { stack: { packageManager: "npm", commands: { test: "npm test FAIL", testFiles: "run-tests {files}" } }, workflow: { lanes: { code: 3, main: 1 } } }, cards: [card] });
  made.config.workflow.testMode = "milestone";
  made.config.workflow.testModeSource = "repo";
  const vctx = fakeCtx(made.root, made.config);
  task.startCard(vctx, "T-M1-01");
  write(made.root, "test/auth.test.js", 'test("AUTH-AC-01 signs in", () => {});\n');
  const v = await task.verifyCard(vctx, "T-M1-01");
  assert.deepEqual(v.verified.deferred, ["npm test FAIL"]);
  const logs = [];
  const res = await task.verifyMilestone(fakeCtx(made.root, made.config, { log: (l) => logs.push(l) }), "M1");
  assert.equal(res.pass, false);
  assert.match(res.hint, /npm run task:culprit -- M1/);
  assert.ok(logs.some((l) => l.includes("npm run task:culprit -- M1")), logs.join("\n"));
});

test("TMODE-AC-13 no hint when no card deferred the suite, or when the failed gate is not a full-suite command", async () => {
  const a = await planRepo({ config: { stack: { packageManager: "none", commands: { test: "npm test FAIL" } }, workflow: { lanes: { code: 3, main: 1 } } }, cards: [{ id: "T-M1-01", criteria: ["true"] }] });
  a.config.workflow.testMode = "milestone";
  a.config.workflow.testModeSource = "repo";
  const ra = await task.verifyMilestone(fakeCtx(a.root, a.config), "M1");
  assert.equal(ra.pass, false);
  assert.equal(ra.hint, null, "no card has deferred evidence");
  const b = await planRepo({ config: { stack: { packageManager: "none", commands: { test: "npm test" } } }, cards: [{ id: "T-M1-01", criteria: ["true"] }], gates: [{ id: "G1", text: "lint", run: ["echo FAIL"] }] });
  b.config.workflow.testMode = "every-card";
  const rb = await task.verifyMilestone(fakeCtx(b.root, b.config), "M1");
  assert.equal(rb.hint, null);
});

test("the engine script and the cmd table know task:culprit", async () => {
  const config = await lib("config.mjs");
  assert.equal(config.ENGINE_SCRIPTS["task:culprit"], "task culprit");
  assert.equal(config.scriptCommand("npm", "task:culprit", "<M>"), "npm run task:culprit -- <M>");
});
