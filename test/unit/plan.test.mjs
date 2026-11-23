import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanup, lib, planRepo, write } from "../helpers.mjs";

const { loadPlan, parseCard, nextCards, activeMilestone, renderState, sessionContext } = await lib("plan.mjs");
const { pickParallel } = await lib("parallel.mjs");
const { resolveConfig } = await lib("config.mjs");
after(cleanup);

test("parseCard: id, folder, touch and criteria are required; role must be enabled", () => {
  const ok = parseCard("---\nid: T-M1-01\nmilestone: M1\ntitle: t\nrole: implementer\ntouch:\n  - src/**\n---\n## Done when\n- `npm test`\n- echo hi # comment\n", "docs/plan/tasks/M1/T-M1-01.md", ["implementer"]);
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.card.criteria, ["npm test", "echo hi"]);
  const th = parseCard("---\nid: T-M1-01\nmilestone: M1\ntitle: t\ntouch: [src/**]\n---\n## เกณฑ์ผ่าน\n- `true`\n", "docs/plan/tasks/M1/T-M1-01.md", null);
  assert.deepEqual(th.issues, []);
  const bad = parseCard("---\nid: T-M1-1\nmilestone: M2\ntitle: \nrole: wizard\n---\n", "docs/plan/tasks/M1/T-M1-02.md", ["implementer"]);
  assert.ok(bad.issues.length >= 5, bad.issues.join("\n"));
});

test("loadPlan validates milestone lists, dependencies and evidence", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01" }, { id: "T-M1-02", depends: ["T-M1-01"] }] });
  let plan = loadPlan(root, config);
  assert.deepEqual(plan.issues, []);
  assert.equal(activeMilestone(plan).id, "M1");
  assert.deepEqual(nextCards(plan, activeMilestone(plan)), ["T-M1-01"]);
  write(root, "docs/plan/tasks/M1/T-M1-03.md", "---\nid: T-M1-03\nmilestone: M1\ntitle: x\ntouch: [a]\ndepends: [T-M9-01]\n---\n## Done when\n- `true`\n");
  write(root, "docs/plan/evidence/T-M1-77.json", { id: "T-M1-77", status: "done" });
  plan = loadPlan(root, config);
  assert.ok(plan.issues.some((i) => i.includes("not listed in cards of M1")));
  assert.ok(plan.issues.some((i) => i.includes("T-M9-01")));
  assert.ok(plan.issues.some((i) => i.includes("T-M1-77")));
});

test("parallel picker: touch overlap, caps, main-folder roles", async () => {
  const { root, config } = await planRepo({
    config: { workflow: { lanes: { code: 2, main: 1 } } },
    cards: [
      { id: "T-M1-01", touch: ["src/a/**"] },
      { id: "T-M1-02", touch: ["src/a/x.ts"] },
      { id: "T-M1-03", touch: ["src/b/**"] },
      { id: "T-M1-04", touch: ["src/c/**"] },
      { id: "T-M1-05", touch: ["docs/specs/**"], role: "designer" },
      { id: "T-M1-06", touch: ["docs/x/**"], role: "designer" },
    ],
  });
  const plan = loadPlan(root, config);
  const r = pickParallel(plan, activeMilestone(plan));
  assert.deepEqual(r.parallel.code, ["T-M1-01", "T-M1-03"]);
  assert.deepEqual(r.parallel.main, ["T-M1-05"]);
  const why = Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));
  assert.match(why["T-M1-02"], /T-M1-01/);
  assert.ok(why["T-M1-04"] && why["T-M1-06"]);
  const off = pickParallel(loadPlan(root, resolveConfig({ ...config, workflow: { ...config.workflow, worktrees: false } })), activeMilestone(plan));
  assert.deepEqual(off.parallel.code, []);
  assert.deepEqual(off.parallel.main, ["T-M1-01"], "lanes off → every card works in the main folder, one at a time");
});

test("STATE and session text render in both languages", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", title: "first" }] });
  const en = loadPlan(root, config);
  assert.match(renderState(en), /cards done 0\/1/);
  assert.match(sessionContext(en, () => ""), /next: T-M1-01 first/);
  const th = loadPlan(root, resolveConfig({ ...config, people: { docLanguage: "th" } }));
  assert.match(sessionContext(th, () => ""), /ถัดไป: T-M1-01 first/);
});
