import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, lib, planRepo, write } from "../helpers.mjs";

/**
 * Side lanes: cards listed in `side_cards` of a planned milestone start, verify and merge while the active milestone runs —
 * with the same card rules, but only in capacity the active milestone leaves free, and at most workflow.sideLanes.max at once.
 */
const task = await lib("task.mjs");
const plan = await lib("plan.mjs");
const { pickParallel, startableCards } = await lib("parallel.mjs");
after(cleanup);

const [A, B, C] = ["T-M2-01", "T-M2-02", "T-M2-03"];
const read = (root, f) => readFileSync(join(root, f), "utf8");

/** M1 active with `n` independent code cards · M2 planned, cards [A, B, C], side_cards [A, C] (C waits for T-M1-01). */
function sideRepo({ n = 1, config = {}, sideCards = [A, C], extraCards = [] } = {}) {
  const m1 = Array.from({ length: n }, (_, i) => ({ id: `T-M1-0${i + 1}`, title: `core ${i + 1}`, touch: [`core${i + 1}/**`] }));
  return planRepo({
    config,
    cards: [...m1, ...extraCards, { id: A, title: "landing page", touch: ["site/**"] }, { id: B, title: "launch email", touch: ["mail/**"] }, { id: C, title: "community", touch: ["community/**"], depends: ["T-M1-01"] }],
    extra: [{ id: "M2", status: "planned", cards: [A, B, C], sideCards }],
  });
}
const load = (r) => plan.loadPlan(r.root, r.config);

test("side lanes: plan checks — side_cards must be in cards; a side card may depend only on cards that can start", async () => {
  const ok = await sideRepo();
  assert.deepEqual(load(ok).issues, []);
  assert.deepEqual(load(ok).milestones.find((m) => m.id === "M2").sideCards, [A, C]);
  assert.deepEqual(plan.sideTracks(load(ok)).map((t) => [t.m.id, t.cards]), [["M2", [A, C]]]);

  const outside = await sideRepo({ sideCards: [A, "T-M2-09"] });
  assert.ok(load(outside).issues.some((i) => /side_cards lists T-M2-09, which is not in cards of M2/.test(i)));

  const r = await planRepo({
    cards: [{ id: "T-M1-01" }, { id: A, depends: [B] }, { id: B }],
    extra: [{ id: "M2", status: "planned", cards: [A, B], sideCards: [A] }],
  });
  assert.ok(load(r).issues.some((i) => i.includes(`side card ${A} depends on ${B}, which cannot start`)));

  const off = await sideRepo({ config: { workflow: { sideLanes: { enabled: false } } } });
  assert.deepEqual(plan.sideTracks(load(off)), []);
  assert.throws(() => task.startCard(fakeCtx(off.root, off.config), A), /not status: active and T-M2-01 is not in its side_cards|only cards of the active milestone/);
});

test("side lanes: the picker walks the active milestone first — side cards only take free capacity, max at a time", async () => {
  const three = await sideRepo({ n: 3 });
  const p3 = load(three);
  const m3 = plan.activeMilestone(p3);
  const r3 = pickParallel(p3, m3);
  assert.deepEqual(r3.parallel.code, ["T-M1-01", "T-M1-02", "T-M1-03"], "active cards fill the code lane first");
  assert.match(r3.skipped.find((s) => s.id === A).reason, /code lane is full/);
  assert.deepEqual(r3.side, [A, C]);
  assert.ok(!JSON.stringify(r3).includes(B), "a card that is not a side card is never offered");

  const two = await sideRepo({ n: 2 });
  const p2 = load(two);
  const r2 = pickParallel(p2, plan.activeMilestone(p2));
  assert.deepEqual(r2.parallel.code, ["T-M1-01", "T-M1-02", A]);
  assert.deepEqual(startableCards(p2, plan.activeMilestone(p2)), ["T-M1-01", "T-M1-02", A], "C waits for T-M1-01");

  const free = await sideRepo({ n: 1, config: { workflow: { sideLanes: { enabled: true, max: 1 } } }, sideCards: [A, B] });
  const pf = load(free);
  const rf = pickParallel(pf, plan.activeMilestone(pf));
  assert.deepEqual(rf.parallel.code, ["T-M1-01", A]);
  assert.match(rf.skipped.find((s) => s.id === B).reason, /side lanes are full \(1 side card/);

  const none = await planRepo({ cards: [{ id: "T-M1-01" }] });
  const pn = load(none);
  assert.deepEqual(pickParallel(pn, plan.activeMilestone(pn)).side, []);
});

test("side lanes: start allowed for a side card, refused otherwise; verify counts it in its own block", async () => {
  const r = await sideRepo({ n: 1 });
  const ctx = fakeCtx(r.root, r.config);
  const clean = git(r.root, "status", "--porcelain");
  assert.throws(() => task.startCard(ctx, B), /M2, which is not status: active and T-M2-02 is not in its side_cards/);
  assert.throws(() => task.startCard(ctx, C), /T-M2-03 waits for T-M1-01/);
  assert.equal(git(r.root, "status", "--porcelain"), clean, "refusals change nothing");

  const ev = task.startCard(ctx, A);
  assert.equal(ev.milestone, "M2");
  assert.throws(() => task.startCard(ctx, "T-M1-01"), /started but has not passed/, "one card per folder, side cards included");
  write(r.root, "site/index.html", "<h1>hi</h1>\n");
  assert.equal((await task.verifyCard(ctx, A)).status, "done");

  const state = read(r.root, "docs/plan/STATE.md");
  assert.match(state, /## M1 milestone M1 — cards done 0\/1/, "the active milestone does not count side cards");
  assert.match(state, /## Side lane M2 milestone M2 — cards done 1\/2/);
  assert.ok(state.indexOf("## M1 milestone M1") < state.indexOf("## Side lane M2"));
  assert.ok(!state.includes("tasks/M2/T-M2-02.md"), "only side cards are listed in the side block");
  assert.match(read(r.root, ".saf/plan.md"), /## Side lane \(M2\)\n- \[x\] T-M2-01 landing page/);
  assert.deepEqual(task.stateCheck(ctx), { issues: [], stale: [] });
});

test("side lanes: max at a time; in a single folder the active milestone keeps priority", async () => {
  const r = await sideRepo({ n: 1, sideCards: [A, B] });
  const ctx = fakeCtx(r.root, r.config);
  task.startCard(ctx, A, { worktree: true });
  assert.throws(() => task.startCard(ctx, B, { worktree: true }), /side lanes are full \(1 at a time\): T-M2-01/);

  const single = await sideRepo({ n: 1, config: { workflow: { worktrees: false } } });
  const sctx = fakeCtx(single.root, single.config);
  assert.throws(() => task.startCard(sctx, A), /main-folder lane is full/, "the active card that can start comes first");
  task.startCard(sctx, "T-M1-01");
  write(single.root, "core1/a.ts", "1\n");
  assert.equal((await task.verifyCard(sctx, "T-M1-01")).status, "done");
  assert.equal(task.startCard(sctx, A).milestone, "M2", "no active card can start → the side card may");
});

test("side lanes: hook, probe and the milestone gate", async () => {
  const r = await sideRepo({ n: 2 });
  const ctx = fakeCtx(r.root, r.config);
  const before = await task.verifyMilestone(ctx, "M1");
  task.startCard(ctx, A);
  const text = task.sessionStartText(ctx);
  assert.match(text, /milestone: M1 milestone M1 · cards done 0\/2/);
  assert.match(text, /side lane M2: done 0\/2 · in progress T-M2-01 · next/);
  assert.match(text, /T-M2-01 landing page \(docs\/plan\/tasks\/M2\/T-M2-01\.md\)/);
  assert.deepEqual(task.probeTarget(load(r)).cards, [{ id: A, title: "landing page" }]);
  assert.equal(task.probeTarget(load(r)).total, 2);
  const gate = await task.verifyMilestone(ctx, "M1");
  assert.deepEqual(gate.openCards, before.openCards, "side cards never count toward the active milestone's gate");
});

test("side lanes: a side card in its own worktree lane verifies and merges like any lane card", async () => {
  const r = await sideRepo({ n: 1 });
  const ctx = fakeCtx(r.root, r.config);
  const ev = task.startCard(ctx, A, { worktree: true });
  assert.equal(ev.lane, 1);
  assert.equal(ev.milestone, "M2");
  const lane = join(r.root, ev.worktree);
  write(lane, "site/index.html", "<h1>hi</h1>\n");
  assert.equal((await task.verifyCard(fakeCtx(lane, r.config), A)).status, "done");
  commitAll(lane, "T-M2-01 work");
  await task.mergeCard(ctx, A, { checks: ["echo ok"] });
  assert.equal(plan.cardStatus(load(r), A), "done");
  assert.ok(!existsSync(lane));
  assert.match(read(r.root, "docs/plan/STATE.md"), /## Side lane M2 milestone M2 — cards done 1\/2/);
  assert.deepEqual(task.stateCheck(ctx), { issues: [], stale: [] });
});
