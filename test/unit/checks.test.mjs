import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, fakeCtx, gitRepo, lib, planRepo, tmp, write } from "../helpers.mjs";

const { scanSecrets } = await lib("secrets.mjs");
const { runDocsCheck, scriptOf } = await lib("docs.mjs");
const { buildMatrix, blockingGaps, parseSpecScenarios } = await lib("matrix.mjs");
const { findScenarioTests, nameHasId } = await lib("scenarios.mjs");
const { runMeasured, lockPathFor, EXIT_BUSY } = await lib("measure.mjs");
const { redactSecrets, taskRunner } = await lib("run.mjs");
const { resolveConfig } = await lib("config.mjs");
const { runProbe } = await lib("task.mjs");
after(cleanup);

// fake secrets are assembled at runtime so this file never contains a real-looking value
const FAKE = { anthropic: ["sk-", "ant-", "a".repeat(30)].join(""), github: ["gh", "p_", "B".repeat(36)].join(""), db: ["postgres", "://user:", "hunter22", "@db.example.invalid/app"].join("") };

test("check-secrets: value shapes and tracked env files; reports kind, never the value", () => {
  const root = tmp();
  write(root, "a.ts", `const k = "${FAKE.anthropic}";\n`);
  write(root, "b.yml", `token: ${FAKE.github}\nurl: ${FAKE.db}\n`);
  write(root, ".env", "X=1\n");
  write(root, ".env.example", "X=\n");
  write(root, "clean.md", "nothing here\n");
  const config = resolveConfig({});
  const r = scanSecrets(root, ["a.ts", "b.yml", ".env", ".env.example", "clean.md"], config);
  const kinds = r.findings.map((f) => `${f.file}:${f.kind}`);
  assert.ok(kinds.includes("a.ts:Anthropic key"));
  assert.ok(kinds.includes("b.yml:GitHub token"));
  assert.ok(kinds.includes("b.yml:database URL with password"));
  assert.ok(kinds.some((k) => k.startsWith(".env:env file")));
  assert.ok(!kinds.some((k) => k.startsWith(".env.example")));
  assert.ok(!JSON.stringify(r).includes(FAKE.anthropic));
});

test("runner redacts env secret values from output", async () => {
  const secret = ["s3cr3t", "VALUE", "x".repeat(12)].join("_");
  assert.ok(!redactSecrets(`token=${secret}`, { API_TOKEN: secret }).includes(secret));
  const run = taskRunner(tmp(), { env: { API_TOKEN: secret }, timeoutMs: 10_000 });
  const r = await run('node -e "console.log(process.env.API_TOKEN); process.exit(3)"');
  assert.equal(r.exit, 3);
  assert.ok(!r.tail.join("\n").includes(secret));
});

test("docs-check: scripts, paths, links, agents, settings env, bare at-names", () => {
  const config = resolveConfig({ stack: { packageManager: "pnpm" } });
  const files = {
    "CLAUDE.md": "# x\n\n```bash\npnpm test\npnpm nope\n```\n`docs/missing/file.md` [ok](docs/INDEX.md) [bad](docs/gone.md)\nsee @someone here\n`claude --model claude-opus-5-5`\n",
    "docs/INDEX.md": "# i\n",
    "docs/DECISIONS.md": "# d\n",
    "docs/plan/README.md": "# p\n",
    "saf.config.json": "{}",
    ".claude/settings.json": '{"env": {"A": "1"}}',
    ".claude/rules/r.md": "# no paths\n",
    ".claude/agents/designer.md": "---\nname: designer\ndescription: d\nmodel: opus\neffort: high\n---\n",
    ".claude/agents/spec-reviewer.md": "---\nname: spec-reviewer\ndescription: d\nmodel: claude-opus-5-5\neffort: high\ntools: Read, Edit\n---\n",
    ".claude/agents/implementer.md": "---\nname: implementer\ndescription: d\nmodel: claude-sonnet-5-5\neffort: high\n---\n",
  };
  const r = runDocsCheck({ files: Object.keys(files), read: (f) => files[f], exists: () => false, scripts: { test: "x" }, config });
  const msg = r.issues.map((i) => `${i.file}: ${i.message}`).join("\n");
  for (const want of [/script "nope"/, /path in backticks does not exist: docs\/missing/, /broken link: docs\/gone.md/, /bare "@someone"/, /env block/, /needs a `paths:` list/, /model: must be a full model id/, /read-only role/, /missing agent for enabled role "qa-runner"/, /claude --model claude-sonnet-5-5/]) {
    assert.match(msg, want);
  }
  assert.ok(!/script "test"/.test(msg));
  assert.equal(scriptOf("npm run task:verify -- T-M1-01"), "task:verify");
  assert.equal(scriptOf("npm install"), null);
  assert.equal(scriptOf("pnpm --filter x dev"), null);
});

test("spec matrix: table rows, ids in test names, gaps of started cards", () => {
  const spec = "# s\n\n## 5. Acceptance\n\n| id | then |\n|---|---|\n| AUTH-AC-01 | a |\n| AUTH-AC-02 | b |\n";
  assert.deepEqual(parseSpecScenarios(spec, "docs/specs/auth.md").scenarios.map((s) => s.id), ["AUTH-AC-01", "AUTH-AC-02"]);
  const files = { "docs/specs/auth.md": spec, "docs/specs/_template.md": "x", "test/a.test.ts": 'it("AUTH-AC-01 works", () => {})\n', "tests/test_b.py": "# AUTH-AC-02\n" };
  const m = buildMatrix({ files: Object.keys(files), read: (f) => files[f], cards: [{ id: "T-M1-01", file: "c", scenarios: ["AUTH-AC-01", "AUTH-AC-02"] }], status: () => "in_progress" });
  assert.deepEqual(m.specs, ["docs/specs/auth.md"]);
  assert.deepEqual(blockingGaps(m), []);
  assert.ok(nameHasId("AUTH-AC-03 x", "AUTH-AC-03") && !nameHasId("AUTH-AC-030", "AUTH-AC-03") && !nameHasId("XAUTH-AC-03", "AUTH-AC-03"));
  const hits = findScenarioTests(["test/a.test.ts"], () => 'const s = "AUTH-AC-09"; test("other", () => {})', ["AUTH-AC-09"]);
  assert.deepEqual(hits.get("AUTH-AC-09"), []);
});

test("measure lock: second holder waits then exits 75; lock is released", async () => {
  const root = gitRepo();
  const config = resolveConfig({ workflow: { measure: { waitMs: 50 } } });
  let clock = 0;
  const opts = { root, config, name: "test", log: () => {}, sleep: async () => { clock += 100; }, now: () => clock, load: () => 0, env: {} };
  let inner;
  const outer = await runMeasured({
    ...opts,
    argv: ["outer"],
    spawnChild: async () => {
      inner = await runMeasured({ ...opts, argv: ["inner"], spawnChild: async () => 0 });
      return 0;
    },
  });
  assert.equal(outer, 0);
  assert.equal(inner, EXIT_BUSY);
  assert.equal(await runMeasured({ ...opts, argv: ["again"], spawnChild: async () => 7 }), 7);
  assert.ok(lockPathFor(root).includes("saf"));
  assert.equal(await runMeasured({ ...opts, name: "nope", argv: ["x"] }), 2);
});

test("probe: passes when hooks answer and the hook-less control does not", async () => {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", title: "first" }] });
  const dir = tmp();
  const js = join(dir, "fake-claude.js");
  writeFileSync(js, `console.log(process.argv.includes("--settings") ? "unknown" : "M1 done 0/1 · none");\n`);
  let bin;
  if (process.platform === "win32") {
    bin = join(dir, "fake-claude.cmd");
    writeFileSync(bin, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
  } else {
    bin = join(dir, "fake-claude");
    writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`);
    chmodSync(bin, 0o755);
  }
  const r = await runProbe(fakeCtx(root, config), { bin, timeoutMs: 10_000 });
  assert.equal(r.pass, true, JSON.stringify(r));
});
