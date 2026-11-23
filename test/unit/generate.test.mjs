import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, gitRepo, lib, write } from "../helpers.mjs";

const { generate, alignShellComments, templateData, MANIFEST } = await lib("generate.mjs");
const { resolveConfig } = await lib("config.mjs");
const { detectProject } = await lib("detect.mjs");
after(cleanup);

const read = (root, f) => readFileSync(join(root, f), "utf8");

test("generate writes the whole system and a valid config", () => {
  const root = gitRepo();
  write(root, "package.json", { name: "demo", scripts: { test: "node -e 0" } });
  const { report, config } = generate(root, { project: { name: "Demo", type: "api" }, stack: { packageManager: "npm", commands: { test: "npm test", lint: "npm run lint" } } }, { now: new Date("2026-01-02T00:00:00Z") });
  for (const f of ["CLAUDE.md", "docs/INDEX.md", "docs/DECISIONS.md", "docs/plan/README.md", "docs/plan/STATE.md", ".saf/plan.md", "docs/plan/milestones/M0.md", "docs/plan/tasks/M0/T-M0-01.md", ".claude/commands/saf.md", ".claude/commands/saf-p.md", ".claude/agents/spec-reviewer.md", ".claude/rules/server-authority.md", ".claude/skills/debug-protocol/SKILL.md", MANIFEST]) {
    assert.ok(existsSync(join(root, f)), f);
  }
  assert.ok(!existsSync(join(root, "docs/plan/milestones/M1.md")), "no goal → no M1 draft");
  assert.match(read(root, "docs/DECISIONS.md"), /\| D-001 \| 2026-01-02 \|/);
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  assert.ok(settings.hooks.SessionStart[0].hooks[0].command.includes("hook session-start"));
  assert.equal(settings.env, undefined);
  const pkg = JSON.parse(read(root, "package.json"));
  assert.equal(pkg.scripts["task:verify"], "node tools/saf/bin/saf.mjs task verify");
  assert.deepEqual(config.workflow.mergeChecks, ["npm test", "npm run check-secrets", "npm run docs:check"], "lint has no script → not a merge check");
  assert.match(read(root, "CLAUDE.md"), /Not set up yet .*lint → npm run lint/);
  assert.ok(report.written.length > 30);
});

test("existing files are archived, settings env moves to the untracked local file, re-runs keep evidence", () => {
  const root = gitRepo();
  write(root, "CLAUDE.md", "# my old notes\n");
  write(root, ".claude/agents/old.md", "---\nname: old\n---\n");
  write(root, ".claude/settings.json", { env: { ANTHROPIC_MODEL: "x" }, permissions: { allow: ["Bash(ls)"] } });
  const answers = { stack: { packageManager: "none" }, firstMilestone: { goal: "Ship the first screen. More later." } };
  const r1 = generate(root, answers);
  assert.ok(r1.report.archived.some((a) => a.startsWith("CLAUDE.md → docs/archive/pre-saf/CLAUDE.md")));
  assert.ok(r1.report.archived.some((a) => a.startsWith(".claude/agents/old.md")));
  assert.equal(read(root, "docs/archive/pre-saf/CLAUDE.md"), "# my old notes\n");
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  assert.equal(settings.env, undefined);
  assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
  assert.deepEqual(JSON.parse(read(root, ".claude/settings.local.json")).env, { ANTHROPIC_MODEL: "x" });
  assert.match(read(root, "docs/plan/milestones/M1.md"), /status: planned/);
  assert.match(read(root, "docs/plan/milestones/M1.md"), /title: "Ship the first screen"/);
  assert.match(read(root, ".gitignore"), /\.claude\/settings\.local\.json/);

  write(root, "docs/plan/evidence/T-M0-01.json", { id: "T-M0-01", milestone: "M0", status: "in_progress", started: { at: "2026-01-01T00:00:00Z", base: "x", dirty: {} }, attempts: 0 });
  writeFileSync(join(root, "CLAUDE.md"), `${read(root, "CLAUDE.md")}\nmy edit\n`);
  const r2 = generate(root, answers);
  assert.ok(existsSync(join(root, "docs/plan/evidence/T-M0-01.json")), "evidence survives a re-run");
  assert.deepEqual(r2.report.archived.map((a) => a.split(" → ")[0]), ["CLAUDE.md"], "only the edited file is archived");
});

test("bash command comments are aligned", () => {
  assert.equal(alignShellComments("```bash\nab  # x\nabcd  # y\nplain\n```"), "```bash\nab    # x\nabcd  # y\nplain\n```");
});

test("template data: session rows group roles by model; th labels", () => {
  const root = gitRepo();
  const c = resolveConfig({ people: { docLanguage: "th" }, models: { preset: "max" } });
  const d = templateData(c, detectProject(root), { now: new Date(0) });
  assert.deepEqual(d.sessionRows.map((r) => r.model), ["claude-fable-5-2", "claude-opus-5-5"]);
  assert.match(d.sessionRows[0].work, /ออกแบบ/);
  assert.equal(d.cmd.taskVerify, "npm run task:verify -- <id>");
});
