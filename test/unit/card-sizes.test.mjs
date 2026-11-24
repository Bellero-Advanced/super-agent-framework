import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, card, cleanup, commitAll, fakeCtx, gitRepo, lib, planRepo, write } from "../helpers.mjs";

/** Card sizes M and L, the hard stop, legacy S, rendered caps (docs/specs/card-sizes.md rules 1-16, scenarios SIZE-AC-01..09). */
const cfgLib = await lib("config.mjs");
const { HARD_STOP_FACTOR, RIGOR, SIZE_CAPS, EFFORT_BY_SIZE, countedSize, legacySizeLine, resolveConfig, validateConfig, variantNames } = cfgLib;
const { cardEffort } = await lib("effort.mjs");
const task = await lib("task.mjs");
const fr = await lib("friction.mjs");
const { loadPlan, parseCard } = await lib("plan.mjs");
const { generate } = await lib("generate.mjs");
const { LABELS } = await lib("choices.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
const lines = (n) => `${Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")}\n`;
const BASE = { stack: { packageManager: "none" } };
const evidence = (root, id) => JSON.parse(readFileSync(join(root, task.evidencePath(id)), "utf8"));
const ID = "T-M1-01";
/** A started card in a fresh plan repo, a ctx that records what it logs and what it ran. */
async function started(over = {}, config = {}) {
  const { root, config: cfg } = await planRepo({ config, cards: [{ id: ID, touch: ["src/**", "test/**"], ...over }] });
  if (over.size === "L") {
    // rule 19: an L card lists its steps (the plan check refuses it otherwise)
    const file = `docs/plan/tasks/M1/${ID}.md`;
    write(root, file, readFileSync(join(root, file), "utf8").replace("## Done when", "## Steps\n\n1. first step\n2. second step\n\n## Done when"));
    commitAll(root, "L card steps");
  }
  const ctx = fakeCtx(root, cfg, { logged: [] });
  ctx.log = (s) => ctx.logged.push(s);
  task.startCard(ctx, ID);
  return { root, ctx, cfg };
}
const stopLine = (size, parts) => `  ✗ ${ID} is over the hard stop (${size}): ${parts} changed lines (${HARD_STOP_FACTOR} × the cap) — no command ran; the designer splits the card`;

test("SIZE-AC-01 the size table holds D-021's values and every rigor resolves to it; the new shape wins, the old { S, M } shape is ignored and listed", () => {
  assert.deepEqual(SIZE_CAPS, { M: { code: 800, test: 600 }, L: { code: 1600, test: 1200 } });
  assert.equal(HARD_STOP_FACTOR, 2);
  for (const rigor of Object.keys(RIGOR)) {
    assert.ok(!("sizes" in RIGOR[rigor]) && !("testCaps" in RIGOR[rigor]), `${rigor}: RIGOR keeps review and merge only`);
    const c = resolveConfig({ ...BASE, project: { rigor } });
    assert.deepEqual(c.workflow.sizes, { M: 800, L: 1600 }, rigor);
    assert.deepEqual(c.workflow.testCaps, { M: 600, L: 1200 }, rigor);
    assert.deepEqual(c.workflow.sizesLegacy, [], rigor);
  }
  const over = { workflow: { sizes: { M: 10, L: 20 } } };
  assert.deepEqual(validateConfig(over), []);
  assert.deepEqual(resolveConfig(over).workflow.sizes, { M: 10, L: 20 });
  const old = { workflow: { sizes: { S: 150, M: 400 }, testCaps: { S: 250, M: 600 } } };
  assert.deepEqual(validateConfig(old), [], "the old shape stays schema-valid");
  const c = resolveConfig(old);
  assert.deepEqual([c.workflow.sizes, c.workflow.testCaps], [{ M: 800, L: 1600 }, { M: 600, L: 1200 }]);
  assert.deepEqual(c.workflow.sizesLegacy, ["sizes", "testCaps"]);
  assert.ok(validateConfig({ workflow: { sizes: { M: 10 } } }).length, "one key alone is a config error");
  assert.ok(validateConfig({ workflow: { testCaps: { M: 0, L: 5 } } }).length, "a zero is a config error");
  const root = gitRepo();
  write(root, "saf.config.json", { version: 1, ...old });
  const r = cli(root, "config", "--check");
  assert.equal(r.status, 0, r.stderr);
  for (const key of ["sizes", "testCaps"]) assert.ok(r.stdout.includes(legacySizeLine(key)), r.stdout);
  assert.ok(legacySizeLine("sizes").startsWith("! workflow.sizes uses the retired S/M shape and is ignored — the size table applies"));
});

test("SIZE-AC-02 an M card one line above the cap, then exactly at the hard stop, passes with over and the rule-6 line", async () => {
  const { M } = SIZE_CAPS;
  const a = await started();
  write(a.root, "src/a.js", lines(M.code + 1));
  const r = await task.verifyCard(a.ctx, ID);
  assert.equal(r.status, "done");
  assert.deepEqual([r.verified.size.over, r.verified.size.stopped, r.verified.size.code.stop], [["code"], [], M.code * HARD_STOP_FACTOR]);
  assert.ok(a.ctx.logged.includes(`  ⚠ ${ID} is over the size cap (M): code ${M.code + 1} > ${M.code} changed lines — not a failure up to ${HARD_STOP_FACTOR} × the cap; the reviewer decides (or the designer splits the card)`));
  const b = await started();
  write(b.root, "src/a.js", lines(M.code * HARD_STOP_FACTOR));
  const s = await task.verifyCard(b.ctx, ID);
  assert.equal(s.status, "done", "exactly at the stop is a warning, not a stop");
  assert.deepEqual([s.verified.size.over, s.verified.size.stopped], [["code"], []]);
  const c = await started();
  write(c.root, "src/a.js", lines(M.code));
  assert.deepEqual((await task.verifyCard(c.ctx, ID)).verified.size.over, [], "exactly at the cap is no warning");
});

test("SIZE-AC-03 above a hard stop no command runs, the attempt is recorded as failed, the rule-7 line is printed, and the CLI exits 1", async () => {
  const marker = `node -e "require('fs').writeFileSync('marker.txt','x')"`;
  const { M, L } = SIZE_CAPS;
  const a = await started({ criteria: [marker] });
  write(a.root, "src/a.js", lines(M.code * HARD_STOP_FACTOR + 1));
  const r = await task.verifyCard(a.ctx, ID);
  assert.deepEqual(a.ctx.ran, [], "no command ran");
  assert.ok(!existsSync(join(a.root, "marker.txt")));
  assert.deepEqual([r.status, r.attempts, r.verified.commands, r.verified.size.stopped], ["failed", 1, [], ["code"]]);
  assert.ok(a.ctx.logged.includes(stopLine("M", `code ${M.code * HARD_STOP_FACTOR + 1} > ${M.code * HARD_STOP_FACTOR}`)), a.ctx.logged.join("\n"));
  assert.deepEqual(evidence(a.root, ID).verified.size.stopped, ["code"]);
  const b = await started({ size: "L", criteria: [marker] });
  write(b.root, "test/a.test.js", lines(L.test * HARD_STOP_FACTOR + 1));
  const s = await task.verifyCard(b.ctx, ID);
  assert.deepEqual([s.status, s.verified.commands, s.verified.size.stopped, b.ctx.ran], ["failed", [], ["test"], []]);
  assert.ok(b.ctx.logged.includes(stopLine("L", `test ${L.test * HARD_STOP_FACTOR + 1} > ${L.test * HARD_STOP_FACTOR}`)));
  // a project value { M: 5, L: 10 } makes 11 code lines a stop; the CLI shows the line and exits 1
  const { root } = await planRepo({ config: { workflow: { sizes: { M: 5, L: 10 } } }, cards: [{ id: ID, touch: ["src/**"] }] });
  assert.equal(cli(root, "task", "start", ID).status, 0);
  write(root, "src/a.js", lines(11));
  const run = cli(root, "task", "verify", ID);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok((run.stdout + run.stderr).includes(stopLine("M", "code 11 > 10")));
  assert.ok(!run.stdout.includes("▶ true") && !run.stderr.includes("▶ true"), "the criteria did not run");
  assert.equal(evidence(root, ID).status, "failed");
});

test("SIZE-AC-04 a legacy S card and a card without size are valid, counted as M with the note, and the card files stay as written", async () => {
  assert.deepEqual([countedSize({ size: "S" }), countedSize({}), countedSize({ size: "L" })], [{ size: "M", note: "legacy S counted as M" }, { size: "M", note: "no size — counted as M" }, { size: "L" }]);
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", size: "S", touch: ["src/**"] }, { id: "T-M1-02", size: "", touch: ["lib/**"] }] });
  assert.equal(cli(root, "task", "state", "--check").status, 0);
  const text = (id) => readFileSync(join(root, `docs/plan/tasks/M1/${id}.md`), "utf8");
  const [s1, s2] = [text("T-M1-01"), text("T-M1-02")];
  const out1 = cli(root, "task", "start", "T-M1-01");
  assert.match(out1.stdout, /size M \(legacy S counted as M\)/);
  const ctx = fakeCtx(root, config, { logged: [] });
  ctx.log = (l) => ctx.logged.push(l);
  write(root, "src/a.js", lines(151));
  const r = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(r.status, "done");
  assert.deepEqual([r.verified.size.size, r.verified.size.note, r.verified.size.over, r.verified.size.code.cap], ["M", "legacy S counted as M", [], SIZE_CAPS.M.code]);
  assert.ok(!ctx.logged.some((l) => /size cap/.test(l)));
  commitAll(root, "work");
  const out2 = cli(root, "task", "start", "T-M1-02");
  assert.match(out2.stdout, /size M \(no size — counted as M\)/);
  assert.deepEqual([text("T-M1-01"), text("T-M1-02")], [s1, s2], "no card file is rewritten");
  assert.equal(loadPlan(root, config).cards.get("T-M1-01").size, "S", "the plan still reads S");
});

test("SIZE-AC-04 a card without a role gets the size line only when counted size has a note; a legacy caps value is named by verify", async () => {
  for (const [size, note] of [["S", "legacy S counted as M"], ["", "no size — counted as M"], ["M", null]]) {
    const { root } = await planRepo({ cards: [{ id: ID, size, role: "", touch: ["src/**"] }] });
    const out = cli(root, "task", "start", ID).stdout;
    assert.equal(out.split("\n").includes(`  size M (${note})`), !!note, `${JSON.stringify(size)}: ${out}`);
    assert.ok(!out.includes("  agent "), "no role, no agent line");
  }
  const { root, config } = await planRepo({ config: { workflow: { sizes: { S: 150, M: 400 } } }, cards: [{ id: ID, touch: ["src/**"] }] });
  const ctx = fakeCtx(root, config, { logged: [] });
  ctx.log = (l) => ctx.logged.push(l);
  task.startCard(ctx, ID);
  await task.verifyCard(ctx, ID);
  assert.ok(ctx.logged.includes(`  ${legacySizeLine("sizes")}`), ctx.logged.join("\n"));
});

test("SIZE-AC-03 a size above the hard stop only after the commands ran fails the card with the closing line", async () => {
  const { root, ctx } = await started();
  ctx.run = async (cmd) => {
    write(root, "src/big.js", lines(SIZE_CAPS.M.code * HARD_STOP_FACTOR + 1));
    return { cmd, exit: 0, ms: 1, tail: [] };
  };
  const r = await task.verifyCard(ctx, ID);
  assert.deepEqual([r.status, r.verified.commands.length, r.verified.size.stopped], ["failed", 1, ["code"]]);
  assert.ok(ctx.logged.includes(`  ✗ ${ID} is over the hard stop (M): code ${SIZE_CAPS.M.code * HARD_STOP_FACTOR + 1} > ${SIZE_CAPS.M.code * HARD_STOP_FACTOR} changed lines (${HARD_STOP_FACTOR} × the cap) — the card fails; the designer splits the card`), ctx.logged.join("\n"));
});

test("SIZE-AC-05 a planned milestone refuses S, no size and XL with the rule-10 texts; M, L, a started S card and a done milestone's S card are valid", async () => {
  const f = (m, n) => `docs/plan/tasks/${m}/T-${m}-0${n}.md`;
  const mk = (n, size, extra = {}) => ({ id: `T-M2-0${n}`, size, touch: ["src/**"], ...extra });
  const { root, config } = await planRepo({
    cards: [{ id: "T-M1-01", touch: ["x/**"] }, { id: "T-M3-01", size: "S", touch: ["z/**"] }],
    extra: [{ id: "M2", status: "planned", cards: [1, 2, 3, 4, 5, 6].map((n) => `T-M2-0${n}`) }, { id: "M3", status: "done", cards: ["T-M3-01"] }],
  });
  for (const c of [mk(1, "S"), mk(2, ""), mk(3, "XL"), mk(4, "M"), mk(5, "L"), mk(6, "S")]) write(root, f("M2", c.id.slice(-1)), card(c));
  write(root, "docs/plan/evidence/T-M2-06.json", { id: "T-M2-06", status: "failed", attempts: 1, started: { base: "0".repeat(40) } });
  const issues = loadPlan(root, config).issues.filter((i) => /size/.test(i));
  assert.deepEqual(issues, [
    `${f("M2", 1)}: size S is retired — use M or L (docs/specs/card-sizes.md)`,
    `${f("M2", 2)}: needs size M or L`,
    `${f("M2", 3)}: size must be M or L (bigger than L → split the card)`,
  ]);
});

test("SIZE-AC-06 cardEffort follows the counted size: M medium, L high for implementer and designer; S and no size are M; the variant set is unchanged", () => {
  const c = resolveConfig({ ...BASE, models: { effort: "by-size" } });
  const agent = (role, size) => cardEffort(c, { role, size }).agent;
  assert.deepEqual([agent("implementer", "M"), agent("implementer", "L")], ["implementer-medium", "implementer"]);
  assert.deepEqual([agent("designer", "M"), agent("designer", "L")], ["designer-medium", "designer"]);
  for (const role of ["implementer", "designer"]) for (const size of ["S", undefined]) assert.equal(agent(role, size), agent(role, "M"), `${role} ${size}`);
  assert.equal(cardEffort(c, { role: "implementer", size: "L" }).effort, "high");
  assert.deepEqual(variantNames(c.roles.enabled, {}).map((v) => v.name).sort(), ["designer-medium", "implementer-medium"]);
  for (const row of Object.values(EFFORT_BY_SIZE)) assert.deepEqual(Object.keys(row).sort(), ["L", "M"]);
});

test("SIZE-AC-07 a self-fix card must have counted size M: L is one issue, S stays valid; the friction draft says size: M", async () => {
  const log = `# Friction log\n\n${fr.FRICTION_MARKER}\n- F-001 · 2026-01-01 · command-failed · - · task:verify · verify crashed · evidence: exit 1\n`;
  const test1 = "test/fix.test.mjs";
  const plan = (size) => {
    const src = card({ id: ID, size, touch: ["src/**", test1], criteria: [`node --test ${test1}`] }).replace("role: implementer\n", "role: implementer\nself_fix: F-001\n");
    return {
      config: resolveConfig({ version: 1, ...BASE, workflow: { selfFix: "on" } }),
      milestones: [{ id: "M1", status: "active", cards: [ID], legacy: {} }],
      cards: new Map([[ID, parseCard(src, `docs/plan/tasks/M1/${ID}.md`).card]]),
      evidence: new Map(),
      friction: fr.parseFriction(log),
    };
  };
  assert.deepEqual([fr.selfFixIssues(plan("M")), fr.selfFixIssues(plan("S"))], [[], []]);
  const l = fr.selfFixIssues(plan("L"));
  assert.equal(l.length, 1, l.join("\n"));
  assert.match(l[0], /size L — a self-fix card is size M/);
  const { root, config } = await planRepo({ cards: [{ id: ID, touch: ["src/**"] }], files: { [fr.FRICTION_FILE]: log } });
  const p = loadPlan(root, config);
  p.config.workflow.selfFix = "on";
  assert.ok(fr.renderDrafts(p).every((d) => /^size: M$/m.test(d)), "every draft says size: M");
});

const RENDERED = ["CLAUDE.md", "docs/plan/README.md", "docs/plan/tasks/_template.md", "docs/DECISIONS.md", ".claude/commands/saf-plan.md", ".claude/agents/designer.md", ".claude/agents/implementer.md", ".claude/agents/spec-reviewer.md", ".claude/rules/plan-files.md", ".claude/rules/tests.md"];
/** The files that also carry the hard stop (the (stop) lines of rule 14). */
const STOP = ["CLAUDE.md", "docs/plan/README.md", "docs/plan/tasks/_template.md", ".claude/commands/saf-plan.md", ".claude/agents/designer.md"];

test("SIZE-AC-08 generate in en and th shows the M and L caps in every line of rule 14, the stop lines also the factor, and says size: M in the card template and T-M0-01", () => {
  const { M, L } = SIZE_CAPS;
  for (const lang of ["en", "th"]) {
    const got = {};
    for (const rigor of ["standard", "strict"]) {
      const root = gitRepo();
      generate(root, { ...BASE, project: { rigor }, people: { docLanguage: lang, chatLanguage: lang } });
      got[rigor] = Object.fromEntries([...RENDERED, "docs/plan/tasks/M0/T-M0-01.md"].map((f) => [f, readFileSync(join(root, f), "utf8")]));
    }
    for (const rigor of Object.keys(got)) for (const [f, text] of Object.entries(got[rigor])) {
      assert.ok(!text.includes("S ≤") && !text.includes("{{"), `${lang} ${rigor} ${f}: no S cap, no placeholder`);
      if (f.endsWith("T-M0-01.md")) continue;
      const caps = f.endsWith("tests.md") ? [M.test, L.test] : [M.code, L.code];
      for (const n of caps) assert.ok(text.includes(String(n)), `${lang} ${rigor} ${f}: shows ${n}`);
      if (STOP.includes(f)) assert.ok(text.includes(`${HARD_STOP_FACTOR} ×`) || text.includes(`${HARD_STOP_FACTOR} เท่า`), `${lang} ${rigor} ${f}: shows the hard stop`);
    }
    for (const f of ["docs/plan/tasks/_template.md", "docs/plan/tasks/M0/T-M0-01.md"]) assert.match(got.strict[f], /^size: M$/m, `${lang} ${f}`);
  }
});

test("SIZE-AC-09 saf choices --group 2 follows every rigor option with the M / L code caps and test caps in the labels of en and th", () => {
  const { M, L } = SIZE_CAPS;
  assert.equal(LABELS.en.sizes, "Card size M / L (changed code lines)");
  assert.equal(LABELS.en.caps, "Test caps M / L (changed test lines)");
  assert.match(LABELS.th.sizes, /^ขนาดการ์ด M \/ L /);
  assert.match(LABELS.th.caps, /^เพดานเทสต์ M \/ L /);
  for (const lang of ["en", "th"]) {
    const out = cli(gitRepo(), "choices", "--group", "2", "--lang", lang).stdout;
    const rows = out.split("\n").filter((l) => l.includes(`${LABELS[lang].sizes}: `));
    assert.equal(rows.length, Object.keys(RIGOR).length, `${lang}: one derived line per rigor option`);
    for (const row of rows) {
      assert.ok(row.includes(`${LABELS[lang].sizes}: ${M.code} / ${L.code}`) && row.includes(`${LABELS[lang].caps}: ${M.test} / ${L.test}`), `${lang}: ${row}`);
      assert.ok(!/\bS \/ M\b/.test(row));
    }
  }
});
