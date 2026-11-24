import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, commitAll, fakeCtx, git, gitRepo, lib, planRepo, write, card } from "../helpers.mjs";

/** Self-fix cards (docs/specs/friction-log.md rules 18-22, scenarios FRIC-AC-10 and FRIC-AC-11). */
const fr = await lib("friction.mjs");
const task = await lib("task.mjs");
const { loadPlan, parseCard } = await lib("plan.mjs");
const { loadConfig, resolveConfig, validateConfig } = await lib("config.mjs");
const { generate } = await lib("generate.mjs");
after(cleanup);

const FILE = fr.FRICTION_FILE;
const TEST = "test/fix.test.mjs";
const ON = { workflow: { selfFix: "on" } };
const NOW = () => new Date("2026-03-04T10:00:00Z");
const LOG = (...lines) => `# Friction log\n\n${fr.FRICTION_MARKER}\n${lines.join("\n")}\n`;
const ENTRY = (n, kind = "command-failed") => `- F-00${n} · 2026-01-01 · ${kind} · - · task:verify · verify crashed · evidence: exit 1 on a clean tree`;
const OPEN = LOG(ENTRY(1));
const CARDED = LOG(ENTRY(1), "- F-001 → carded · 2026-01-02 · T-M1-01");
/** A card file of the helpers with `self_fix:` added. */
const selfFixCard = (over = {}, fix = "F-001") =>
  card({ id: "T-M1-01", touch: ["src/**", TEST], criteria: [`node --test ${TEST}`], ...over }).replace("role: implementer\n", `role: implementer\n${fix ? `self_fix: ${fix}\n` : ""}`);
const parsed = (src, id = "T-M1-01") => parseCard(src, `docs/plan/tasks/M1/${id}.md`).card;

/** A plan object of the shape loadPlan returns, built from card sources. */
function planOf({ selfFix = "on", cards, log = OPEN, milestones = [{ id: "M1", status: "active", cards: cards.map((c) => c.id) }], done = [] }) {
  const config = resolveConfig({ version: 1, stack: { packageManager: "none" }, workflow: selfFix ? { selfFix } : {} });
  return {
    config,
    milestones: milestones.map((m) => ({ legacy: {}, ...m })),
    cards: new Map(cards.map((c) => [c.id, c])),
    evidence: new Map(done.map((id) => [id, { id, status: "done" }])),
    friction: fr.parseFriction(log),
  };
}
const issuesOf = (over) => fr.selfFixIssues(planOf(over));
const one = (over, re) => {
  const got = issuesOf(over);
  assert.equal(got.length, 1, `one issue, got: ${JSON.stringify(got)}`);
  assert.match(got[0], re);
  assert.match(got[0], /T-M1-01/, "names the card");
};

test("FRIC-AC-10 a card meeting every condition of rule 19 has no issue — the entry open, or carded to this card", () => {
  const c = parsed(selfFixCard());
  assert.equal(c.selfFix, "F-001");
  assert.deepEqual(issuesOf({ cards: [c] }), []);
  assert.deepEqual(issuesOf({ cards: [c], log: CARDED }), []);
  assert.equal(fr.SELF_FIX_LIMITS.perMilestone > 0, true, "the cap is a data table value");
});

test("FRIC-AC-10 each broken condition of rule 19 is one issue that names it — setting off, entry, status, kind, size, milestone, test file, cap", () => {
  const c = parsed(selfFixCard());
  one({ cards: [c], selfFix: "off" }, /workflow\.selfFix is "off"/);
  one({ cards: [c], selfFix: null }, /workflow\.selfFix is "off"/);
  one({ cards: [c], log: LOG(ENTRY(2)) }, /F-001.*no entry/);
  one({ cards: [c], log: LOG(ENTRY(1), "- F-001 → fixed · 2026-01-02 · T-M1-09") }, /F-001 is fixed/);
  one({ cards: [c], log: LOG(ENTRY(1), "- F-001 → dropped · 2026-01-02 · not a bug") }, /F-001 is dropped/);
  one({ cards: [c], log: LOG(ENTRY(1), "- F-001 → carded · 2026-01-02 · T-M1-09") }, /F-001 is carded to T-M1-09/);
  one({ cards: [c], log: LOG(ENTRY(1, "workaround")) }, /kind workaround/);
  one({ cards: [c], log: LOG(ENTRY(1, "review-bounce")) }, /kind review-bounce/);
  one({ cards: [parsed(selfFixCard({ size: "M" }))] }, /size M/);
  one({ cards: [c], milestones: [{ id: "M1", status: "planned", cards: ["T-M1-01"] }] }, /milestone M1 is planned/);
  one({ cards: [parsed(selfFixCard({ touch: ["src/**", "docs/x.md"] }))] }, /touch holds no test file/);
  one({ cards: [parsed(selfFixCard({ criteria: ["npm test"] }))] }, /no "Done when" command names/);
  one({ cards: [parsed(selfFixCard({ touch: ["src/**", TEST], criteria: ["node --test test/other.test.mjs"] }))] }, /no "Done when" command names/);
  one({ cards: [parsed(selfFixCard({}, "F-oops"))] }, /self_fix "F-oops" is not an F-<nnn> id/);
});

test("FRIC-AC-10 the cap: the cards over SELF_FIX_LIMITS.perMilestone are issues, the others and other milestones are not", () => {
  const cap = fr.SELF_FIX_LIMITS.perMilestone;
  const ids = Array.from({ length: cap + 1 }, (_, i) => `T-M1-0${i + 1}`);
  const cards = ids.map((id, i) => parsed(selfFixCard({ id }, `F-00${i + 1}`), id));
  const log = LOG(...ids.map((_, i) => ENTRY(i + 1)));
  const got = issuesOf({ cards, log });
  assert.equal(got.length, 1, JSON.stringify(got));
  assert.match(got[0], new RegExp(`${ids[cap]}.*more than ${cap} self-fix card`));
  const fewer = issuesOf({ cards: cards.slice(0, cap), log });
  assert.deepEqual(fewer, []);
});

test("FRIC-AC-10 a self-fix card that is done stays valid after its entry is fixed and its milestone closed; with selfFix off it is an issue", () => {
  const c = parsed(selfFixCard());
  const fixed = LOG(ENTRY(1), "- F-001 → carded · 2026-01-02 · T-M1-01", "- F-001 → fixed · 2026-01-03 · T-M1-01");
  assert.deepEqual(issuesOf({ cards: [c], log: fixed, done: ["T-M1-01"], milestones: [{ id: "M1", status: "done", cards: ["T-M1-01"] }] }), []);
  one({ cards: [c], log: fixed, selfFix: "off" }, /workflow\.selfFix is "off"/);
});

test("FRIC-AC-10 loadPlan puts the issue in the plan — task:state --check and verify refuse it — and a plain card has none", async () => {
  const files = { [FILE]: OPEN, [TEST]: "// test\n" };
  const on = await planRepo({ config: ON, cards: [{ id: "T-M1-01", touch: ["src/**", TEST], criteria: [`node --test ${TEST}`] }], files });
  write(on.root, "docs/plan/tasks/M1/T-M1-01.md", selfFixCard());
  assert.deepEqual(loadPlan(on.root, on.config).issues, []);
  const off = loadConfig(on.root);
  off.workflow.selfFix = "off";
  const bad = loadPlan(on.root, off).issues.filter((i) => i.includes("self_fix"));
  assert.equal(bad.length, 1, JSON.stringify(bad));
  const plain = await planRepo({ config: ON, cards: [{ id: "T-M1-01", touch: ["src/**"] }], files });
  assert.deepEqual(loadPlan(plain.root, plain.config).issues, []);
});

test("FRIC-AC-10 workflow.selfFix defaults to off, accepts on and off, and refuses any other value", () => {
  assert.equal(resolveConfig({ version: 1, stack: { packageManager: "none" } }).workflow.selfFix, "off");
  assert.equal(resolveConfig({ version: 1, stack: { packageManager: "none" }, ...ON }).workflow.selfFix, "on");
  assert.deepEqual(validateConfig({ version: 1, ...ON }), []);
  assert.ok(validateConfig({ version: 1, workflow: { selfFix: "yes" } }).some((e) => e.includes("selfFix")));
});

/** A repo with one self-fix card (entry carded or open), started in the main folder, its work and test written. */
async function selfFixRepo({ log = CARDED, criteria = [`node --test ${TEST}`], lanes = false } = {}) {
  const made = await planRepo({
    config: { ...ON, ...(lanes ? { workflow: { selfFix: "on", lanes: { code: 2, main: 1 } } } : {}) },
    cards: [{ id: "T-M1-01", touch: ["src/**", TEST], criteria }, { id: "T-M1-02", touch: ["lib/**"] }],
    files: { [FILE]: log, [TEST]: "// old\n" },
  });
  write(made.root, "docs/plan/tasks/M1/T-M1-01.md", selfFixCard({ criteria }));
  commitAll(made.root, "self-fix card");
  return made;
}
const log = (root) => readFileSync(join(root, FILE), "utf8");
const ctxOf = (root, config) => fakeCtx(root, config, { now: NOW });
const FIXED = "- F-001 → fixed · 2026-03-04 · T-M1-01\n";

test("FRIC-AC-11 a self-fix card that passes task:verify in the main folder appends F-<nnn> → fixed with today's date and the card id", async () => {
  const { root, config } = await selfFixRepo();
  const ctx = ctxOf(root, config);
  task.startCard(ctx, "T-M1-01");
  write(root, "src/a.mjs", "x\n");
  const before = log(root);
  const ev = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(ev.status, "done");
  assert.equal(log(root), before + FIXED);
  const entry = fr.readFriction(root).entries[0];
  assert.deepEqual([entry.status, entry.closes.at(-1).ref], ["fixed", "T-M1-01"]);
  assert.deepEqual(loadPlan(root, config).issues, [], "the plan stays valid after the entry is fixed");
  const open = await selfFixRepo({ log: OPEN });
  task.startCard(ctxOf(open.root, open.config), "T-M1-01");
  await task.verifyCard(ctxOf(open.root, open.config), "T-M1-01");
  assert.ok(log(open.root).endsWith(FIXED), "an open entry is closed too");
});

test("FRIC-AC-11 a failing verify and a card without self_fix append nothing", async () => {
  const bad = await selfFixRepo({ criteria: [`node --test ${TEST}`, "FAIL"] });
  const ctx = ctxOf(bad.root, bad.config);
  task.startCard(ctx, "T-M1-01");
  const before = log(bad.root);
  assert.equal((await task.verifyCard(ctx, "T-M1-01")).status, "failed");
  assert.equal(log(bad.root), before);
  const plain = await selfFixRepo();
  const pctx = ctxOf(plain.root, plain.config);
  task.startCard(pctx, "T-M1-02");
  write(plain.root, "lib/b.mjs", "y\n");
  const kept = log(plain.root);
  assert.equal((await task.verifyCard(pctx, "T-M1-02")).status, "done");
  assert.equal(log(plain.root), kept);
});

test("FRIC-AC-11 a self-fix lane card appends nothing at verify in the lane; task:merge appends it to the main log; a refused merge appends nothing", async () => {
  const { root, config } = await selfFixRepo({ lanes: true });
  const ctx = ctxOf(root, config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  write(lane, "src/a.mjs", "x\n");
  const before = log(root);
  const laneBefore = log(lane);
  assert.equal((await task.verifyCard(ctxOf(lane, loadConfig(lane)), "T-M1-01")).status, "done");
  assert.equal(log(lane), laneBefore, "nothing appended inside the lane");
  assert.equal(log(root), before, "nothing in the main log yet");
  commitAll(lane, "T-M1-01 work");
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: ["FAIL"] }), (e) => e.exitCode === 5);
  assert.equal(log(root), before, "a failed merge check appends nothing");
  await task.mergeCard(ctx, "T-M1-01", { checks: [] });
  assert.equal(log(root), before + FIXED);
  assert.match(git(root, "log", "-1", "--format=%s"), /merge\(M1\): T-M1-01/);
  assert.deepEqual(loadPlan(root, config).issues, []);
});

test("FRIC-AC-11 a lane card refused before merging (changed after verification) appends nothing", async () => {
  const { root, config } = await selfFixRepo({ lanes: true });
  const ctx = ctxOf(root, config);
  const ev = task.startCard(ctx, "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  write(lane, "src/a.mjs", "x\n");
  await task.verifyCard(ctxOf(lane, loadConfig(lane)), "T-M1-01");
  commitAll(lane, "T-M1-01 work");
  write(lane, "src/late.mjs", "late\n");
  commitAll(lane, "late");
  const before = log(root);
  await assert.rejects(task.mergeCard(ctx, "T-M1-01", { checks: [] }), (e) => e.exitCode === 3);
  assert.equal(log(root), before);
});

const saf = (language, selfFix) => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "none" }, people: { docLanguage: language }, workflow: { selfFix } });
  return readFileSync(join(root, ".claude/commands/saf.md"), "utf8");
};

test("the generated /saf command has the Self-fix section only when workflow.selfFix is on, in en and th, with the steps and the limit", () => {
  for (const language of ["en", "th"]) {
    const off = saf(language, "off");
    assert.doesNotMatch(off, /Self-fix|แก้ตัวเอง|self_fix|selfFix/, `${language}: off shows nothing`);
    assert.doesNotMatch(off, /\{\{|\}\}/);
    const on = saf(language, "on");
    assert.doesNotMatch(on, /\{\{|\}\}/);
    for (const part of [language === "en" ? "Self-fix" : "แก้ตัวเอง", "friction draft", "self_fix", "cards:", "friction close <F-id> carded", "SELF_FIX_LIMITS.perMilestone", "tdd"]) assert.ok(on.includes(part), `${language}: ${part}`);
    assert.match(on, language === "en" ? /waits for `designer` and the owner's Go/ : /รอ `designer` และ Go ของ/, `${language}: rule 22`);
  }
});
