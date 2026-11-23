import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { REPO, cleanup, gitRepo, lib, write } from "../helpers.mjs";

const { generate, alignShellComments, templateData, MANIFEST } = await lib("generate.mjs");
const { resolveConfig, CORE_SKILLS, recommendPacks } = await lib("config.mjs");
const { init, upgrade } = await import(join(REPO, "src", "install.mjs"));
const { detectProject } = await lib("detect.mjs");
after(cleanup);

const read = (root, f) => readFileSync(join(root, f), "utf8");

test("generate writes the whole system and a valid config", () => {
  const root = gitRepo();
  write(root, "package.json", { name: "demo", scripts: { test: "node -e 0" } });
  const { report, config } = generate(root, { project: { name: "Demo", type: "api" }, stack: { packageManager: "npm", commands: { test: "npm test", lint: "npm run lint" } } }, { now: new Date("2026-01-02T00:00:00Z") });
  for (const f of ["CLAUDE.md", "docs/INDEX.md", "docs/DECISIONS.md", "docs/plan/README.md", "docs/plan/STATE.md", ".saf/plan.md", "docs/plan/milestones/M0.md", "docs/plan/tasks/M0/T-M0-01.md", ".claude/commands/saf.md", ".claude/commands/saf-plan.md", ".claude/agents/spec-reviewer.md", ".claude/rules/server-authority.md", ".claude/skills/debug-protocol/SKILL.md", MANIFEST]) {
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
  assert.ok(report.written.length > 25);
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

test("slim commands: only /saf and /saf-plan; core skills rendered with the project's commands", () => {
  const root = gitRepo();
  write(root, "package.json", { name: "demo", scripts: { test: "node -e 0" } });
  const { config } = generate(root, { project: { type: "api" }, stack: { packageManager: "npm", commands: { test: "npm test" } } });
  assert.deepEqual(readdirSync(join(root, ".claude/commands")).sort(), ["saf-plan.md", "saf.md"]);
  assert.deepEqual(config.skills.packs, [], "api without database or several UI languages → no packs");
  assert.deepEqual(readdirSync(join(root, ".claude/skills")).sort(), [...CORE_SKILLS].sort());
  const runner = read(root, ".claude/skills/test-runner/SKILL.md");
  assert.match(runner, /`npm test` \(test\)/);
  assert.match(runner, /npm run measure -- <command>/);
  assert.doesNotMatch(runner, /{{/);
  const saf = read(root, ".claude/commands/saf.md");
  assert.match(saf, /`debug-protocol`/);
  assert.match(saf, /`evidence-before-done` · `test-runner`/, "help lists the installed skills");
  assert.doesNotMatch(saf, /saf-fix|saf-test|saf-protect|saf-help/);
});

test("skill packs: recommended from answers, chosen packs installed, dropped packs removed unless edited", () => {
  assert.deepEqual(recommendPacks(resolveConfig({ project: { type: "game" }, stack: { database: "PostgreSQL" }, people: { uiLanguages: ["en", "th"] } })), ["ui-frontend", "db-migrations", "performance", "i18n", "game"]);
  assert.deepEqual(recommendPacks(resolveConfig({ project: { type: "mobile" } })), ["ui-frontend", "mobile"]);
  assert.deepEqual(resolveConfig({ project: { type: "game" }, skills: { packs: ["i18n"] } }).skills.packs, ["i18n"], "an explicit choice wins");

  const root = gitRepo();
  const answers = (packs) => ({ project: { type: "web-app" }, people: { uiLanguages: ["en", "th"] }, stack: { packageManager: "none" }, skills: { packs } });
  generate(root, answers(["ui-frontend", "i18n", "game", "db-migrations"]));
  for (const p of ["ui-frontend", "i18n", "game", "db-migrations"]) assert.ok(existsSync(join(root, `.claude/skills/${p}/SKILL.md`)), p);
  assert.match(read(root, ".claude/skills/i18n/SKILL.md"), /UI languages: en, th\./);
  assert.match(JSON.parse(read(root, "saf.config.json")).skills.packs.join(","), /game/);
  writeFileSync(join(root, ".claude/skills/game/SKILL.md"), `${read(root, ".claude/skills/game/SKILL.md")}\nour own note\n`);
  const r = generate(root, answers(["ui-frontend"]));
  assert.ok(!existsSync(join(root, ".claude/skills/i18n")), "unedited dropped pack removed");
  assert.ok(!existsSync(join(root, ".claude/skills/db-migrations")));
  assert.ok(existsSync(join(root, ".claude/skills/game/SKILL.md")), "edited dropped pack kept");
  assert.deepEqual(r.report.removed.sort(), [".claude/skills/db-migrations/SKILL.md", ".claude/skills/i18n/SKILL.md"]);
  assert.ok(r.report.kept.some((k) => k.startsWith(".claude/skills/game/SKILL.md")));
});

test("upgrade removes the old commands SAF shipped, keeps edited ones and never touches the user's own", async () => {
  const root = gitRepo();
  await init(root, { answers: { stack: { packageManager: "none" } } });
  // what an older SAF left behind: its command files recorded in the manifest
  const sha = (s) => createHash("sha1").update(s).digest("hex");
  const manifest = JSON.parse(read(root, MANIFEST));
  const old = ["saf-fix", "saf-test", "saf-protect", "saf-help", "saf-p", "saf-f", "saf-t", "saf-pt", "saf-audit", "saf-h"];
  for (const name of old) {
    const content = `---\ndescription: old ${name}\n---\n`;
    write(root, `.claude/commands/${name}.md`, content);
    manifest.files[`.claude/commands/${name}.md`] = sha(content);
  }
  write(root, MANIFEST, manifest);
  writeFileSync(join(root, ".claude/commands/saf-help.md"), "my edited help\n");
  write(root, ".claude/commands/deploy.md", "the user's own command\n");
  write(root, ".claude/skills/my-skill/SKILL.md", "---\nname: my-skill\n---\n");
  rmSync(join(root, ".claude/skills/evidence-before-done"), { recursive: true });
  delete manifest.files[".claude/skills/evidence-before-done/SKILL.md"];
  write(root, MANIFEST, manifest);

  const r = await upgrade(root);
  const left = readdirSync(join(root, ".claude/commands")).sort();
  assert.deepEqual(left, ["deploy.md", "saf-help.md", "saf-plan.md", "saf.md"]);
  assert.equal(read(root, ".claude/commands/deploy.md"), "the user's own command\n");
  assert.equal(read(root, ".claude/commands/saf-help.md"), "my edited help\n");
  assert.ok(existsSync(join(root, ".claude/skills/my-skill/SKILL.md")));
  assert.ok(existsSync(join(root, ".claude/skills/evidence-before-done/SKILL.md")), "a new core skill is installed");
  assert.equal(r.report.removed.length, old.length - 1);
  assert.ok(r.report.kept.some((k) => k.startsWith(".claude/commands/saf-help.md")));
  const after = JSON.parse(read(root, MANIFEST)).files;
  assert.ok(!(".claude/commands/saf-fix.md" in after));
  assert.ok(".claude/commands/saf-help.md" in after, "the kept file stays recorded so a later upgrade still sees it as edited");
});

test("CRLF checkouts count as unchanged", () => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "none" } });
  const f = join(root, ".claude/skills/tdd/SKILL.md");
  writeFileSync(f, readFileSync(f, "utf8").replace(/\n/g, "\r\n"));
  const r = generate(root, { stack: { packageManager: "none" } });
  assert.deepEqual(r.report.archived, []);
});
