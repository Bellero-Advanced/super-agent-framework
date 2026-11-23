import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, tmp, write } from "../helpers.mjs";

/**
 * The npm packages as users get them: pack both, check what ships, install the tarballs into a fresh folder (offline)
 * and run `npx create-saf` end to end.
 */
after(cleanup);

const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const ENV = { ...process.env, [PATH_KEY]: `${dirname(process.execPath)}${delimiter}${process.env[PATH_KEY]}`, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" };
function sh(cwd, cmd) {
  const r = spawnSync(cmd, { cwd, env: ENV, encoding: "utf8", timeout: 240_000, shell: true, windowsHide: true });
  assert.equal(r.status, 0, `${cmd} exited ${r.status}\n${r.stdout}${r.stderr}`);
  return r.stdout;
}
const packed = (dir) => JSON.parse(sh(dir, "npm pack --dry-run --json --ignore-scripts"))[0];
const CREATE = join(REPO, "packages", "create-saf");

test("pack contents: the kit ships, the repo's own tests, examples and dev setup do not", () => {
  const main = packed(REPO);
  const files = main.files.map((f) => f.path);
  for (const f of ["bin/cli.mjs", "src/install.mjs", "kit/tools-saf/bin/saf.mjs", "kit/tools-saf/VERSION", "kit/claude/skills/saf-setup/SKILL.md", "kit/tools-saf/templates/skills/evidence-before-done/SKILL.md", "README.md", "LICENSE", "package.json"]) {
    assert.ok(files.includes(f), `ships ${f}`);
  }
  const junk = files.filter((f) => /^(test|examples|docs|scripts|packages|tools|\.claude|\.saf|\.github)\//.test(f) || /^(CLAUDE\.md|saf\.config\.json)$/.test(f));
  assert.deepEqual(junk, []);
  assert.equal(main.name, "super-agent-framework");
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.version, readFileSync(join(REPO, "kit/tools-saf/VERSION"), "utf8").trim(), "package and engine versions match");

  const create = packed(CREATE);
  assert.deepEqual(create.files.map((f) => f.path).sort(), ["LICENSE", "README.md", "index.mjs", "package.json"]);
  const cpkg = JSON.parse(readFileSync(join(CREATE, "package.json"), "utf8"));
  assert.equal(cpkg.version, pkg.version);
  assert.equal(cpkg.dependencies["super-agent-framework"], pkg.version, "create-saf pins the same version");
});

test("tarballs install offline and `npx create-saf` sets up a project end to end", () => {
  const out = tmp("saf-pack-");
  const tgz = (dir) => join(out, JSON.parse(sh(dir, `npm pack --json --ignore-scripts --pack-destination "${out}"`))[0].filename);
  const main = tgz(REPO);
  const create = tgz(CREATE);
  const consumer = tmp("saf-consumer-");
  write(consumer, "package.json", { name: "consumer", version: "1.0.0", private: true });
  sh(consumer, `npm install --offline --no-audit --no-fund "${main}" "${create}"`);
  assert.match(sh(consumer, "npx --offline saf version"), /^0\.1\.0/);

  mkdirSync(join(consumer, "my-app"));
  const project = gitRepo(join(consumer, "my-app"));
  write(consumer, "answers.json", { project: { name: "My App", type: "api" }, stack: { packageManager: "none" } });
  const log = sh(consumer, "npx --offline create-saf my-app --answers answers.json");
  assert.match(log, /setup generated \d+ file\(s\)/);
  for (const f of ["CLAUDE.md", "tools/saf/bin/saf.mjs", ".claude/commands/saf.md", ".claude/skills/test-runner/SKILL.md", ".claude/skills/saf-setup/SKILL.md"]) assert.ok(existsSync(join(project, f)), f);
  sh(project, "node tools/saf/bin/saf.mjs task state --check");
  sh(project, "node tools/saf/bin/saf.mjs docs-check");
  sh(project, "node tools/saf/bin/saf.mjs check-secrets");
});
