import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, gitRepo, tmp, write } from "../helpers.mjs";

/**
 * End to end: the real CLI (`init --answers`) into fresh folders for three profiles, then — inside each generated
 * project, through its own package manager — the self-checks, the SessionStart hook and a full card dry-run.
 */
after(cleanup);

const CLI = join(REPO, "bin", "cli.mjs");
const has = (bin) => spawnSync(`${bin} --version`, { stdio: "ignore", shell: true }).status === 0;
const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const ENV = { ...process.env, [PATH_KEY]: `${dirname(process.execPath)}${delimiter}${process.env[PATH_KEY]}`, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" };

/** The platform's own shell (sh on POSIX, cmd.exe on Windows) — the commands below are written to work in both. */
function sh(cwd, cmd) {
  const r = spawnSync(cmd, { cwd, env: ENV, encoding: "utf8", timeout: 120_000, shell: true, windowsHide: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
function ok(cwd, cmd) {
  const r = sh(cwd, cmd);
  assert.equal(r.code, 0, `${cmd} exited ${r.code}\n${r.out}`);
  return r.out;
}
const read = (root, f) => readFileSync(join(root, f), "utf8");

function init(root, answers, extra = []) {
  const file = join(tmp("saf-answers-"), "answers.json");
  write(file.replace(/answers\.json$/, ""), "answers.json", answers);
  return execFileSync(process.execPath, [CLI, "init", "--dir", root, "--answers", file, ...extra], { encoding: "utf8", env: ENV });
}

/** The checks every generated project must pass, run the way its CLAUDE.md tells people to run them. */
function selfChecks(root, run) {
  ok(root, run("task:state", "--check"));
  ok(root, run("docs:check"));
  ok(root, run("check-secrets"));
  const hook = ok(root, "node tools/saf/bin/saf.mjs hook session-start");
  assert.match(hook, /M0/);
  assert.match(hook, /T-M0-01/);
  commitAll(root, "chore: SAF setup");
  ok(root, run("task:start", "T-M0-01"));
  assert.match(ok(root, "node tools/saf/bin/saf.mjs hook session-start"), /T-M0-01/);
  const verify = ok(root, run("task:verify", "T-M0-01"));
  assert.match(verify, /T-M0-01 passed — 3 command\(s\)/);
  ok(root, run("task:state", "--check"));
  const ev = JSON.parse(read(root, "docs/plan/evidence/T-M0-01.json"));
  assert.equal(ev.status, "done");
  assert.equal(ev.verified.commands.length, 3);
  assert.ok(ev.verified.commands.every((c) => c.exit === 0));
  assert.match(read(root, "docs/plan/STATE.md"), /(cards done|การ์ดเสร็จ) 1\/1/);
  return { hook, verify };
}

const modelsOf = (root) => Object.fromEntries(readdirSync(join(root, ".claude/agents")).map((f) => [f.replace(/\.md$/, ""), read(root, `.claude/agents/${f}`).match(/^model: (.+)$/m)?.[1]]));

test("profile 1 — Thai · Balanced · web app · pnpm", { skip: has("pnpm") ? false : "pnpm is not installed" }, () => {
  const root = gitRepo(tmp("saf-web-"));
  write(root, "package.json", { name: "shop-web", private: true, scripts: { typecheck: "node -e 0", lint: "node -e 0", test: "node -e 0" } });
  write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, "src/app.tsx", "export const App = () => null;\n");
  const out = init(root, {
    project: { name: "ร้านค้าออนไลน์", pitch: "ร้านค้าออนไลน์ของคนทำงานฝีมือ", type: "web-app", stage: "mvp", rigor: "standard" },
    people: { docLanguage: "th", chatLanguage: "th", ownerTitle: "เจ้าของ", uiLanguages: ["th", "en"], i18nRequired: true },
    stack: { packageManager: "pnpm", commands: { typecheck: "pnpm typecheck", lint: "pnpm lint", test: "pnpm test" }, database: "PostgreSQL" },
    models: { preset: "balanced" },
    roles: { enabled: ["db-guardian", "content-writer"] },
    firstMilestone: { goal: "ผู้ซื้อสมัครสมาชิกและซื้อสินค้าได้หนึ่งชิ้น" },
  });
  assert.match(out, /setup generated \d+ file\(s\)/);
  const m = modelsOf(root);
  assert.equal(m.designer, "claude-opus-5-5");
  assert.equal(m.implementer, "claude-sonnet-5-5");
  assert.equal(m["db-guardian"], "claude-sonnet-5-5");
  const claude = read(root, "CLAUDE.md");
  assert.match(claude, /เรียกผู้ใช้ว่า "คุณ" แทนตัวเองว่า "ผม"/);
  assert.match(claude, /`claude --model claude-opus-5-5`/);
  assert.match(claude, /pnpm task:verify <id>/);
  assert.match(read(root, "docs/plan/milestones/M1.md"), /status: planned/);
  assert.ok(existsSync(join(root, ".claude/rules/database.md")));
  assert.ok(existsSync(join(root, ".claude/rules/ui.md")));
  const { hook } = selfChecks(root, (s, a = "") => `pnpm ${s} ${a}`.trim());
  assert.match(hook, /การ์ด/);
  ok(root, "pnpm task:next --parallel");
  ok(root, "pnpm spec:matrix --check");
});

test("profile 2 — English · Max · game · no package manager", () => {
  const root = gitRepo(tmp("saf-game-"));
  write(root, "project.godot", "[application]\n");
  init(root, {
    project: { name: "Sky Forge", pitch: "A co-op crafting game", type: "game", rigor: "strict" },
    people: { docLanguage: "en", chatLanguage: "en" },
    stack: { packageManager: "none", commands: {} },
    models: { preset: "max" },
    roles: { enabled: ["art-producer", "security-auditor", "release-operator"], custom: [{ name: "level-designer", description: "Designs levels: layout, pacing and encounters.", tier: "planner", focus: "playable greybox first" }] },
    policies: { deploy: { mode: "owner-order", target: "itch.io" }, ownerOnlyPaths: ["art/approved/**"] },
  });
  assert.ok(!existsSync(join(root, "package.json")), "no package.json for a non-Node project");
  const m = modelsOf(root);
  assert.equal(m.designer, "claude-fable-5-2");
  assert.equal(m["security-auditor"], "claude-fable-5-2");
  assert.equal(m["level-designer"], "claude-fable-5-2");
  assert.equal(m.implementer, "claude-opus-5-5");
  assert.equal(m["art-producer"], "claude-opus-5-5");
  assert.match(read(root, ".claude/agents/level-designer.md"), /description: "Designs levels: layout, pacing and encounters."/);
  assert.match(read(root, "docs/plan/tasks/M0/T-M0-01.md"), /dont_touch: \["art\/approved\/\*\*"\]/);
  assert.match(read(root, "CLAUDE.md"), /node tools\/saf\/bin\/saf\.mjs task verify <id>/);
  assert.match(read(root, "CLAUDE.md"), /M ≤ 800 · L ≤ 1600/);
  assert.ok(!existsSync(join(root, "docs/plan/milestones/M1.md")));
  selfChecks(root, (s, a = "") => {
    const sub = { "task:state": "task state", "task:start": "task start", "task:verify": "task verify", "docs:check": "docs-check", "check-secrets": "check-secrets" }[s];
    return `node tools/saf/bin/saf.mjs ${sub} ${a}`.trim();
  });
});

test("profile 3 — Thai · Economy · existing npm project (adopt)", () => {
  const root = gitRepo(tmp("saf-erp-"));
  write(root, "package.json", { name: "stock-erp", description: "Inventory for a shop", scripts: { test: "node -e 0", build: "node -e 0" } });
  write(root, "package-lock.json", { name: "stock-erp", lockfileVersion: 3, requires: true, packages: {} });
  write(root, "CLAUDE.md", "# old rules\nbe careful\n");
  write(root, ".claude/agents/old-helper.md", "---\nname: old-helper\ndescription: x\n---\n");
  write(root, ".claude/commands/deploy.md", "deploy things\n");
  write(root, "docs/INDEX.md", "# old index\n");
  write(root, "src/index.js", "module.exports = 1;\n");
  commitAll(root, "existing project");

  const out = init(root, {
    project: { name: "stock-erp", type: "erp", stage: "production", rigor: "light" },
    people: { docLanguage: "th", chatLanguage: "th" },
    stack: { packageManager: "npm", commands: { test: "npm test", build: "npm run build", lint: "npm run lint" } },
    models: { preset: "economy" },
    workflow: { worktrees: false },
  });
  assert.match(out, /existing project detected/);
  for (const f of ["CLAUDE.md", ".claude/agents/old-helper.md", ".claude/commands/deploy.md", "docs/INDEX.md"]) {
    assert.ok(existsSync(join(root, "docs/archive/pre-saf", f)), `archived ${f}`);
  }
  assert.equal(read(root, "docs/archive/pre-saf/CLAUDE.md"), "# old rules\nbe careful\n");
  const m = modelsOf(root);
  assert.equal(m.designer, "claude-sonnet-5-5");
  assert.equal(m.implementer, "claude-haiku-5-5");
  assert.ok(!m["old-helper"]);
  const claude = read(root, "CLAUDE.md");
  assert.match(claude, /npm run task:verify -- <id>/);
  assert.match(claude, /ยังไม่ได้ตั้ง .*lint → npm run lint/);
  assert.ok(!/task:start -- <id> --worktree/.test(claude), "lanes off → no lane commands");
  const pkg = JSON.parse(read(root, "package.json"));
  assert.equal(pkg.scripts.test, "node -e 0", "existing scripts are kept");
  selfChecks(root, (s, a = "") => `npm run -s ${s}${a ? ` -- ${a}` : ""}`);

  // upgrade replaces the engine only
  const before = read(root, "CLAUDE.md");
  const up = execFileSync(process.execPath, [CLI, "upgrade", "--dir", root], { encoding: "utf8", env: ENV });
  assert.match(up, /SAF 0\.1\.0 → 0\.1\.0/);
  assert.equal(read(root, "CLAUDE.md"), before);
  ok(root, "npm run -s task:state -- --check");
});

test("init without answers prepares the interview and stops", () => {
  const root = tmp("saf-bare-");
  const out = execFileSync(process.execPath, [CLI, "init", "--dir", root], { encoding: "utf8", env: ENV });
  assert.match(out, /\/saf-setup/);
  assert.ok(existsSync(join(root, "tools/saf/bin/saf.mjs")));
  assert.ok(existsSync(join(root, ".claude/skills/saf-setup/SKILL.md")));
  assert.ok(existsSync(join(root, ".claude/skills/saf-setup/questions.md")));
  assert.equal(JSON.parse(read(root, "saf.config.json")).version, 1);
  assert.ok(!existsSync(join(root, "CLAUDE.md")));
});
