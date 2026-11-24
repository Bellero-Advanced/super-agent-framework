import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp, write } from "../helpers.mjs";

const { loadConfig, ConfigError, TEST_MODES, DEFAULT_TEST_MODE, LOCAL_KEYS, FULL_SUITE_KEYS, TEST_MODE_ENV, LOCAL_CONFIG_FILE, loadSchema } = await lib("config.mjs");
const { generate, GITIGNORE_LINES } = await lib("generate.mjs");

after(cleanup);

const project = (repo = {}, local) => {
  const root = tmp();
  write(root, "saf.config.json", { version: 1, ...repo });
  if (local !== undefined) write(root, LOCAL_CONFIG_FILE, local);
  return root;
};

test("tables: modes, default, local keys, full-suite keys and the schema enum agree", () => {
  assert.deepEqual(TEST_MODES, ["every-card", "targeted", "milestone"]);
  assert.equal(DEFAULT_TEST_MODE, "milestone");
  assert.deepEqual(LOCAL_KEYS, ["workflow.testMode", "workflow.lanes.code", "workflow.sideLanes.max", "models.effort"]);
  assert.deepEqual(FULL_SUITE_KEYS, ["test", "e2e"]);
  assert.equal(TEST_MODE_ENV, "SAF_TEST_MODE");
  assert.equal(LOCAL_CONFIG_FILE, "saf.config.local.json");
  const props = loadSchema().properties;
  assert.deepEqual(props.workflow.properties.testMode.enum, TEST_MODES);
  assert.equal(props.stack.properties.commands.properties.testFiles.type, "string");
});

test("TMODE-AC-01 no testMode in any source gives milestone from default", () => {
  const c = loadConfig(project(), {});
  assert.equal(c.workflow.testMode, "milestone");
  assert.equal(c.workflow.testModeSource, "default");
});

test("TMODE-AC-02 env beats the local file, the local file beats the repo file", () => {
  const root = project({ workflow: { testMode: "targeted" } }, { workflow: { testMode: "every-card" } });
  const repoOnly = loadConfig(project({ workflow: { testMode: "targeted" } }), {});
  assert.deepEqual([repoOnly.workflow.testMode, repoOnly.workflow.testModeSource], ["targeted", "repo"]);
  const local = loadConfig(root, {});
  assert.deepEqual([local.workflow.testMode, local.workflow.testModeSource], ["every-card", "local"]);
  const env = loadConfig(root, { SAF_TEST_MODE: "milestone" });
  assert.deepEqual([env.workflow.testMode, env.workflow.testModeSource], ["milestone", "env"]);
});

test("TMODE-AC-03 a local key outside the allow-list is an error that names it", () => {
  const root = project({}, { workflow: { lanes: { main: 1 } } });
  assert.throws(() => loadConfig(root, {}), (e) => e instanceof ConfigError && e.message.includes("workflow.lanes.main") && e.message.includes(LOCAL_CONFIG_FILE));
  const top = project({}, { project: { name: "x" } });
  assert.throws(() => loadConfig(top, {}), /project/);
});

test("TMODE-AC-03 an invalid local value or invalid JSON names the local file", () => {
  assert.throws(() => loadConfig(project({}, { workflow: { testMode: "fast" } }), {}), (e) => e instanceof ConfigError && e.message.includes(LOCAL_CONFIG_FILE));
  const root = project();
  write(root, LOCAL_CONFIG_FILE, "{ nope");
  assert.throws(() => loadConfig(root, {}), (e) => e instanceof ConfigError && e.message.includes(LOCAL_CONFIG_FILE) && e.message.includes("JSON"));
});

test("TMODE-AC-03 an invalid SAF_TEST_MODE lists the valid modes", () => {
  assert.throws(() => loadConfig(project(), { SAF_TEST_MODE: "fast" }), (e) => e instanceof ConfigError && TEST_MODES.every((m) => e.message.includes(m)) && e.message.includes("SAF_TEST_MODE"));
  assert.equal(loadConfig(project(), { SAF_TEST_MODE: "" }).workflow.testModeSource, "default");
});

test("TMODE-AC-04 generated files are byte-equal with and without a local file; .gitignore lists it", () => {
  const answers = { project: { name: "Demo", type: "api" }, stack: { packageManager: "npm", commands: { test: "npm test" } } };
  const now = new Date("2026-01-02T00:00:00Z");
  const a = gitRepo();
  const b = gitRepo();
  write(b, LOCAL_CONFIG_FILE, { workflow: { testMode: "every-card" } });
  const prev = process.env.SAF_TEST_MODE;
  process.env.SAF_TEST_MODE = "targeted";
  try {
    generate(a, answers, { now });
    generate(b, answers, { now });
  } finally {
    if (prev === undefined) delete process.env.SAF_TEST_MODE;
    else process.env.SAF_TEST_MODE = prev;
  }
  const files = (r) => JSON.parse(readFileSync(join(r, ".saf", "manifest.json"), "utf8")).files;
  assert.deepEqual(files(a), files(b));
  for (const rel of ["saf.config.json", "CLAUDE.md", "docs/plan/STATE.md", ".gitignore"]) assert.equal(readFileSync(join(a, rel), "utf8"), readFileSync(join(b, rel), "utf8"), rel);
  assert.ok(GITIGNORE_LINES.includes(LOCAL_CONFIG_FILE));
  assert.ok(readFileSync(join(a, ".gitignore"), "utf8").split(/\r?\n/).includes(LOCAL_CONFIG_FILE));
});

test("this repo pins targeted with a testFiles command and ignores the local file", () => {
  const raw = JSON.parse(readFileSync(join(REPO, "saf.config.json"), "utf8"));
  assert.equal(raw.workflow.testMode, "targeted");
  assert.equal(raw.stack.commands.testFiles, "node --test {files}");
  assert.ok(readFileSync(join(REPO, ".gitignore"), "utf8").split(/\r?\n/).includes(LOCAL_CONFIG_FILE));
});
