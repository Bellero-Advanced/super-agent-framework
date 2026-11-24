import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, fakeCtx, gitRepo, lib, planRepo, write } from "../helpers.mjs";

/** Effort shown and measured (docs/specs/effort-by-size.md rules 11-12, scenarios EFFORT-AC-06 and EFFORT-AC-07). */
const task = await lib("task.mjs");
const rv = await lib("reviews.mjs");
const { cardEffort } = await lib("effort.mjs");
const { loadPlan, sessionContext } = await lib("plan.mjs");
const { loadConfig } = await lib("config.mjs");
const { generate } = await lib("generate.mjs");
const { renderReport } = await lib("report.mjs");
const { listRepoFiles } = await lib("git.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
const evidence = (root, id) => JSON.parse(readFileSync(join(root, task.evidencePath(id)), "utf8"));
const CARDS = [
  { id: "T-M1-01", size: "S", touch: ["src/**"] },
  { id: "T-M1-02", size: "M", touch: ["lib/**"] },
  { id: "T-M1-03", size: "S", touch: ["docs/**"] },
  { id: "T-M1-04", size: "S", role: "designer", touch: ["notes/**"] },
];
const project = (models) => planRepo({ config: { models }, cards: CARDS });
const report = (root, config) => renderReport({ plan: loadPlan(root, config), files: listRepoFiles(root), read: (f) => readFileSync(join(root, f), "utf8") }, "M1");
const row = (text, ...cells) => text.split("\n").find((l) => l.startsWith(`| ${cells.join(" | ")} |`));

test("EFFORT-AC-06 task:start stores started.effort and prints the agent line of rule 11; the session summary shows the agent", async () => {
  const { root, config } = await project({ effort: "by-size" });
  const out = cli(root, "task", "start", "T-M1-01");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^ {2}agent implementer-medium · effort medium · size S · models\.effort by-size \(repo\)$/m);
  assert.doesNotMatch(out.stdout, /warning/);
  const want = cardEffort(config, { role: "implementer", size: "S" });
  assert.deepEqual(evidence(root, "T-M1-01").started.effort, { agent: want.agent, effort: want.effort, mode: "by-size", source: "repo" });
  assert.match(sessionContext(loadPlan(root, config)), /^card in progress: T-M1-01 .* · agent implementer-medium$/m);
  // the default mode (fixed) names the role's own agent
  const fixed = await project({});
  const run = cli(fixed.root, "task", "start", "T-M1-02");
  assert.match(run.stdout, /^ {2}agent implementer · effort high · size M · models\.effort fixed \(default\)$/m);
  assert.deepEqual(evidence(fixed.root, "T-M1-02").started.effort, { agent: "implementer", effort: "high", mode: "fixed", source: "default" });
  assert.match(sessionContext(loadPlan(fixed.root, fixed.config)), /agent implementer$/m);
});

test("EFFORT-AC-06 a lane start stores started.effort and the lane line of the summary names the agent", async () => {
  const { root, config } = await project({ effort: "by-size" });
  const ev = task.startCard(fakeCtx(root, loadConfig(root)), "T-M1-01", { worktree: true });
  assert.deepEqual(ev.started.effort, { agent: "implementer-medium", effort: "medium", mode: "by-size", source: "repo" });
  assert.deepEqual(evidence(root, "T-M1-01").started.effort, ev.started.effort);
  assert.match(sessionContext(loadPlan(root, config)), /^card in progress: T-M1-01 .*lane 1.* · agent implementer-medium$/m);
});

test("EFFORT-AC-06 the missing-variants warning is printed after the line, and a card without size is counted as M and says so", async () => {
  const { root } = await project({ effort: "fixed" });
  write(root, "saf.config.local.json", { models: { effort: "by-size" } });
  write(root, ".gitignore", ".saf-lane.json\n.claude/worktrees/\nsaf.config.local.json\n");
  commitAll(root, "local mode");
  const out = cli(root, "task", "start", "T-M1-01");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^ {2}agent implementer · effort high · size S · models\.effort by-size \(local\)$/m);
  assert.match(out.stdout, /^ {2}warning: models\.effort is by-size here, but setup ran with fixed/m);
  const legacy = await planRepo({ cards: [{ id: "T-M1-01", size: "" }] });
  const text = readFileSync(join(legacy.root, "docs/plan/tasks/M1/T-M1-01.md"), "utf8").replace(/^size: *\n/m, "");
  write(legacy.root, "docs/plan/tasks/M1/T-M1-01.md", text);
  commitAll(legacy.root, "no size");
  const run = cli(legacy.root, "task", "start", "T-M1-01");
  assert.match(run.stdout, /size M \(the card has no size — counted as M\)/);
});

test("EFFORT-AC-07 the report table has one row per size and effort and a row for cards started before this change", async () => {
  const { root, config } = await project({ effort: "by-size" });
  const ctx = fakeCtx(root, config, { now: () => new Date("2026-03-04T10:00:00.000Z") });
  const pass = async (id, file) => {
    task.startCard(ctx, id);
    write(root, file, `${id}\n`);
    assert.equal((await task.verifyCard(ctx, id)).status, "done");
  };
  await pass("T-M1-01", "src/a.ts"); // S implementer-medium: pass first time
  rv.recordReview(ctx, "T-M1-01", "pass");
  await pass("T-M1-02", "lib/b.ts"); // M implementer: fail then pass
  rv.recordReview(ctx, "T-M1-02", "fail", { kinds: ["missing-test"], note: "x" });
  await task.verifyCard(ctx, "T-M1-02");
  rv.recordReview(ctx, "T-M1-02", "pass");
  await pass("T-M1-03", "docs/c.md"); // S implementer-medium: not reviewed
  // a card started before this change: its evidence has no started.effort
  task.startCard(ctx, "T-M1-04");
  const file = join(root, task.evidencePath("T-M1-04"));
  const old = JSON.parse(readFileSync(file, "utf8"));
  delete old.started.effort;
  write(root, task.evidencePath("T-M1-04"), old);
  const text = report(root, config);
  assert.match(text, /## Effort and review rounds/);
  assert.match(text, /\| Size \| Effort \| Cards \| Reviewed \| Passed review first time \| Review rounds \| Verify attempts \|/);
  assert.ok(row(text, "S", "medium", "2", "1", "1", "1", "2"), text);
  assert.ok(row(text, "M", "high", "1", "1", "0", "2", "2"), text);
  assert.ok(row(text, "—", "—", "1", "0", "0", "0", "0"), text);
  assert.equal(text.split("\n").filter((l) => /^\| (S|M|—) \|/.test(l)).length, 3, "no other rows");
});

test("EFFORT-AC-07 without any started card the table is replaced by one line, and the Thai report has the same table", async () => {
  const { root, config } = await project({ effort: "by-size" });
  assert.match(report(root, config), /## Effort and review rounds\n\nnone yet — no card of M1 has started with an effort/);
  const th = await planRepo({ config: { people: { docLanguage: "th" } }, cards: CARDS });
  assert.match(report(th.root, th.config), /## Effort กับรอบรีวิว/);
});

const generated = (models, language, file) => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "none" }, people: { docLanguage: language }, models });
  return readFileSync(join(root, file), "utf8");
};

test("EFFORT-AC-06 the generated /saf build step names the agent task:start named, and /saf-plan and CLAUDE.md follow the mode (en and th)", () => {
  for (const language of ["en", "th"]) {
    for (const effort of ["fixed", "by-size"]) {
      const loop = generated({ effort }, language, ".claude/commands/saf.md");
      assert.match(loop, /\| (build|ลงมือ) \| (the agent|agent ที่) `[^`]*task[: ]start[^`]*`/, `${language} ${effort} build step`);
      assert.doesNotMatch(loop, /`role`/);
      const plan = generated({ effort }, language, ".claude/commands/saf-plan.md");
      const claude = generated({ effort }, language, "CLAUDE.md");
      if (effort === "by-size") {
        assert.match(plan, /`designer-medium`/);
        assert.match(plan, /(a new spec file|สเปกใหม่)/);
        assert.match(claude, language === "en" ? /effort by card size/ : /effort ตามขนาดการ์ด/);
        assert.doesNotMatch(claude, /fixed per role|ตายตัวต่อบทบาท/);
      } else {
        assert.doesNotMatch(plan, /designer-medium|\{\{/);
        assert.match(claude, language === "en" ? /effort fixed per role/ : /effort ตายตัวต่อบทบาท/);
      }
    }
  }
});
