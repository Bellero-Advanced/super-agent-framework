import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanup, lib, planRepo, write } from "../helpers.mjs";

const planMod = await lib("plan.mjs");
const reportMod = await lib("report.mjs");
const textMod = await lib("text.mjs");
const tm = await lib("testmode.mjs");
after(cleanup);

const CARD = { id: "T-M1-01", touch: ["src/**"], criteria: ["true"] };
const DECLARED = [{ id: "g1", text: "declared gate", run: ["true"] }];

/** A repo in the given doc language; `gates` = the milestone evidence gates (none = no evidence file). */
async function setup(lang, gates) {
  const { root, config } = await planRepo({ config: { people: { docLanguage: lang } }, cards: [CARD], gates: DECLARED });
  if (gates) write(root, "docs/plan/evidence/M1.json", { id: "M1", kind: "milestone", verified: { at: "2026-01-02T03:04:05.000Z", head: "abcdef1234567", testMode: "milestone", deferredCards: [], gates } });
  const plan = planMod.loadPlan(root, config);
  return { plan, state: planMod.renderState(plan), mirror: planMod.renderMirror(plan), report: reportMod.renderReport({ plan, files: [], read: () => "" }, "M1") };
}

const EVIDENCE = [
  { id: "g1", pass: true, commands: [] },
  { id: "full-suite", pass: false, commands: [] },
  { id: "old", pass: true, commands: [] },
];

for (const lang of ["en", "th"]) {
  test(`TMODE-AC-16 (${lang}) STATE.md, .saf/plan.md and the report show full-suite failed and the undeclared gate`, async () => {
    const t = textMod.textFor(lang);
    const { state, mirror, report } = await setup(lang, EVIDENCE);
    for (const view of [state, report]) {
      const rows = view.split("\n").filter((l) => l.startsWith("| full-suite |") || l.startsWith("| old |"));
      assert.equal(rows.length, 2);
      assert.equal(rows[0], `| full-suite | ${t.fullSuiteGate} | ${t.gateFail} |`);
      assert.ok(rows[1].startsWith(`| old | ${t.undeclaredGate} | `));
    }
    assert.ok(state.split("\n").some((l) => l.startsWith(`| old | ${t.undeclaredGate} | ✓ `)));
    assert.ok(report.includes(`| old | ${t.undeclaredGate} | ✓ |`));
    assert.ok(mirror.includes(`- [ ] full-suite ${t.fullSuiteGate}`));
    assert.ok(mirror.includes(`- [x] old ${t.undeclaredGate}`));
    assert.ok(state.indexOf("| g1 |") < state.indexOf("| full-suite |"), "declared gates come first");
    assert.ok(mirror.indexOf("g1 declared gate") < mirror.indexOf("full-suite"), "declared gates come first");
  });

  test(`TMODE-AC-16 (${lang}) with no milestone evidence only the declared gates show`, async () => {
    const { plan, state, mirror, report } = await setup(lang, null);
    for (const view of [state, mirror, report]) {
      assert.ok(!view.includes("full-suite") && !view.includes("old"));
      assert.ok(view.includes("g1"));
    }
    assert.deepEqual(planMod.undeclaredGates(plan, plan.milestones[0]), []);
  });
}

test("TMODE-AC-16 FULL_SUITE_GATE.text reads the en entry of the text table", () => {
  assert.equal(tm.FULL_SUITE_GATE.text, textMod.TEXT.en.fullSuiteGate);
  assert.notEqual(textMod.TEXT.th.fullSuiteGate, textMod.TEXT.en.fullSuiteGate);
});

test("TMODE-AC-16 undeclaredGates keeps evidence order and marks a manual result", async () => {
  const { plan } = await setup("en", [{ id: "zed", pass: null }, { id: "full-suite", pass: true }, { id: "g1", pass: true }]);
  const got = planMod.undeclaredGates(plan, plan.milestones[0]);
  assert.deepEqual(got.map((g) => g.id), ["zed", "full-suite"]);
  assert.deepEqual(got.map((g) => g.pass), [null, true]);
});
