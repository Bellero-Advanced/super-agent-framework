import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, fakeCtx, git, lib, planRepo, tmp, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const culprit = await lib("culprit.mjs");
const { RUN_LIMITS } = await lib("run.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const CHECK = `node -e "process.exit(require('fs').existsSync('marker.txt')?1:0)"`;
const IDS = ["T-M1-01", "T-M1-02", "T-M1-03", "T-M1-04"];
const CARDS = IDS.map((id) => ({ id, touch: ["src/**", "marker.txt"], criteria: ["true"] }));
const cfgWith = (test) => ({ stack: { packageManager: "none", commands: { test } } });

function evidence(root, id, base, changed = []) {
  task.writeJson(root, task.evidencePath(id), { id, milestone: "M1", status: "done", started: { at: "2026-01-01T00:00:00Z", base, dirty: {} }, attempts: 1, verified: { pass: true, files: { changed, outside: [], forbidden: [] } } });
}

/** Four card commits after the plan commit; the commit of `breaks` creates marker.txt. */
async function fourCards({ test = CHECK, breaks = "T-M1-03", install } = {}) {
  const made = await planRepo({ config: { ...cfgWith(test), ...(install ? { workflow: { laneInstall: install } } : {}) }, cards: CARDS });
  const base = git(made.root, "rev-parse", "HEAD");
  for (const id of IDS) {
    write(made.root, `src/${id}.js`, `export const x = "${id}";\n`);
    if (id === breaks) write(made.root, "marker.txt", "broken\n");
    commitAll(made.root, `feat: ${id} work`);
  }
  for (const id of IDS) evidence(made.root, id, base, [`src/${id}.js`]);
  commitAll(made.root, "evidence");
  return { ...made, base };
}

const worktrees = (root) => git(root, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length;
const leftovers = (root, config) => {
  const dir = join(root, config.workflow.worktreeDir);
  return existsSync(dir) ? readdirSync(dir) : [];
};
const ctxFor = (made, extra = {}) => ({ root: made.root, config: made.config, install: null, log: () => {}, ...extra });
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, "task", ...args], { cwd, encoding: "utf8" });

/**
 * Start the CLI on a command that sleeps, wait until it has begun, send `signal`, return how it ended.
 * `where` "run" = the test command sleeps (the signal goes to the CLI only) · "install" = `workflow.laneInstall` sleeps
 * (the signal goes to the whole process group, like Ctrl-C in a terminal, so it kills the foreground install too).
 */
async function interrupt(signal, where = "run") {
  const pidFile = join(tmp("saf-pid-"), "child.pid");
  const sleeper = `node -e "require('fs').writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>{},60000)" ${JSON.stringify(pidFile)}`;
  const made = where === "install" ? await fourCards({ breaks: "none", install: sleeper }) : await fourCards({ breaks: "none" });
  const head = git(made.root, "rev-parse", "HEAD");
  const args = where === "install" ? [] : ["--cmd", sleeper];
  const child = spawn(process.execPath, [BIN, "task", "culprit", "M1", ...args], { cwd: made.root, detached: where === "install", stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const closed = new Promise((resolve) => child.on("close", (code, sig) => resolve({ code, sig })));
  const deadline = Date.now() + 30000;
  while (!existsSync(pidFile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  assert.ok(existsSync(pidFile), `a run never started\n${stderr}`);
  const sleeperPid = Number(readFileSync(pidFile, "utf8"));
  if (where === "install") process.kill(-child.pid, signal);
  else child.kill(signal);
  const end = await closed;
  return { made, head, end, stdout, stderr, sleeperPid };
}

for (const [signal, code, where] of [["SIGINT", 130, "run"], ["SIGTERM", 143, "run"], ["SIGINT", 130, "install"], ["SIGTERM", 143, "install"]]) {
  test(
    `TMODE-AC-17 ${signal} during the ${where === "run" ? "test run" : "install step"}: exit ${code}, one interrupted line, the command stopped, no culprit worktree left, main folder unchanged`,
    { skip: process.platform === "win32" ? "POSIX signals: Windows cannot send SIGINT/SIGTERM to a child process" : false },
    async () => {
      const { made, head, end, stdout, stderr, sleeperPid } = await interrupt(signal, where);
      assert.equal(end.code, code, `${stdout}\n${stderr}`);
      const lines = `${stdout}\n${stderr}`.split("\n").filter((l) => /interrupted/i.test(l));
      assert.equal(lines.length, 1, `${stdout}\n${stderr}`);
      assert.match(lines[0], new RegExp(`interrupted by ${signal} — the running command was stopped and the temporary worktree removed`));
      assert.deepEqual(leftovers(made.root, made.config), []);
      assert.equal(worktrees(made.root), 1);
      assert.equal(git(made.root, "rev-parse", "HEAD"), head);
      assert.equal(git(made.root, "status", "--porcelain"), "");
      assert.ok(!/exited \d+ at/.test(`${stdout}${stderr}`), "no install failure is reported");
      assert.throws(() => process.kill(sleeperPid, 0), "the sleeping command is stopped");
    },
  );
}

test(
  "TMODE-AC-17 a signal that arrives while the blocking install runs is reported as interrupted, not as an install failure (in process)",
  { skip: process.platform === "win32" ? "POSIX signals: Windows cannot send SIGINT to a process" : false },
  async () => {
    const made = await fourCards({ breaks: "none" });
    const ctx = ctxFor(made, { install: "fake-install", runSync: () => { process.kill(process.pid, "SIGINT"); return 1; } });
    const r = await culprit.findCulprit(ctx, "M1");
    assert.equal(r.kind, "interrupted");
    assert.equal(r.exit, 130);
    assert.deepEqual(leftovers(made.root, made.config), []);
  },
);

test("TMODE-AC-18 a plan with a problem is refused with the plan error before any worktree is made", async () => {
  const made = await planRepo({ config: cfgWith(CHECK), cards: CARDS, gates: [{ id: "full-suite", text: "reserved id", run: ["echo hi"] }] });
  await assert.rejects(culprit.findCulprit(ctxFor(made), "M1"), /the plan has problems/);
  assert.equal(worktrees(made.root), 1);
  assert.deepEqual(leftovers(made.root, made.config), []);
  const r = cli(made.root, "culprit", "M1");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the plan has problems/);
});

test("TMODE-AC-18 an id that is not M<n> is a usage error with exit 2, before anything runs", async () => {
  const made = await fourCards();
  for (const bad of ["x(", "m1", "M1x", "T-M1-01"]) {
    const r = cli(made.root, "culprit", bad);
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /not a milestone id — usage: .*<M> \[--cmd/, bad);
    assert.equal(r.stdout, "");
  }
  assert.deepEqual(leftovers(made.root, made.config), []);
});

test("TMODE-AC-18 card ids are matched as literal text; several ids in a subject and equal file overlap go to the first card in milestone order", async () => {
  const made = await fourCards({ breaks: "none" });
  const at = (subject) => {
    write(made.root, "src/scratch.js", `${subject}\n`);
    return commitAll(made.root, subject) ?? git(made.root, "rev-parse", "HEAD");
  };
  const ctx = ctxFor(made);
  const sha = (s) => (at(s), git(made.root, "rev-parse", "HEAD"));
  // an id with a regex character matches only itself
  const dotted = { cards: ["T-M1-0.", "T-M1-02"] };
  const plan = { evidence: new Map(), cards: new Map() };
  assert.equal(culprit.cardOf(ctx, dotted, plan, sha("feat: T-M1-02 work"))?.id, "T-M1-02", "the dot is not a wildcard");
  assert.equal(culprit.cardOf(ctx, dotted, plan, sha("feat: T-M1-0. work"))?.id, "T-M1-0.");
  assert.equal(culprit.cardOf(ctx, { cards: ["T-M1-(1)"] }, plan, sha("feat: T-M1-1 work")), null, "no pattern syntax is run");
  // a subject naming two cards → the first of them in milestone order, whatever the order in the subject
  const two = sha("fix: T-M1-04 and T-M1-02 together");
  assert.deepEqual(culprit.cardOf(ctx, { cards: IDS }, plan, two), { id: "T-M1-02", by: "subject" });
  assert.equal(culprit.cardOf(ctx, { cards: [...IDS].reverse() }, plan, two)?.id, "T-M1-04");
  // equal overlap → the earlier card in milestone order
  const files = sha("wip");
  const tied = { evidence: new Map(["T-M1-01", "T-M1-02"].map((id) => [id, { verified: { files: { changed: ["src/scratch.js"] } } }])), cards: new Map() };
  assert.deepEqual(culprit.cardOf(ctx, { cards: ["T-M1-01", "T-M1-02"] }, tied, files), { id: "T-M1-01", by: "files", overlap: 1 });
  assert.equal(culprit.cardOf(ctx, { cards: ["T-M1-02", "T-M1-01"] }, tied, files)?.id, "T-M1-02");
});

test("TMODE-AC-18 a base reached only through a merged lane branch never starts the search inside the lane branch", async () => {
  const made = await planRepo({ config: cfgWith(CHECK), cards: CARDS.slice(0, 2) });
  const p0 = git(made.root, "rev-parse", "HEAD");
  write(made.root, "src/a1.js", "a1\n");
  commitAll(made.root, "feat: T-M1-01 a1");
  const a1 = git(made.root, "rev-parse", "HEAD");
  git(made.root, "checkout", "-q", "-b", "lane");
  write(made.root, "marker.txt", "broken on the lane\n");
  commitAll(made.root, "feat: T-M1-02 lane work");
  const l1 = git(made.root, "rev-parse", "HEAD");
  git(made.root, "checkout", "-q", "-");
  write(made.root, "src/a2.js", "a2\n");
  commitAll(made.root, "feat: T-M1-01 a2");
  git(made.root, "merge", "--no-ff", "-q", "-m", "merge(M1): T-M1-02 lane work", "lane");
  write(made.root, "src/a3.js", "a3\n");
  commitAll(made.root, "feat: T-M1-01 a3");
  evidence(made.root, "T-M1-01", p0, ["src/a1.js"]);
  evidence(made.root, "T-M1-02", l1, ["marker.txt"]);
  assert.notEqual(a1, l1);
  const r = await culprit.findCulprit(ctxFor(made), "M1");
  assert.equal(r.kind, "found", "the lane commit that has the failure is not taken as the base");
  assert.equal(r.commits, 4, "a1 · a2 · the merge · a3: the first-parent commits after the older base");
  assert.equal(r.card, "T-M1-02");
  assert.match(r.subject, /^merge\(M1\): T-M1-02/);
  assert.deepEqual(leftovers(made.root, made.config), []);
});

test("TMODE-AC-19 the run output reaches onOutput while each run goes on; the tail is RUN_LIMITS.culpritTail lines; rule 33 words", async () => {
  assert.equal(RUN_LIMITS.culpritTail, 20);
  const noisy = `node -e "const f=require('fs');console.log('checking');if(f.existsSync('marker.txt')){for(let i=1;i<=40;i++)console.log('fail line '+i);process.exit(1)}"`;
  const made = await fourCards({ test: noisy });
  const events = [];
  const ctx = ctxFor(made, { log: (l) => events.push(["log", l]), onOutput: (s) => events.push(["out", s]) });
  const r = await culprit.findCulprit(ctx, "M1");
  assert.equal(r.kind, "found");
  assert.equal(r.card, "T-M1-03");
  assert.equal(r.tail.length, RUN_LIMITS.culpritTail);
  assert.equal(r.tail.at(-1), "fail line 40");
  const starts = events.flatMap(([k, v], i) => (k === "log" && v.startsWith("▶ run") ? [i] : []));
  assert.equal(starts.length, r.runs);
  for (const [n, from] of starts.entries()) {
    const to = events.findIndex(([k, v], i) => i > from && k === "log" && /^ {2}[✓✗]/.test(v));
    assert.ok(to > from, `run ${n + 1} has a result line`);
    assert.ok(events.slice(from, to).some(([k, v]) => k === "out" && v.includes("checking")), `run ${n + 1} streamed output before it ended`);
  }
  const line = (kind, extra = {}) => culprit.culpritLines({ kind, milestone: "M1", command: "npm test", runs: 2, commits: 4, tail: [], ...extra });
  assert.match(line("passes-at-head")[0], /passes at HEAD — flaky or already fixed/);
  assert.match(line("base-fails")[0], /already failing before the first card — not caused by a card/);
  assert.equal(culprit.CULPRIT_EXIT["passes-at-head"], 3);
  assert.equal(culprit.CULPRIT_EXIT["base-fails"], 2);
});

test("TMODE-AC-13 no culprit hint when the full suite fails but no card deferred it (deferredCards is empty)", async () => {
  const made = await planRepo({ config: cfgWith("npm test FAIL"), cards: [{ id: "T-M1-01", criteria: ["true"] }] });
  made.config.workflow.testMode = "milestone";
  made.config.workflow.testModeSource = "repo";
  const vctx = fakeCtx(made.root, made.config);
  task.startCard(vctx, "T-M1-01");
  const v = await task.verifyCard(vctx, "T-M1-01");
  assert.equal(v.verified.pass, true);
  assert.equal(v.verified.deferred, undefined);
  const logs = [];
  const res = await task.verifyMilestone(fakeCtx(made.root, made.config, { log: (l) => logs.push(l) }), "M1");
  assert.equal(res.pass, false, "the full-suite gate failed");
  assert.deepEqual(res.evidence.verified.deferredCards, []);
  assert.equal(res.hint, null);
  assert.ok(!logs.some((l) => l.includes("task:culprit")), logs.join("\n"));
});
