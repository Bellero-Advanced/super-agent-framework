import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, card, cleanup, commitAll, gitRepo, lib, planRepo, write } from "../helpers.mjs";

const { generate } = await lib("generate.mjs");
const { doneWhenItems, guardKind } = await lib("prerun.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const FAIL = `node -e "process.exit(1)"`;
const PASS = `node -e "process.exit(0)"`;
const RAN = (name) => `node -e "require('fs').writeFileSync('${name}','x')"`; // leaves a marker file: proves a command ran

/** Card text with raw "Done when" lines (the test helper only writes bare commands). */
const cardText = (id, lines, status = "") => `${card({ id, criteria: [] }).replace(/## Done when\n\n[\s\S]*$/, "")}## Done when\n\n${lines.map((l) => `- ${l}`).join("\n")}\n${status}`;

async function project(lines, { config = {}, id = "T-M1-01" } = {}) {
  const cfg = { stack: { packageManager: "npm", commands: { test: RAN("suite-ran.txt") } }, workflow: { mergeChecks: [RAN("merge-ran.txt")] }, ...config };
  const made = await planRepo({ config: cfg, cards: [{ id }], files: { [`docs/plan/tasks/M1/${id}.md`]: cardText(id, lines) } });
  commitAll(made.root, "cards");
  return made;
}
const prerun = (root, ...args) => spawnSync(process.execPath, [BIN, "task", "prerun", ...args], { cwd: root, encoding: "utf8" });
const snapshot = (root) => {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = join(d, e.name);
      e.isDirectory() ? walk(p) : files.push(`${p.slice(root.length)}=${readFileSync(p, "utf8")}`);
    }
  };
  walk(root);
  return files.sort().join("\n");
};

test("PRERUN-AC-01 a failing, a passing, a marked and a full-suite command: four verdict lines, exit 1, the full suite did not run", async () => {
  const { root } = await project([`\`${FAIL}\``, `\`${PASS}\``, `\`${RAN("by-design-ran.txt")}\` — passes by design: guard against a regression`, `\`${RAN("suite-ran.txt")}\``]);
  const r = prerun(root, "T-M1-01");
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /fails now — expected/);
  assert.match(r.stdout, /⚠ passes already — it cannot prove the card/);
  assert.match(r.stdout, /passes by design: guard against a regression/);
  assert.match(r.stdout, /guard — not run/);
  assert.ok(existsSync(join(root, "by-design-ran.txt")), "a marked command is run");
  assert.ok(!existsSync(join(root, "suite-ran.txt")), "the full-suite command did not run");
  assert.doesNotMatch(r.stdout, /no command proves this card/);
});

test("PRERUN-AC-02 the same card without the unmarked passing command exits 0", async () => {
  const { root } = await project([`\`${FAIL}\``, `\`${PASS}\` — passes by design: reason`, `\`${RAN("suite-ran.txt")}\``]);
  const r = prerun(root, "T-M1-01");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no unmarked command passes already/);
});

test("PRERUN-AC-02 a command that hangs is stopped at the engine time limit and counts as failing now", async () => {
  const { root } = await project([`\`node -e "setTimeout(()=>{}, 60000)"\``], { config: { workflow: { commandTimeoutMs: 1500, mergeChecks: [] } } });
  const r = prerun(root, "T-M1-01");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /fails now — expected \(stopped at the time limit\)/);
});

test("PRERUN-AC-03 a started card, an unknown id, a stray argument, an option and no id exit 2 and run nothing", async () => {
  const { root } = await project([`\`${RAN("ran.txt")}\``, `\`${FAIL}\``]);
  const bad = (...args) => {
    const r = prerun(root, ...args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout.includes("▶"), false, "nothing ran");
    return r.stderr;
  };
  assert.match(bad("T-M1-99"), /no card T-M1-99/);
  assert.match(bad("T-M1-01", "extra"), /unexpected argument "extra"/);
  assert.match(bad("T-M1-01", "--verbose"), /unknown option --verbose/);
  assert.match(bad(), /give a card id/);
  const started = spawnSync(process.execPath, [BIN, "task", "start", "T-M1-01"], { cwd: root, encoding: "utf8" });
  assert.equal(started.status, 0, started.stderr);
  assert.match(bad("T-M1-01"), /T-M1-01 is in_progress/);
  assert.ok(!existsSync(join(root, "ran.txt")), "no command ran in any refused call");
});

test("PRERUN-AC-04 a run changes nothing: evidence folder, STATE.md, .saf/plan.md and the whole tree are the same before and after", async () => {
  const { root } = await project([`\`${FAIL}\``, `\`${PASS}\``, `\`${RAN("suite-ran.txt")}\``]);
  const before = snapshot(root);
  const r = prerun(root, "T-M1-01");
  assert.equal(r.status, 1, r.stderr);
  assert.equal(snapshot(root), before);
  assert.ok(!existsSync(join(root, "docs/plan/evidence/T-M1-01.json")));
});

test("PRERUN-AC-05 spec:matrix, docs:check and a merge-check entry are guards: none run, the warning shows, exit 0", async () => {
  const { root } = await project(["`npm run spec:matrix -- --check`", "`npm run docs:check`", `\`${RAN("merge-ran.txt")}\``]);
  const r = prerun(root, "T-M1-01");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/guard — not run/g) ?? []).length, 3);
  assert.match(r.stdout, /no command proves this card/);
  assert.ok(!existsSync(join(root, "merge-ran.txt")), "the merge-check command did not run");
  assert.ok(!r.stdout.includes("▶"));
});

test("PRERUN-AC-05 guardKind knows the command form of every package manager and rejects look-alikes", () => {
  const cfg = (packageManager) => ({ stack: { packageManager, commands: { test: "make test" } }, workflow: { mergeChecks: ["make lint"] } });
  assert.equal(guardKind(cfg("npm"), "npm run spec:matrix -- --check"), "engine check");
  assert.equal(guardKind(cfg("npm"), "npm run task:state -- --check"), "engine check");
  assert.equal(guardKind(cfg("pnpm"), "pnpm check-secrets"), "engine check");
  assert.equal(guardKind(cfg("none"), "node tools/saf/bin/saf.mjs docs-check"), "engine check");
  assert.equal(guardKind(cfg("none"), "node tools/saf/bin/saf.mjs spec-matrix --check"), "engine check");
  assert.equal(guardKind(cfg("none"), "npm run docs:check"), null, "only the project's own command form counts");
  assert.equal(guardKind(cfg("npm"), "make test"), "full suite");
  assert.equal(guardKind(cfg("npm"), "make lint"), "merge check");
  assert.equal(guardKind(cfg("npm"), "npm run docs:checkers"), null);
  assert.equal(guardKind(cfg("npm"), "npm run saf:refresh"), null);
});

test("PRERUN-AC-01 the parser reads the mark only after a backticked command, with a non-empty reason, in en and th sections", () => {
  const src = (heading, items) => `---\nid: T-M1-01\n---\n\n## ${heading}\n\n${items.map((i) => `- ${i}`).join("\n")}\n`;
  const items = doneWhenItems(
    src("Done when", [
      "`a` — passes by design: simple",
      "`b` -- passes by design: double dash — and a long dash, then more: text",
      "`c` — — passes by design:    spaced   ",
      "`d` — passes by design:",
      "`e` — passes by design:   ",
      "`f` passes by design: no dash",
      "`node -e \"console.log('passes by design: inside')\"`",
      "plain command passes by design: not backticked",
      "`g` — Passes By Design: any case",
      "`h` — passes by design: first — passes by design: second",
      "`i` # comment — passes by design: after a comment",
    ]),
  );
  assert.deepEqual(
    items.map((i) => [i.cmd, i.mark]),
    [
      ["a", "simple"],
      ["b", "double dash — and a long dash, then more: text"],
      ["c", "spaced"],
      ["d", null],
      ["e", null],
      ["f", "no dash"],
      [`node -e "console.log('passes by design: inside')"`, null],
      ["plain command passes by design: not backticked", null],
      ["g", "any case"],
      ["h", "first — passes by design: second"],
      ["i", "after a comment"],
    ],
  );
  assert.deepEqual(doneWhenItems(src("เกณฑ์ผ่าน", ["`x` — passes by design: เหตุผล"])), [{ cmd: "x", mark: "เหตุผล" }]);
  assert.deepEqual(doneWhenItems(src("Why", ["`x` — passes by design: y"])), [], "no Done when section = no items");
  assert.deepEqual(doneWhenItems("---\n---\n\n## Done when\n\n```\n- `x`\n```\n- `y`\n").map((i) => i.cmd), ["y"], "a fenced block is not an item");
});

test("PRERUN-AC-01 the mark never changes the command task:verify reads (criteriaCommands is the single source)", async () => {
  const { criteriaCommands } = await lib("plan.mjs");
  const { sections, findSection } = await lib("markdown.mjs");
  const text = cardText("T-M1-01", ["`a b` — passes by design: x", "`c` -- passes by design:", "d e # note", "`f`"]);
  const verify = criteriaCommands(findSection(sections(text), ["Done when"]));
  assert.deepEqual(doneWhenItems(text).map((i) => i.cmd), verify);
});

test("PRERUN-AC-03 a lane worktree runs it too (spec rule 5): the other card is judged there, nothing written", async () => {
  const { root, config } = await project([`\`${FAIL}\``], { config: { workflow: { mergeChecks: [], laneInstall: "" } } });
  write(root, "docs/plan/tasks/M1/T-M1-02.md", cardText("T-M1-02", [`\`${FAIL}\``]));
  write(root, "docs/plan/milestones/M1.md", readFileSync(join(root, "docs/plan/milestones/M1.md"), "utf8").replace("  - T-M1-01\n", "  - T-M1-01\n  - T-M1-02\n"));
  const { loadPlan } = await lib("plan.mjs");
  const { writeGenerated } = await lib("task.mjs");
  writeGenerated(root, loadPlan(root, config));
  commitAll(root, "second card");
  const started = spawnSync(process.execPath, [BIN, "task", "start", "T-M1-01", "--worktree"], { cwd: root, encoding: "utf8" });
  assert.equal(started.status, 0, started.stderr);
  const lane = join(root, config.workflow.worktreeDir, readdirSync(join(root, config.workflow.worktreeDir))[0]);
  const before = snapshot(lane);
  const r = prerun(lane, "T-M1-02");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /fails now — expected/);
  assert.equal(snapshot(lane), before);
});

test("PRERUN-AC-06 the rendered templates carry the rule, the card and spec lines and the /saf-plan step (en and th)", () => {
  for (const lang of ["en", "th"]) {
    const root = gitRepo();
    generate(root, { stack: { packageManager: "npm" }, people: { docLanguage: lang } }, { now: new Date("2026-01-02T00:00:00Z") });
    const read = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
    const designer = read(".claude/agents/designer.md");
    assert.match(designer, /npm run task:prerun -- <id>/, `${lang} designer names the command`);
    assert.match(designer, /passes by design: <reason>/);
    assert.match(designer, /acceptance row with concrete values/);
    assert.match(designer, /says under the table why it passes by design/);
    const cardTpl = read("docs/plan/tasks/_template.md");
    assert.match(cardTpl, /npm run task:prerun -- <id>/, `${lang} card template`);
    assert.match(cardTpl, /`— passes by design: <reason>`/);
    const doneAt = cardTpl.search(/^## (Done when|เกณฑ์ผ่าน)$/m);
    assert.ok(doneAt > 0 && cardTpl.indexOf("task:prerun") > doneAt, "the line sits under the Done when heading");
    const specTpl = read("docs/specs/_template.md");
    const accAt = specTpl.search(/^## 5\. /m);
    assert.ok(accAt > 0 && specTpl.indexOf(lang === "en" ? "Each row must be able to fail" : "ทุกแถวต้องล้มได้") > accAt, `${lang} spec template Acceptance line`);
    assert.match(read(".claude/commands/saf-plan.md"), /npm run task:prerun -- <id>.*\n?.*passes by design: <reason>/, `${lang} /saf-plan`);
    for (const f of [".claude/agents/designer.md", "docs/plan/tasks/_template.md", "docs/specs/_template.md", ".claude/commands/saf-plan.md"]) assert.doesNotMatch(read(f), /\{\{|\}\}/, `${f} has no unrendered placeholder`);
    assert.equal(JSON.parse(read("package.json")).scripts["task:prerun"], "node tools/saf/bin/saf.mjs task prerun");
  }
});

test("PRERUN-AC-06 this repository: the designer agent, templates and package.json already carry the rule", () => {
  const read = (rel) => readFileSync(join(REPO, rel), "utf8");
  assert.match(read(".claude/agents/designer.md"), /task:prerun/);
  assert.match(read("docs/plan/tasks/_template.md"), /passes by design: <reason>/);
  assert.match(read("docs/specs/_template.md"), /Each row must be able to fail/);
  assert.match(read(".claude/commands/saf-plan.md"), /task:prerun/);
  assert.equal(JSON.parse(read("package.json")).scripts["task:prerun"], "node tools/saf/bin/saf.mjs task prerun");
  assert.equal(JSON.parse(read("examples/todo-api/package.json")).scripts["task:prerun"], "node tools/saf/bin/saf.mjs task prerun");
});
