import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, fakeCtx, lib, planRepo, tmp, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const tm = await lib("testmode.mjs");
after(cleanup);

const SAF = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const saf = (cwd, ...args) => spawnSync(process.execPath, [SAF, ...args], { cwd, encoding: "utf8" });

test("SETUP-AC-12 choices refuses every argument it does not define with the usage line and exit 2", () => {
  const root = tmp();
  const bad = [
    ["--group", "2", "--foo"],
    ["--lang=th", "--not-asked"],
    ["foo", "--group", "2"],
    ["--group", "2", "--group", "3"],
    ["--group", "2", "--not-asked"],
    ["--not-asked", "--lang", "th", "--lang", "en"],
    ["--group=2"],
  ];
  for (const args of bad) {
    const r = saf(root, "choices", ...args);
    assert.equal(r.status, 2, `choices ${args.join(" ")}`);
    assert.match(r.stderr, /^usage: choices --group/, args.join(" "));
    assert.equal(r.stdout, "", `no explanation for: ${args.join(" ")}`);
  }
  assert.equal(saf(root, "choices", "--group", "2", "--lang", "th").status, 0);
  assert.equal(saf(root, "choices", "--not-asked").status, 0);
});

test("SETUP-AC-12 config takes exactly --check; a broken saf.config.json exits 1 with one line naming it and no stack trace", () => {
  const root = tmp();
  write(root, "saf.config.json", "{ nope");
  for (const args of [["config"], ["config", "--check", "--foo"], ["config", "--foo"], ["config", "--check", "--check"]]) {
    const r = saf(root, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /^usage: /, args.join(" "));
    assert.equal(r.stdout, "");
  }
  for (const [content, text] of [["{ nope", "is not valid JSON"], ["[]", "is not a JSON object"], ["null", "is not a JSON object"]]) {
    write(root, "saf.config.json", content);
    const r = saf(root, "config", "--check");
    assert.equal(r.status, 1, content);
    const lines = r.stderr.trim().split(/\r?\n/);
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], new RegExp(`^✗ saf\\.config\\.json ${text}`));
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  }
});

test("SETUP-AC-13 a config that is valid JSON but fails the schema still gives its chatLanguage", () => {
  const root = tmp();
  const marker = (lang) => saf(root, "choices", "--not-asked", "--lang", lang).stdout;
  for (const lang of ["th", "fr"]) {
    write(root, "saf.config.json", { people: { chatLanguage: lang }, workflow: { rigor: "not-a-level" }, unknownTop: 1 });
    const r = saf(root, "choices", "--not-asked");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, marker(lang === "th" ? "th" : "en"), lang);
  }
  assert.notEqual(marker("th"), marker("en"));
});

test("TMODE-AC-20 each targeted.fallback names its own cause: no command, no {files} placeholder, no targeted files", async () => {
  const card = { id: "T-M1-01", touch: ["src/**", "test/**"], scenarios: ["AUTH-AC-01"], criteria: ["npm test"] };
  const cases = [
    { testFiles: null, test: true, expect: "no stack.commands.testFiles command" },
    { testFiles: "run-tests", test: true, expect: `stack.commands.testFiles has no ${tm.FILES_PLACEHOLDER} placeholder` },
    { testFiles: `run-tests ${tm.FILES_PLACEHOLDER}`, test: false, expect: "no targeted test files" },
  ];
  const seen = [];
  for (const c of cases) {
    const commands = { test: "npm test", ...(c.testFiles === null ? {} : { testFiles: c.testFiles }) };
    const { root, config } = await planRepo({ config: { stack: { packageManager: "none", commands }, workflow: { lanes: { code: 3, main: 1 } } }, cards: [{ ...card, scenarios: c.test ? card.scenarios : [] }] });
    config.workflow.testMode = "milestone";
    config.workflow.testModeSource = "repo";
    const ctx = fakeCtx(root, config);
    task.startCard(ctx, "T-M1-01");
    if (c.test) write(root, "test/auth.test.js", 'test("AUTH-AC-01 signs in", () => {});\n');
    else write(root, "src/a.js", "export const a = 1;\n");
    const r = await task.verifyCard(ctx, "T-M1-01");
    assert.equal(r.status, "done");
    assert.deepEqual(ctx.ran, ["npm test"], "the full suite ran");
    assert.equal(r.verified.targeted.fallback, c.expect);
    seen.push(r.verified.targeted.fallback);
  }
  assert.equal(new Set(seen).size, 3);
});
