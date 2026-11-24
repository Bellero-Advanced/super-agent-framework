import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, git, lib, milestone, planRepo, write } from "../helpers.mjs";

/** Friction triage at milestone end (docs/specs/friction-log.md rules 15-17, scenarios FRIC-AC-08 and FRIC-AC-09). */
const fr = await lib("friction.mjs");
const { loadPlan, parseCard } = await lib("plan.mjs");
const { renderReport } = await lib("report.mjs");
const { listRepoFiles } = await lib("git.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const FILE = fr.FRICTION_FILE;
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
const CARDS = [{ id: "T-M1-01", touch: ["src/**"] }, { id: "T-M1-02", touch: ["lib/**"] }];
const LOG = [
  `# Friction log\n\n${fr.FRICTION_MARKER}`,
  "- F-001 · 2026-01-01 · workaround · - · task:merge · restore by hand · evidence: first hand step",
  "- F-002 · 2026-01-02 · workaround · T-M1-01 · task:merge · restore again · evidence: newest hand step",
  "- F-003 · 2026-01-03 · command-failed · - · task:verify · verify crashed | oddly · evidence: exit 1 on a clean tree",
  "- F-004 · 2026-01-04 · review-bounce · T-M1-02 · docs/plan/README.md · a gap in the guide · evidence: reviewer bounced it",
  "- F-004 → carded · 2026-01-05 · T-M1-02",
  "- F-005 · 2026-01-06 · doc-drift · - · docs/x.md · already fixed · evidence: old text",
  "- F-005 → fixed · 2026-01-07 · T-M1-02",
  "",
].join("\n");
const project = (log = LOG, config = {}) => planRepo({ config, cards: CARDS, files: log === null ? {} : { [FILE]: log } });
const report = (root, config) => renderReport({ plan: loadPlan(root, config), files: listRepoFiles(root), read: (f) => readFileSync(join(root, f), "utf8") }, "M1");
const section = (md) => md.slice(md.indexOf("## Friction"), md.indexOf("## Scenario"));
const row = (text, ...cells) => text.split("\n").find((l) => l.startsWith(`| ${cells.join(" | ")} |`));
const drafts = (root, config, selfFix) => {
  const plan = loadPlan(root, JSON.parse(JSON.stringify(config)));
  if (selfFix) plan.config.workflow.selfFix = selfFix;
  return fr.renderDrafts(plan);
};
const field = (draft, key) => draft.match(new RegExp(`^${key}: (.*)$`, "m"))?.[1];

test("FRIC-AC-08 the report has a Friction section after the gates: open and carded entries listed, finished ones not", async () => {
  const { root, config } = await project();
  const md = report(root, config);
  assert.ok(md.indexOf("## Exit gates") < md.indexOf("## Friction"), "after the gates");
  const s = section(md);
  for (const id of ["F-001", "F-002", "F-003", "F-004"]) assert.ok(s.includes(id), `${id} listed`);
  assert.ok(!s.includes("F-005"), "a fixed entry is not listed");
  assert.match(row(s, "F-004", "carded", "review-bounce", "T-M1-02", "docs/plan/README.md", "a gap in the guide"), /^\|/);
  assert.match(row(s, "F-003", "open", "command-failed", "-", "task:verify", "verify crashed \\| oddly"), /^\|/, "a | in text is escaped");
});

test("FRIC-AC-08 the brief marks the group with two open entries recurring, with its count, ids and newest evidence; the single entry is not recurring", async () => {
  const { root, config } = await project();
  const s = section(report(root, config));
  assert.ok(s.includes("### Brief for the designer"));
  assert.equal(fr.FRICTION_LIMITS.recurring, 2);
  assert.ok(row(s, "workaround", "task:merge", "2", "F-001, F-002", "newest hand step", "recurring"), s);
  const single = row(s, "command-failed", "task:verify", "1", "F-003", "exit 1 on a clean tree", "");
  assert.ok(single && !single.includes("recurring"), s);
  assert.ok(!/\| review-bounce \|/.test(s.split("### Brief for the designer")[1]), "a carded entry is not in the brief");
});

test("FRIC-AC-08 groupFriction groups open entries by kind and area, newest evidence by id order", () => {
  const { entries } = fr.parseFriction(LOG);
  const groups = fr.groupFriction(entries);
  assert.deepEqual(groups.map((g) => [g.kind, g.area, g.count, g.ids, g.evidence, g.recurring]), [
    ["workaround", "task:merge", 2, ["F-001", "F-002"], "newest hand step", true],
    ["command-failed", "task:verify", 1, ["F-003"], "exit 1 on a clean tree", false],
  ]);
});

test("FRIC-AC-08 no file, or no open or carded entry: one line saying so; the Thai report has the section too", async () => {
  const none = await project(null);
  assert.ok(section(report(none.root, none.config)).includes("no friction recorded"));
  const done = await project(`# Friction log\n\n${fr.FRICTION_MARKER}\n${LOG.split("\n")[8]}\n${LOG.split("\n")[9]}\n`);
  assert.ok(section(report(done.root, done.config)).includes("no friction recorded"));
  const th = await project(LOG, { people: { docLanguage: "th", timeZone: "UTC" } });
  const md = report(th.root, th.config);
  assert.ok(md.includes("## Friction (จุดที่ workflow ขวาง)"), "Thai heading");
  assert.ok(md.includes("### Brief for the designer") === false, "Thai brief heading");
  assert.ok(md.includes("F-001") && md.includes("F-002"));
});

test("FRIC-AC-09 task:friction draft prints one draft for the recurring group and writes nothing", async () => {
  const { root } = await project();
  assert.equal(git(root, "status", "--porcelain"), "", "the log is committed");
  const before = readFileSync(join(root, FILE), "utf8");
  const r = cli(root, "task", "friction", "draft");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(root, "status", "--porcelain"), "", "the worktree is unchanged");
  assert.equal(readFileSync(join(root, FILE), "utf8"), before);
  assert.equal(r.stdout.match(/^id: /gm).length, 1, r.stdout);
  assert.equal(field(r.stdout, "id"), "T-M1-??");
  assert.equal(field(r.stdout, "milestone"), "M1");
  assert.equal(field(r.stdout, "size"), "S");
  assert.ok(!r.stdout.includes("self_fix"), "selfFix is off by default");
  assert.match(r.stdout, /## Why[\s\S]*F-001[\s\S]*first hand step[\s\S]*F-002[\s\S]*newest hand step/);
  assert.match(r.stdout, /touch:\n  - TODO/);
  assert.match(r.stdout, /## Done when\n\n- TODO/);
});

test("FRIC-AC-09 with workflow.selfFix on, an open entry of a self-fix kind gets its own draft with self_fix; the others never have it", async () => {
  const { root, config } = await project();
  const list = drafts(root, config, "on");
  assert.equal(list.length, 2);
  const withFix = list.filter((d) => field(d, "self_fix"));
  assert.equal(withFix.length, 1);
  assert.equal(field(withFix[0], "self_fix"), "F-003");
  assert.ok(withFix[0].includes("exit 1 on a clean tree"));
  const group = list.find((d) => !field(d, "self_fix"));
  assert.ok(group.includes("F-001") && group.includes("F-002"));
  assert.ok(!list.some((d) => d.includes("F-004") || d.includes("F-005")), "carded and fixed entries get no draft");
  assert.equal(drafts(root, config).length, 1, "selfFix off: the group only");
  for (const d of list) {
    const lines = d.split("\n");
    assert.equal(lines[0], "---");
    const end = lines.indexOf("---", 1);
    assert.ok(end > 0, "frontmatter closes");
    const { card, issues } = parseCard(d, "docs/plan/tasks/M1/T-M1-??.md", ["implementer"]);
    assert.ok(card || issues.every((i) => /id|T-M/.test(i)), issues.join("\n"));
    assert.match(field(d, "title"), /^".+"$/, "title is quoted");
  }
});

test("FRIC-AC-09 the target milestone is the active one, else the next planned one; no entries: one line, exit 0, nothing written", async () => {
  const { root, config } = await project();
  write(root, "docs/plan/milestones/M1.md", milestone({ id: "M1", status: "done", cards: ["T-M1-01", "T-M1-02"] }));
  write(root, "docs/plan/milestones/M2.md", milestone({ id: "M2", status: "planned", cards: [] }));
  const planned = drafts(root, config);
  assert.equal(field(planned[0], "id"), "T-M2-??");
  assert.equal(field(planned[0], "milestone"), "M2");
  const empty = await project(null);
  const r = cli(empty.root, "task", "friction", "draft");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split("\n").length, 1, r.stdout);
  assert.match(r.stdout, /no draft/);
  assert.equal(git(empty.root, "status", "--porcelain"), "");
  assert.equal(cli(empty.root, "task", "friction", "draft", "extra").status, 2, "extra words are a usage error");
});

test("FRIC-AC-09 a summary with a colon, a quote and a backslash becomes a title that a strict card parse reads back unchanged", () => {
  const summary = 'verify said: "no \\ path" at C:\\tmp';
  const text = `${fr.FRICTION_MARKER}\n- F-001 · 2026-01-01 · doc-drift · - · docs/x.md · ${summary} · evidence: e`;
  const plan = { config: { people: { docLanguage: "en" }, workflow: { selfFix: "on" } }, milestones: [{ id: "M1", status: "active" }], friction: fr.parseFriction(text) };
  const [d] = fr.renderDrafts(plan);
  const card = d.replace(/T-M1-\?\?/g, "T-M1-09").replace(/- TODO: commands[^\n]*/, "- `true`");
  const got = parseCard(card, "docs/plan/tasks/M1/T-M1-09.md", ["implementer"]);
  assert.deepEqual(got.issues, []);
  assert.equal(got.card.title, summary);
  assert.equal(got.card.id, "T-M1-09");
});

test("FRIC-AC-08 docs/card-lifecycle.md names FRICTION_LIMITS.recurring (not a number) and says the brief groups open entries only", () => {
  const doc = readFileSync(join(REPO, "docs", "card-lifecycle.md"), "utf8").replace(/\r\n/g, "\n").replace(/\n {2}/g, " ");
  const bullet = doc.split("\n").find((l) => l.startsWith("- at milestone end `task:report` adds a Friction section"));
  assert.ok(bullet, "the report bullet exists");
  assert.ok(bullet.includes("`FRICTION_LIMITS.recurring` (`kit/tools-saf/lib/friction.mjs`)"), bullet);
  assert.ok(!/\b(two|2|three|3)\b/i.test(bullet), "no literal limit");
  assert.ok(/groups only open entries/.test(bullet) && /carded[^.]*entry list only/.test(bullet), bullet);
  const step = doc.split("\n").find((l) => l.startsWith("9. Friction triage"));
  assert.ok(step.includes("`task:friction close <F-id> carded <card id>`"), step);
});
