import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const { buildMatrix, blockingGaps, renderMatrix, summarize } = await lib("matrix.mjs");
const { REPO } = await import("../helpers.mjs");
after(cleanup);

const SAF = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const spec = (name, ids) => `# ${name}\n\n## 5. Acceptance\n\n| id | then |\n|---|---|\n${ids.map((i) => `| ${i} | x |`).join("\n")}\n`;
const testFile = (id) => `import { test } from "node:test";\ntest("${id} works", () => {});\n`;
const matrixCli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [SAF, "spec-matrix", ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const cardsA = [
  { id: "T-M1-01", scenarios: ["A-AC-01"], touch: ["src/a/**", "test/a/**"] },
  { id: "T-M1-02", scenarios: ["B-AC-01"], touch: ["src/b/**", "test/b/**"] },
];
const specFiles = { "docs/specs/x.md": spec("x", ["A-AC-01", "B-AC-01"]) };
const lanesConfig = { workflow: { lanes: { code: 3, main: 1 } } };

/** B started first (lane), then A (lane): A's branch holds B's evidence copy. */
async function twoLanes() {
  const { root, config } = await planRepo({ config: lanesConfig, cards: cardsA, files: specFiles });
  const ctx = fakeCtx(root, config);
  const evB = task.startCard(ctx, "T-M1-02", { worktree: true });
  const evA = task.startCard(ctx, "T-M1-01", { worktree: true });
  return { root, config, ctx, laneA: join(root, evA.worktree), laneB: join(root, evB.worktree) };
}

test("MSCOPE-AC-01 two lane cards: each lane sees only its own card's gap", async () => {
  const { laneA, laneB } = await twoLanes();
  write(laneA, "test/a/a.test.mjs", testFile("A-AC-01"));
  commitAll(laneA, "A test");
  write(laneB, "test/b/b.test.mjs", testFile("B-AC-01"));
  commitAll(laneB, "B test");
  // remove B's test from A's lane view: it exists only on B's branch (A's worktree never had it)
  const a = matrixCli(laneA, "--check");
  assert.equal(a.code, 0, a.err);
  assert.match(a.out, /\| B-AC-01 .*✗ gap \(started in another folder\)/);
  const b = matrixCli(laneB, "--check");
  assert.equal(b.code, 0, b.err);
});

test("MSCOPE-AC-01 own card's gap still fails in its lane", async () => {
  const { laneA } = await twoLanes();
  const a = matrixCli(laneA, "--check");
  assert.equal(a.code, 1);
  assert.match(a.err, /A-AC-01/);
  assert.doesNotMatch(a.err, /B-AC-01/);
});

/** main folder: lane card L (T-M1-02) in progress + main-folder card M (T-M1-03, designer) in progress */
async function mainWithLaneAndMain() {
  const { root, config } = await planRepo({
    config: lanesConfig,
    cards: [{ id: "T-M1-02", scenarios: ["L-AC-01"], touch: ["src/b/**"] }, { id: "T-M1-03", scenarios: ["M-AC-01"], role: "designer", touch: ["docs/**"] }],
    files: { "docs/specs/y.md": spec("y", ["L-AC-01", "M-AC-01"]) },
  });
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, "T-M1-02", { worktree: true });
  task.startCard(ctx, "T-M1-03");
  return { root, config, ctx };
}

test("MSCOPE-AC-02 main folder counts a main-folder card, not a lane card", async () => {
  const { root } = await mainWithLaneAndMain();
  const r = matrixCli(root, "--check");
  assert.equal(r.code, 1);
  assert.match(r.err, /M-AC-01/);
  assert.match(r.err, /T-M1-03/);
  assert.doesNotMatch(r.err, /L-AC-01/);
});

test("MSCOPE-AC-03 a main-folder card does not count in a lane", async () => {
  const { root, config, ctx } = await planRepo({
    config: lanesConfig,
    cards: [{ id: "T-M1-01", scenarios: ["A-AC-01"], touch: ["src/a/**"] }, { id: "T-M1-03", scenarios: ["M-AC-01"], role: "designer", touch: ["docs/**"] }],
    files: { "docs/specs/z.md": spec("z", ["A-AC-01", "M-AC-01"]) },
  }).then((p) => ({ ...p, ctx: fakeCtx(p.root, p.config) }));
  task.startCard(ctx, "T-M1-03");
  commitAll(root, "M evidence");
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  assert.ok(config);
  const r = matrixCli(lane, "--check");
  assert.equal(r.code, 1);
  assert.match(r.err, /A-AC-01/);
  assert.doesNotMatch(r.err, /M-AC-01/);
});

const rowFor = (id, cards, tests = []) => ({ id, spec: "docs/specs/s.md", line: 1, tests, cards });
const matrixOf = (rows) => ({ specs: ["docs/specs/s.md"], rows, issues: [] });

test("MSCOPE-AC-04 finished cards count in every folder, todo never (guard: same as before)", () => {
  const m = matrixOf([
    rowFor("S-AC-01", [{ id: "T-M1-01", status: "done", lane: undefined }]),
    rowFor("S-AC-02", [{ id: "T-M1-02", status: "done", lane: 2 }]),
    rowFor("S-AC-03", [{ id: "T-M1-03", status: "legacy" }]),
    rowFor("S-AC-04", [{ id: "T-M1-04", status: "todo" }]),
  ]);
  for (const here of [{ laneCard: null }, { laneCard: "T-M1-09" }]) {
    assert.deepEqual(blockingGaps(m, here).map((r) => r.id), ["S-AC-01", "S-AC-02", "S-AC-03"]);
  }
  assert.deepEqual(blockingGaps(m).map((r) => r.id), ["S-AC-01", "S-AC-02", "S-AC-03"]);
});

test("MSCOPE-AC-05 table and summary say how many gaps are built in another folder", async () => {
  const { root } = await mainWithLaneAndMain();
  const r = matrixCli(root);
  assert.equal(r.code, 0);
  assert.match(r.out, /\| L-AC-01 .*✗ gap \(started in another folder\)/);
  assert.match(r.out, /\| M-AC-01 .*✗ gap \(card started\)/);
  assert.match(r.out.trim(), /gaps of started cards 1 · started in another folder 1$/);
});

test("MSCOPE-AC-06 a lane label that does not match the evidence checks every started card", async () => {
  const { laneA, laneB } = await twoLanes();
  write(laneA, ".saf-lane.json", { lane: 1, card: "T-M1-99" });
  const r = matrixCli(laneA, "--check");
  assert.equal(r.code, 1);
  assert.match(r.err, /lane not recognised \(/);
  assert.match(r.err, /checking every started card/);
  assert.match(r.err, /A-AC-01/);
  assert.ok(laneB);
});

test("MSCOPE-AC-07 an abandoned lane card's evidence copy on another lane does not block", async () => {
  const { root, ctx, laneA } = await twoLanes();
  write(laneA, "test/a/a.test.mjs", testFile("A-AC-01"));
  commitAll(laneA, "A test");
  task.abandonCard(ctx, "T-M1-02");
  const main = matrixCli(root, "--check");
  assert.equal(main.code, 0, main.err);
  const a = matrixCli(laneA, "--check");
  assert.equal(a.code, 0, a.err);
});

test("MSCOPE-AC-04 a lane card counts once done on main (merge checks run there)", async () => {
  const { root, ctx, laneA } = await twoLanes();
  const laneCtx = fakeCtx(laneA, ctx.config);
  write(laneA, "src/a/one.ts", "1\n");
  assert.equal((await task.verifyCard(laneCtx, "T-M1-01")).status, "failed", "verify refuses: scenario A-AC-01 has no test");
  write(laneA, "test/a/a.test.mjs", testFile("A-AC-01"));
  assert.equal((await task.verifyCard(laneCtx, "T-M1-01")).status, "done");
  commitAll(laneA, "A work");
  // B's lane never merged; A merges with the matrix check as its merge check: B stays skipped in main (still in progress)
  const before = matrixCli(root, "--check");
  assert.equal(before.code, 0, before.err);
  git(root, "merge", "--no-ff", "-q", "-m", "merge A", "card/T-M1-01");
  // after the merge A is done on main and counts there: remove its test and it is caught
  const after = matrixCli(root, "--check");
  assert.equal(after.code, 0, after.err);
  git(root, "rm", "-q", "test/a/a.test.mjs");
  const gone = matrixCli(root, "--check");
  assert.equal(gone.code, 1);
  assert.match(gone.err, /A-AC-01/);
  assert.doesNotMatch(gone.err, /B-AC-01/);
});

test("MSCOPE-AC-04 selection is a pure function: lane card counts only in its own lane", () => {
  const m = matrixOf([rowFor("S-AC-01", [{ id: "T-M1-01", status: "in_progress", lane: 1 }]), rowFor("S-AC-02", [{ id: "T-M1-02", status: "failed" }])]);
  assert.deepEqual(blockingGaps(m, { laneCard: "T-M1-01" }).map((r) => r.id), ["S-AC-01"]);
  assert.deepEqual(blockingGaps(m, { laneCard: null }).map((r) => r.id), ["S-AC-02"]);
  assert.match(renderMatrix(m, { laneCard: null }), /S-AC-01 .*started in another folder/);
  assert.match(summarize(m, { laneCard: null }), / · started in another folder 1$/);
  assert.doesNotMatch(summarize(m), /another folder/);
  const built = buildMatrix({ files: ["docs/specs/s.md"], read: () => spec("s", ["S-AC-01"]), cards: [{ id: "T-M1-01", file: "c", scenarios: ["S-AC-01"] }], status: () => "in_progress", lane: () => 2 });
  assert.equal(built.rows[0].cards[0].lane, 2);
});
