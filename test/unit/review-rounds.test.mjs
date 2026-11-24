import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

const rv = await lib("reviews.mjs");
const task = await lib("task.mjs");
const fr = await lib("friction.mjs");
const { loadPlan } = await lib("plan.mjs");
const { renderReport } = await lib("report.mjs");
const { listRepoFiles } = await lib("git.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
const CARDS = [
  { id: "T-M1-01", touch: ["src/**"] },
  { id: "T-M1-02", touch: ["lib/**"] },
  { id: "T-M1-03", touch: ["docs/**"] },
];
const AT = "2026-03-04T10:00:00.000Z";
const withNow = (root, config) => fakeCtx(root, config, { now: () => new Date(AT) });
const reviews = (root, id) => JSON.parse(readFileSync(join(root, rv.reviewsPath(id)), "utf8"));
const evidence = (root, id) => JSON.parse(readFileSync(join(root, task.evidencePath(id)), "utf8"));
const passed = async (ctx, id, file) => {
  task.startCard(ctx, id);
  write(ctx.root, file, `${id}\n`);
  const ev = await task.verifyCard(ctx, id);
  assert.equal(ev.status, "done");
  return ev;
};

test("REVIEW-AC-01 a pass is recorded as round 1 with head and verifyAttempts; the card evidence is unchanged", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  await passed(ctx, "T-M1-01", "src/a.ts");
  const before = readFileSync(join(root, task.evidencePath("T-M1-01")), "utf8");
  const got = rv.recordReview(ctx, "T-M1-01", "pass");
  assert.deepEqual(got, { round: 1, friction: null, worktree: null });
  const file = reviews(root, "T-M1-01");
  assert.equal(file.id, "T-M1-01");
  assert.equal(file.rounds.length, 1);
  const [r] = file.rounds;
  assert.deepEqual([r.round, r.result, r.kinds, r.note, r.at], [1, "pass", [], "", AT]);
  assert.equal(r.head, git(root, "rev-parse", "HEAD"));
  assert.equal(r.verifyAttempts, 1);
  assert.equal(r.verifyAt, evidence(root, "T-M1-01").verified.at);
  assert.equal(readFileSync(join(root, task.evidencePath("T-M1-01")), "utf8"), before, "card evidence untouched");
  assert.deepEqual(loadPlan(root, config).issues, [], "the reviews sub-folder is not card evidence");
  assert.deepEqual(rv.readReviews(root, "T-M1-01").rounds, file.rounds);
});

test("REVIEW-AC-02 a fail records both kinds, reopens the card, and task:verify runs again without --restart keeping the attempts", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  const first = await passed(ctx, "T-M1-01", "src/a.ts");
  rv.recordReview(ctx, "T-M1-01", "pass");
  const got = rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["spec-mismatch", "missing-test"], note: "scenario 3 has no test" });
  assert.equal(got.round, 2);
  const r = reviews(root, "T-M1-01").rounds[1];
  assert.deepEqual([r.round, r.result, r.kinds, r.note], [2, "fail", ["spec-mismatch", "missing-test"], "scenario 3 has no test"]);
  const ev = evidence(root, "T-M1-01");
  assert.deepEqual([ev.status, ev.reviewFailed, ev.attempts], ["failed", 2, 1]);
  assert.deepEqual(ev.started, first.started);
  assert.deepEqual(ev.verified, first.verified);
  assert.deepEqual(task.stateCheck(ctx).stale, [], "STATE.md follows the reopened card");
  // a pass on a reopened card needs a new verify first
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "pass"), /has not passed task:verify/);
  assert.throws(() => task.startCard(ctx, "T-M1-01"), /already started/);
  const again = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(again.status, "done");
  assert.equal(again.attempts, 2, "the attempt count continues");
  assert.equal("reviewFailed" in again, false, "the marker ends with the next verify");
  assert.equal(rv.recordReview(ctx, "T-M1-01", "pass").round, 3);
  assert.equal(reviews(root, "T-M1-01").rounds[2].verifyAttempts, 2);
});

test("REVIEW-AC-03 refusals name the reason and write nothing: not verified, lane worktree, fail without kind, pass with kind, unknown kind, bad note, unknown card", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  const none = () => assert.equal(existsSync(join(root, rv.reviewsPath("T-M1-01"))), false, "no reviews file");
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "pass"), /has not started/);
  task.startCard(ctx, "T-M1-01");
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "pass"), /has not passed task:verify/);
  write(root, "src/a.ts", "x\n");
  await task.verifyCard(ctx, "T-M1-01");
  const refuse = (result, opts, re) => {
    assert.throws(() => rv.recordReview(ctx, "T-M1-01", result, opts), re);
    none();
  };
  refuse("fail", {}, /needs at least one --kind/);
  refuse("pass", { kinds: ["docs"] }, /takes no --kind/);
  refuse("fail", { kinds: ["nonsense"] }, /unknown kind "nonsense"/);
  refuse("fail", { kinds: ["docs"], note: "a\nb" }, /one line/);
  refuse("fail", { kinds: ["docs"], note: "x".repeat(rv.REVIEW_LIMITS.note + 1) }, /at most/);
  refuse("fail", { kinds: ["docs"], area: "task:merge" }, /--area is only used with --kind framework/);
  refuse("maybe", {}, /pass or fail/);
  assert.throws(() => rv.recordReview(ctx, "T-M9-99", "pass"), /no card T-M9-99/);
  assert.equal(evidence(root, "T-M1-01").status, "done", "a refused fail does not reopen");

  // a lane worktree refuses and names the main-folder command
  const fresh = await planRepo({ cards: CARDS });
  const ev = task.startCard(withNow(fresh.root, fresh.config), "T-M1-02", { worktree: true });
  const lane = join(fresh.root, ev.worktree);
  const refused = cli(lane, "task", "review", "T-M1-02", "pass");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /worktree of lane 1.*task:review.*main folder/s);
  assert.equal(existsSync(join(lane, rv.reviewsPath("T-M1-02"))), false);
  assert.equal(cli(lane, "task", "review", "T-M1-02").status, 1, "listing is refused in a lane too");
});

test("REVIEW-AC-04 a lane card's round is read from the evidence on its branch and records the branch head; main-folder evidence is unchanged", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  write(lane, "src/a.ts", "1\n");
  // verified in the lane but nothing committed yet: the branch has no passed evidence
  await task.verifyCard(fakeCtx(lane, config), "T-M1-01");
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["docs"] }), /evidence on branch card\/T-M1-01 has not "passed"/);
  const head = commitAll(lane, "T-M1-01 work");
  const mainBefore = readFileSync(join(root, task.evidencePath("T-M1-01")), "utf8");
  const got = rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["docs"] });
  assert.equal(got.round, 1);
  assert.equal(got.worktree, ev.worktree);
  const r = reviews(root, "T-M1-01").rounds[0];
  assert.equal(r.head, head, "the lane branch head, not the main HEAD");
  assert.notEqual(r.head, git(root, "rev-parse", "HEAD"));
  assert.equal(r.verifyAttempts, 1);
  assert.equal(readFileSync(join(root, task.evidencePath("T-M1-01")), "utf8"), mainBefore, "main-folder card evidence unchanged");
  const text = cli(root, "task", "review", "T-M1-01", "fail", "--kind", "docs");
  assert.match(text.stdout, /fix it in .*run .*task verify T-M1-01 there again/s);

  // merged: a pass is still recorded, a fail is refused with the follow-up hint
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "review rounds");
  await task.mergeCard(ctx, "T-M1-01", { checks: [] });
  assert.equal(rv.recordReview(ctx, "T-M1-01", "pass").round, 3);
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["docs"] }), /already merged.*follow-up card/s);
  assert.equal(reviews(root, "T-M1-01").rounds.length, 3);
});

test("REVIEW-AC-05 fail with kind framework and --area appends a review-bounce friction entry; without --area it is refused and nothing is written", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  await passed(ctx, "T-M1-01", "src/a.ts");
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["framework"] }), /--area .* is required/);
  assert.equal(existsSync(join(root, rv.reviewsPath("T-M1-01"))), false);
  assert.equal(existsSync(join(root, fr.FRICTION_FILE)), false);
  assert.equal(evidence(root, "T-M1-01").status, "done");
  // a note the friction log cannot hold is refused before anything is written
  assert.throws(() => rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["framework"], area: "task:merge", note: "a · b" }), /must not contain/);
  assert.equal(existsSync(join(root, rv.reviewsPath("T-M1-01"))), false);
  assert.equal(existsSync(join(root, fr.FRICTION_FILE)), false);

  const got = rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["framework", "docs"], area: "task:merge", note: "merge needs a hand step" });
  assert.equal(got.friction, "F-001");
  const { entries, issues } = fr.parseFriction(readFileSync(join(root, fr.FRICTION_FILE), "utf8"));
  assert.deepEqual(issues, []);
  const [e] = entries;
  assert.deepEqual([e.id, e.kind, e.card, e.area, e.date, e.status], ["F-001", "review-bounce", "T-M1-01", "task:merge", "2026-03-04", "open"]);
  assert.equal(e.evidence, "review round 1 of T-M1-01: merge needs a hand step");
  // the CLI prints the friction id; no note → evidence without a colon
  const out = cli(root, "task", "review", "T-M1-01", "fail", "--kind", "framework", "--area", "task:verify");
  assert.equal(out.status, 1, "the card is reopened and not verified again: refused");
  await task.verifyCard(ctx, "T-M1-01");
  const ok = cli(root, "task", "review", "T-M1-01", "fail", "--kind", "framework", "--area", "task:verify");
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /friction F-002 recorded/);
  assert.equal(fr.parseFriction(readFileSync(join(root, fr.FRICTION_FILE), "utf8")).entries[1].evidence, "review round 2 of T-M1-01");
});

test("REVIEW-AC-06 the report shows 2 (1 fail), 1 (0 fail) and — per card, and the totals line (en and th)", async () => {
  for (const [lang, cellFail, totals, head] of [
    ["en", "2 (1 fail)", "reviews: 2 card(s) reviewed · 1 passed first time · 3 round(s) in total", "| Reviews |"],
    ["th", "2 (ตก 1)", "รีวิว: ตรวจแล้ว 2 การ์ด · ผ่านตั้งแต่ครั้งแรก 1 · รวม 3 รอบ", "| รีวิว |"],
  ]) {
    const { root, config } = await planRepo({ cards: CARDS, config: { people: { docLanguage: lang } } });
    const ctx = withNow(root, config);
    await passed(ctx, "T-M1-01", "src/a.ts");
    rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["docs"] });
    await task.verifyCard(ctx, "T-M1-01");
    rv.recordReview(ctx, "T-M1-01", "pass");
    await passed(ctx, "T-M1-02", "lib/b.ts");
    rv.recordReview(ctx, "T-M1-02", "pass");
    await passed(ctx, "T-M1-03", "docs/c.md");
    const md = () => renderReport({ plan: loadPlan(root, config), files: listRepoFiles(root), read: (rel) => readFileSync(join(root, rel), "utf8") }, "M1");
    const rows = md().split("\n");
    const row = (id) => rows.find((l) => l.startsWith(`| ${id} `));
    assert.ok(rows.some((l) => l.endsWith(head)), "the column header");
    assert.ok(row("T-M1-01").endsWith(`| ${cellFail} |`), row("T-M1-01"));
    assert.ok(row("T-M1-02").endsWith(lang === "en" ? "| 1 (0 fail) |" : "| 1 (ตก 0) |"), row("T-M1-02"));
    assert.ok(row("T-M1-03").endsWith("| — |"), row("T-M1-03"));
    assert.equal(rows.filter((l) => l === totals).length, 1, `the totals line (${lang})`);
    assert.ok(rows.indexOf(totals) > rows.indexOf(row("T-M1-03")), "below the table");
    // a file that cannot be read shows ? and is left out of the totals
    writeFileSync(join(root, rv.reviewsPath("T-M1-02")), "{ broken\r\n");
    const broken = md().split("\n");
    assert.ok(broken.find((l) => l.startsWith("| T-M1-02 ")).endsWith("| ? |"));
    assert.equal(broken.some((l) => l.includes(lang === "en" ? "1 card(s) reviewed" : "ตรวจแล้ว 1 การ์ด")), true);
  }
});

test("REVIEW-AC-07 task:start --restart and task:abandon leave the reviews file unchanged", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  await passed(ctx, "T-M1-01", "src/a.ts");
  rv.recordReview(ctx, "T-M1-01", "fail", { kinds: ["out-of-scope"] });
  const file = join(root, rv.reviewsPath("T-M1-01"));
  const before = readFileSync(file, "utf8");
  task.startCard(ctx, "T-M1-01", { restart: true });
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(evidence(root, "T-M1-01").attempts, 0, "restart did restart the card");
  task.abandonCard(ctx, "T-M1-01");
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(existsSync(join(root, task.evidencePath("T-M1-01"))), false);
});

test("REVIEW-AC-01 the CLI exits 0 when recorded, 1 when refused, 2 for a wrong shape; no result lists the rounds; a CRLF reviews file is read, an unreadable one refused", async () => {
  const { root, config } = await planRepo({ cards: CARDS });
  const ctx = withNow(root, config);
  await passed(ctx, "T-M1-01", "src/a.ts");
  for (const args of [[], ["T-M1-01", "maybe"], ["T-M1-01", "pass", "--bogus", "x"], ["T-M1-01", "fail", "--kind"], ["T-M1-01", "pass", "--kind=docs"], ["T-M1-01", "--note", "x"]]) {
    const r = cli(root, "task", "review", ...args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, /usage: .*task:?\s?review/);
  }
  assert.equal(existsSync(join(root, rv.reviewsPath("T-M1-01"))), false);
  assert.match(cli(root, "task", "review", "T-M1-01").stdout, /no review rounds for T-M1-01 yet/);
  assert.equal(cli(root, "task", "review", "T-M1-01", "fail").status, 1, "a fail without kind is refused, not a usage error");
  assert.equal(cli(root, "task", "review", "T-M9-99").status, 1);
  const ok = cli(root, "task", "review", "T-M1-01", "pass", "--note", "looks right");
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /review round 1: pass/);
  assert.match(ok.stdout, /not committed — commit it alone: git commit -m "chore\(plan\): review T-M1-01 round 1" -- docs\/plan\/evidence\/reviews\/T-M1-01\.json/);
  assert.match(cli(root, "task", "review", "T-M1-01").stdout, /^round 1 · pass · .* · commit [0-9a-f]{7} · looks right/m);
  const file = join(root, rv.reviewsPath("T-M1-01"));
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
  assert.equal(rv.recordReview(ctx, "T-M1-01", "pass").round, 2, "CRLF file accepted");
  writeFileSync(file, "{ not json");
  const bad = cli(root, "task", "review", "T-M1-01", "pass");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /T-M1-01\.json: JSON is not readable/);
  assert.equal(readFileSync(file, "utf8"), "{ not json", "the unreadable file is left as it is");
});
