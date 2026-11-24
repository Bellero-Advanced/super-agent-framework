import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanup, lib, planRepo, write } from "../helpers.mjs";

const planMod = await lib("plan.mjs");
const reportMod = await lib("report.mjs");
const viewerMod = await lib("viewer.mjs");
const { TEXT } = await lib("text.mjs");
const { RUN_LIMITS } = await lib("run.mjs");
after(cleanup);

const CARD = { id: "T-M1-01", touch: ["src/**"], criteria: ["true"] };
const cmd = (c) => ({ cmd: c, exit: 0, ms: 1, tail: [] });
const GATE_AT = "2026-01-02T03:04:05.000Z";
const gateFile = (gates) => ({ id: "M1", kind: "milestone", verified: { at: GATE_AT, head: "abcdef1234567", testMode: "milestone", deferredCards: [], gates } });

/** Plan + the four views of M1 (`gates` = what the milestone evidence file holds; undefined = no file). */
async function views({ lang = "en", gates, declared = [], card } = {}) {
  const { root, config } = await planRepo({ config: { people: { docLanguage: lang } }, cards: [CARD], gates: declared });
  if (gates !== undefined) write(root, "docs/plan/evidence/M1.json", gateFile(gates));
  if (card) write(root, "docs/plan/evidence/T-M1-01.json", card);
  const plan = planMod.loadPlan(root, config);
  const m = plan.milestones[0];
  return {
    plan,
    state: planMod.renderState(plan),
    mirror: planMod.renderMirror(plan),
    report: reportMod.renderReport({ plan, files: [], read: () => "" }, "M1"),
    html: viewerMod.renderEvidencePage(plan, "M1"),
    m,
  };
}

const tableWord = (view, id) => {
  const rows = view.split("\n").filter((l) => l.startsWith(`| ${id} |`));
  assert.equal(rows.length, 1, `${id} has one row`);
  return rows[0].split(" | ").at(-1).replace(/ \|$/, "");
};
const pageWord = (html, id) => {
  const hit = html.match(new RegExp(`<tr><td>${id}</td><td>[^<]*</td><td>([^<]*)</td></tr>`));
  assert.ok(hit, `${id} has a row on the page`);
  return hit[1];
};
const mirrorLine = (mirror, id) => mirror.split("\n").find((l) => l.startsWith(`- [`) && l.includes(`] ${id} `));

const DECLARED = [
  { id: "g-manual", text: "manual gate" },
  { id: "g-nores", text: "no result", run: ["true"] },
  { id: "g-null", text: "null result", run: ["true"] },
  { id: "g-missing", text: "pass missing", run: ["true"] },
  { id: "g-yes", text: "pass yes", run: ["true"] },
  { id: "g-pass", text: "passed gate", run: ["true"] },
  { id: "g-fail", text: "failed gate", run: ["true"] },
];
const GATES = [
  { id: "g-null", pass: null, commands: [cmd("true")] },
  { id: "g-missing", commands: [cmd("true")] },
  { id: "g-yes", pass: "yes", commands: [cmd("true")] },
  { id: "g-pass", pass: true, commands: [cmd("true")] },
  { id: "g-fail", pass: false, commands: [cmd("true")] },
  { id: "u-null", pass: null, commands: [cmd("npm run x")] },
  { id: "u-manual", pass: null, commands: [] },
];

test("VIEW-AC-05 every gate has the same result word in STATE.md, the mirror, the report and the page", async () => {
  const t = TEXT.en;
  const { state, mirror, report, html } = await views({ declared: DECLARED, gates: GATES });
  const want = { "g-manual": t.gateManual, "g-nores": t.gateNotRun, "g-null": t.gateNotRun, "g-missing": t.gateFail, "g-yes": t.gateFail, "g-pass": "✓", "g-fail": t.gateFail, "u-null": t.gateNotRun, "u-manual": t.gateManual };
  for (const [id, word] of Object.entries(want)) {
    assert.equal(pageWord(html, id), word, `page ${id}`);
    assert.equal(tableWord(report, id), word, `report ${id}`);
    const s = tableWord(state, id);
    assert.ok(word === "✓" ? s.startsWith("✓ ") : s === word, `state ${id}: ${s}`);
    const line = mirrorLine(mirror, id);
    assert.ok(line, `mirror ${id}`);
    assert.equal(line.startsWith("- [x]"), id === "g-pass", `mirror tick ${id}`);
    assert.equal(line.endsWith(t.manualSuffix), word === t.gateManual, `mirror manual suffix ${id}`);
  }
});

test("VIEW-AC-05 gateWord and gateResults are the one place that decides", () => {
  const t = TEXT.en;
  const run = ["x"];
  assert.equal(planMod.gateWord(t, { run: [] }, undefined), t.gateManual);
  assert.equal(planMod.gateWord(t, { run }, undefined), t.gateNotRun);
  assert.equal(planMod.gateWord(t, { run }, { pass: null }), t.gateNotRun);
  assert.equal(planMod.gateWord(t, { run }, {}), t.gateFail);
  assert.equal(planMod.gateWord(t, { run }, { pass: 1 }), t.gateFail);
  assert.equal(planMod.gateWord(t, { run }, { pass: true }), "✓");
  assert.deepEqual(planMod.gateResults({ verified: { gates: [{ id: "a" }] } }), [{ id: "a" }]);
  for (const bad of [undefined, null, {}, { verified: {} }, { verified: { gates: {} } }, { verified: { gates: "x" } }]) assert.deepEqual(planMod.gateResults(bad), []);
});

for (const bad of [{}, "x"]) {
  test(`VIEW-AC-06 gates ${JSON.stringify(bad)} never crashes a view and loadPlan names the file`, async () => {
    const t = TEXT.en;
    const { plan, state, mirror, report, html } = await views({ declared: DECLARED.slice(0, 2), gates: bad });
    assert.equal(plan.issues.filter((i) => i.includes("evidence/M1.json")).length, 1);
    for (const [id, word] of [["g-manual", t.gateManual], ["g-nores", t.gateNotRun]]) {
      assert.equal(tableWord(state, id), word);
      assert.equal(tableWord(report, id), word);
      assert.equal(pageWord(html, id), word);
      assert.ok(mirrorLine(mirror, id));
    }
    assert.deepEqual(planMod.undeclaredGates(plan, plan.milestones[0]), []);
  });
}

test("VIEW-AC-06 a 500 line tail shows the last tailFail lines and one left-out line", async () => {
  const tail = Array.from({ length: 500 }, (_, i) => `row-${i}-end`);
  const card = { id: "T-M1-01", status: "done", attempts: 1, started: { at: GATE_AT, base: "abc", dirty: {} }, verified: { at: GATE_AT, head: "abc", pass: true, commands: [{ cmd: "npm t", exit: 0, ms: 1, tail }], files: { changed: [], outside: [], forbidden: [] }, scenarios: { required: [], missing: [] } } };
  const { html } = await views({ card });
  const keep = RUN_LIMITS.tailFail;
  assert.ok(html.includes("row-499-end") && html.includes(`row-${500 - keep}-end`));
  assert.ok(!html.includes(`row-${499 - keep}-end`) && !html.includes("row-0-end"));
  assert.equal(html.split(TEXT.en.viewer.tailOmitted(500 - keep)).length, 2);
});

for (const withEvidence of [true, false]) {
  test(`VIEW-AC-06 th page shows the Thai status word and no backtick outside pre (gate evidence ${withEvidence})`, async () => {
    const th = TEXT.th;
    const { html } = await views({ lang: "th", declared: DECLARED.slice(0, 2), gates: withEvidence ? [] : undefined });
    assert.ok(html.includes(th.viewer.milestone(th.milestoneStatus.active)));
    assert.ok(!html.includes(th.viewer.milestone("active")));
    assert.ok(!html.replace(/<pre>[\s\S]*?<\/pre>/g, "").includes("`"));
    if (!withEvidence) assert.ok(html.includes("<code>"));
  });
}
