import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, card, fakeCtx, git, gitRepo, lib, planRepo, write } from "../helpers.mjs";

/** L cards in steps (docs/specs/card-sizes.md rules 19-22: SIZE-AC-12, SIZE-AC-13, SIZE-AC-14). */
const task = await lib("task.mjs");
const { generate, planSetup } = await lib("generate.mjs");
const { parseCard, loadPlan, STEPS_HEADINGS, L_MIN_STEPS } = await lib("plan.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
const ID = "T-M1-01";
const REL = `.saf/memory/review/${ID}.diff`;
const FILE = `docs/plan/tasks/M1/${ID}.md`;
const read = (root) => readFileSync(join(root, REL), "utf8");

/** A card whose steps section is `body` (heading `head`), placed before "Done when". */
const withSteps = (size, body, head = "Steps") => card({ id: ID, size, touch: ["src/**"] }).replace("## Done when", `${body === null ? "" : `## ${head}\n\n${body}\n\n`}## Done when`);
const three = "1. alpha part\n2. beta part\n3. gamma part";

test("SIZE-AC-12 card.steps holds the numbered items in order for L, M and Thai-heading cards; a fenced list is not a step list", () => {
  const parse = (src) => parseCard(src, FILE, null);
  assert.deepEqual(parse(withSteps("L", "1. first\n2. second\n   continued line\n- a bullet")).card.steps, ["first", "second"]);
  assert.deepEqual(parse(withSteps("L", "1) one\n2) two", "ขั้นตอน")).card.steps, ["one", "two"]);
  assert.deepEqual(parse(withSteps("M", "1. only one")).card.steps, ["only one"]);
  assert.deepEqual(parse(withSteps("M", null)).card.steps, []);
  assert.deepEqual(parse(withSteps("L", "```\n1. in a fence\n2. also\n```")).card.steps, []);
  assert.deepEqual(STEPS_HEADINGS, ["Steps", "ขั้นตอน"]);
});

test("SIZE-AC-12 a nested numbered list and indented code lines are not steps; CRLF files read the same steps", () => {
  const parse = (src) => parseCard(src, FILE, null).card.steps;
  assert.deepEqual(parse(withSteps("L", "1. Data\n    1. migration\n    2. model\n2. Server\n   1. routes\n3. Screens")), ["Data", "Server", "Screens"]);
  assert.deepEqual(parse(withSteps("L", "    1. code, not a step\n1. real\n2. also real")), ["real", "also real"]);
  assert.deepEqual(parse(withSteps("L", "1. one\n2. two").replace(/\n/g, "\r\n")), ["one", "two"]);
});

test("SIZE-AC-12 an L card with fewer than L_MIN_STEPS steps (one step, no section, only a fenced list) is the rule-19 plan issue; the others are valid", async () => {
  const cards = { "T-M1-01": withSteps("L", "1. a\n2. b"), "T-M1-02": withSteps("L", "1. lonely"), "T-M1-03": withSteps("L", null), "T-M1-04": withSteps("L", "1. ก\n2. ข", "ขั้นตอน"), "T-M1-05": withSteps("M", null), "T-M1-06": withSteps("L", "```\n1. a\n2. b\n```") };
  const { root, config } = await planRepo({ cards: Object.keys(cards).map((id) => ({ id, touch: [`src/${id}/**`] })) });
  for (const [id, src] of Object.entries(cards)) write(root, `docs/plan/tasks/M1/${id}.md`, src.replaceAll(ID, id).replace(/^id: .*$/m, `id: ${id}`));
  const issues = loadPlan(root, config).issues.filter((i) => /Steps/.test(i));
  const line = (n) => `docs/plan/tasks/M1/T-M1-0${n}.md: an L card needs a "## Steps" section with at least ${L_MIN_STEPS} numbered steps`;
  assert.deepEqual(issues, [line(2), line(3), line(6)]);
  assert.equal(cli(root, "task", "state", "--check").status, 1, "task:state --check refuses the plan");
  for (const n of [1, 4, 5]) assert.ok(loadPlan(root, config).cards.has(`T-M1-0${n}`));
});

/** An L card with three steps in a temp repo; the three step commits are made by `work`. */
async function stepRepo(extra = {}) {
  const { root, config } = await planRepo({ ...extra, cards: [{ id: ID, size: "L", touch: ["src/**"] }], files: { "src/a.ts": "a0\n", "src/b.ts": "b0\n", "src/c.ts": "c0\n" } });
  write(root, FILE, withSteps("L", three));
  commitAll(root, "plan steps");
  const ctx = fakeCtx(root, config);
  const ev = task.startCard(ctx, ID, extra.worktree ? { worktree: true } : {});
  return { root: extra.worktree ? join(root, ev.worktree) : root, main: root, config };
}
const sections = (text) => text.split("\n").filter((l) => /^# (step \d|after the last)/.test(l));

test("SIZE-AC-13 step commits split the diff: step 1 and 2 (ending at its fix commit) have a commit, step 3 has none, uncommitted lines come last, each section holds only its own changes", async () => {
  const { root } = await stepRepo();
  write(root, "src/a.ts", "a0\na1\n");
  const s1 = commitAll(root, `feat(M1): ${ID} step 1/3 alpha`);
  write(root, "src/b.ts", "b0\nb1\n");
  commitAll(root, `feat(M1): ${ID} step 2/3 beta`);
  write(root, "src/b.ts", "b0\nb1\nb2 fix\n");
  const s2 = commitAll(root, `fix(M1): ${ID} step 2/3 fix`);
  write(root, "src/c.ts", "c0\nc-loose\n");
  write(root, "src/new.ts", "n\n");
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  const text = read(root);
  const short = (s) => s.slice(0, 7);
  assert.deepEqual(sections(text), [`# step 1/3 alpha part · commit ${short(s1)}`, `# step 2/3 beta part · commit ${short(s2)}`, "# step 3/3 gamma part · no commit", "# after the last step commit"]);
  assert.ok(text.includes(`# steps 1/3 ${short(s1)} · 2/3 ${short(s2)} · 3/3 no commit\n`));
  const at = (re) => text.search(re);
  const body = (from, to) => text.slice(at(from), to === null ? undefined : at(to));
  const first = body(/^# step 1\/3/m, /^# step 2\/3/m);
  const second = body(/^# step 2\/3/m, /^# step 3\/3/m);
  const last = body(/^# after the last/m, null);
  assert.ok(first.includes("+a1") && !first.includes("+b1") && !first.includes("c-loose"));
  assert.ok(second.includes("+b1") && second.includes("+b2 fix") && !second.includes("+a1") && !second.includes("c-loose"));
  assert.ok(!body(/^# step 3\/3/m, /^# after the last/m).includes("diff --git"), "a step without a commit has no diff");
  assert.ok(last.includes("+c-loose") && last.includes("+n") && !last.includes("+a1") && !last.includes("+b1"));
  assert.ok(text.indexOf("# steps 1/3") < text.indexOf("# step 1/3"), "the header line comes before the sections");
});

test("SIZE-AC-13 with all steps committed and a clean tree there is no 'after the last step commit' section; commits of another card or a step number above the count are not step commits", async () => {
  const { root } = await stepRepo();
  write(root, "src/a.ts", "a0\na1\n");
  commitAll(root, `feat(M1): T-M1-011 step 1/3 not this card`);
  write(root, "src/a.ts", "a0\na1\na2\n");
  commitAll(root, `feat(M1): ${ID} step 9/3 too big`);
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  assert.match(read(root), /^# steps: no step commits — whole diff$/m);
  write(root, "src/b.ts", "b0\nb1\n");
  const s1 = commitAll(root, `${ID} step 1/3 a`);
  write(root, "src/c.ts", "c0\nc1\n");
  const s2 = commitAll(root, `${ID} step 2/3 b`);
  write(root, "src/c.ts", "c0\nc1\nc2\n");
  const s3 = commitAll(root, `${ID} step 3/3 c`);
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  const text = read(root);
  assert.equal(sections(text).length, 3, sections(text).join("\n"));
  assert.ok(!text.includes("after the last step commit"));
  assert.ok(text.includes(`# steps 1/3 ${s1.slice(0, 7)} · 2/3 ${s2.slice(0, 7)} · 3/3 ${s3.slice(0, 7)}`));
});

test("SIZE-AC-13 no step commits, or step 2's commit before step 1's: the whole-card diff with the header line of the case", async () => {
  const { root } = await stepRepo();
  write(root, "src/a.ts", "a0\na1\n");
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  const none = read(root);
  assert.match(none, /^# steps: no step commits — whole diff$/m);
  assert.deepEqual(sections(none), []);
  assert.ok(none.includes("diff --git a/src/a.ts b/src/a.ts") && none.includes("+a1"));
  commitAll(root, `${ID} step 2/3 beta first`);
  write(root, "src/b.ts", "b0\nb1\n");
  commitAll(root, `${ID} step 1/3 alpha second`);
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  const wrong = read(root);
  assert.match(wrong, /^# steps: step commits out of order — whole diff$/m);
  assert.deepEqual(sections(wrong), []);
  assert.ok(wrong.includes("+a1") && wrong.includes("+b1"));
});

test("SIZE-AC-13 an M card's file has no steps line and no step sections even when its commits say step; a card without a steps section keeps today's header", async () => {
  const { root, config } = await planRepo({ cards: [{ id: ID, size: "M", touch: ["src/**"] }], files: { "src/a.ts": "a0\n" } });
  task.startCard(fakeCtx(root, config), ID);
  write(root, "src/a.ts", "a0\na1\n");
  commitAll(root, `${ID} step 1/2 x`);
  assert.equal(cli(root, "task", "diff", ID).status, 0);
  const text = read(root);
  assert.ok(!/^# steps/m.test(text) && !/^# step \d/m.test(text) && !text.includes("after the last"));
  assert.match(text, /^# T-M1-01 card T-M1-01\n# base [0-9a-f]{40} · HEAD [0-9a-f]{40}\n# files 1\n# size M: code \d+\/\d+ · test \d+\/\d+ changed lines\n#   src\/a\.ts\n\ndiff --git a\/src\/a\.ts/);
});

test("SIZE-AC-13 a lane card: the step commits live on the lane branch and the sections are built in the worktree", async () => {
  const { root: lane, main } = await stepRepo({ config: { workflow: { lanes: { code: 3, main: 1 } } }, worktree: true });
  write(lane, "src/a.ts", "a0\na1\n");
  const s1 = commitAll(lane, `${ID} step 1/3 alpha`);
  write(lane, "src/b.ts", "b0\nb1\n");
  assert.equal(cli(main, "task", "diff", ID).status, 0);
  const text = read(lane);
  assert.deepEqual(sections(text), [`# step 1/3 alpha part · commit ${s1.slice(0, 7)}`, "# step 2/3 beta part · no commit", "# step 3/3 gamma part · no commit", "# after the last step commit"]);
  assert.equal(git(lane, "log", "--format=%s", "-1"), `${ID} step 1/3 alpha`);
});

const rendered = (language, reviewerDiff) => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "npm" }, people: { docLanguage: language }, tokenSaving: { reviewerDiff } }, { now: new Date("2026-01-02T00:00:00Z") });
  const get = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
  return { template: get("docs/plan/tasks/_template.md"), readme: get("docs/plan/README.md"), designer: get(".claude/agents/designer.md"), implementer: get(".claude/agents/implementer.md"), reviewer: get(".claude/agents/spec-reviewer.md") };
};
/** Body of a `## <heading>` section, up to the next `## `. */
const part = (text, heading) => text.split(/^## /m).find((x) => x.startsWith(heading))?.split("\n").slice(1).join("\n") ?? "";

test("SIZE-AC-14 the card template has the Steps section (en: Steps, th: ขั้นตอน) with the commit subject and the step list", () => {
  for (const [lang, head] of [["en", "Steps"], ["th", "ขั้นตอน"]]) {
    const body = part(rendered(lang, true).template, head);
    assert.ok(body.includes("`<card id> step <k>/<n>") || body.includes("`<รหัสการ์ด> step <k>/<n>"), `${lang}: the commit subject`);
    assert.match(body, /^1\. .+\n2\. /m, `${lang}: a numbered list`);
    assert.match(body, /\bL\b/, `${lang}: says it is required for L`);
  }
});

test("SIZE-AC-14 the plan README (en, th) says what an L card's steps are, how they are committed, resumed and reviewed — with no number from the data table; the reviewer half only when the reviewer gets a diff file", () => {
  for (const lang of ["en", "th"]) {
    const off = rendered(lang, false).readme.replace(/\s+/g, " ");
    assert.match(off, /task:diff/, `${lang}: the command is still named without a reviewer diff`);
    assert.ok(!/section by section|อ่านทีละส่วน/.test(off), `${lang}: no reviewer reading when reviewerDiff is off`);
    assert.match(rendered(lang, true).readme.replace(/\s+/g, " "), /section by section|อ่านทีละส่วน/, `${lang}: reviewer reading when it is on`);
    for (const t of [off, rendered(lang, true).readme]) assert.doesNotMatch(t, /\{\{|\}\}/);
    const text = rendered(lang, true).readme.replace(/\s+/g, " ");
    for (const re of [/## Steps/, /## ขั้นตอน/, /step <k>\/<n>/, /git log --oneline <(start commit|commit เริ่มต้น)>\.\.HEAD/, /task:diff/, /task:verify/]) assert.match(text, re, `${lang}: ${re}`);
    assert.ok(!/at least \d|อย่างน้อย \d/.test(text), `${lang}: no minimum copied from L_MIN_STEPS`);
  }
});

test("SIZE-AC-14 the designer, implementer and spec-reviewer agents each state their step rule; the reviewer's differs with and without a diff file", () => {
  const on = rendered("en", true);
  const off = rendered("en", false);
  assert.match(on.designer, /an L card has a `## Steps` section of numbered steps, each one piece of work a single commit can finish/);
  assert.match(on.implementer, /one commit whose subject contains `<card id> step <k>\/<n>`/);
  assert.match(on.implementer, /resumes at the first step with no such commit.*git log --oneline <start commit>\.\.HEAD/);
  assert.match(part(on.reviewer, "L cards in steps"), /read it section by section, in step order[\s\S]*Name the step of each finding/);
  assert.match(part(off.reviewer, "L cards in steps"), /Check the work step by step[\s\S]*Name the step of each finding/);
  assert.ok(!/section by section/.test(part(off.reviewer, "L cards in steps")), "no diff file, no diff sections");
  for (const t of [on.designer, on.implementer, on.reviewer, off.reviewer]) assert.doesNotMatch(t, /\{\{|\}\}/);
});

test("SIZE-AC-14 docs/card-lifecycle.md has the part 'L cards in steps' with the plan check, the commit subject, resuming and the diff sections, naming L_MIN_STEPS", () => {
  const doc = readFileSync(join(REPO, "docs", "card-lifecycle.md"), "utf8").replace(/\r\n/g, "\n");
  const from = doc.indexOf("### L cards in steps");
  assert.ok(from >= 0, "the part exists");
  const text = doc.slice(from, doc.indexOf("## Specs and scenarios")).replace(/\s+/g, " ");
  for (const re of [/`## Steps`/, /L_MIN_STEPS/, /step <k>\/<n>/, /git log --oneline <start commit>\.\.HEAD/, /# after the last step commit/, /# step <k>\/<n> <text> · commit <short sha>/, /no step commits — whole diff/, /step commits out of order — whole diff/]) assert.match(text, re, String(re));
  assert.ok(doc.indexOf("## Card format") < doc.indexOf("### L cards in steps") && doc.indexOf("### L cards in steps") < doc.indexOf("## Specs and scenarios"), "under Card format");
});

test("SIZE-AC-14 the example's plan README and card template equal the rendering of the templates (so they cannot miss a step text again)", () => {
  const ex = join(REPO, "examples", "todo-api");
  const plan = planSetup(ex, JSON.parse(readFileSync(join(ex, "saf.config.json"), "utf8")));
  for (const rel of ["docs/plan/README.md", "docs/plan/tasks/_template.md"]) {
    const action = plan.actions.find((a) => a.path === rel);
    assert.ok(action, `${rel} is planned`);
    assert.equal(readFileSync(join(ex, rel), "utf8").replace(/\r\n/g, "\n"), action.content.replace(/\r\n/g, "\n"), `${rel} equals its rendering`);
  }
  assert.match(readFileSync(join(ex, "docs/plan/tasks/_template.md"), "utf8"), /^## Steps$/m);
});
