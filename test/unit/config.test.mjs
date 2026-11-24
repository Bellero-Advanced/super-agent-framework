import assert from "node:assert/strict";
import { test } from "node:test";
import { lib } from "../helpers.mjs";

const { resolveConfig, roleTable, validateConfig, scriptCommand, MODEL_PRESETS, MODELS, CORE_ROLES, SIZE_CAPS } = await lib("config.mjs");

test("presets map planner and builder tiers; effort is per role, not per preset", () => {
  const efforts = {};
  for (const preset of ["max", "balanced", "economy"]) {
    const c = resolveConfig({ models: { preset }, roles: { enabled: ["security-auditor"] } });
    const roles = roleTable(c);
    assert.equal(roles.find((r) => r.name === "designer").model, MODEL_PRESETS[preset].planner);
    assert.equal(roles.find((r) => r.name === "implementer").model, MODEL_PRESETS[preset].builder);
    assert.equal(roles.find((r) => r.name === "security-auditor").model, MODEL_PRESETS[preset].planner);
    for (const r of roles) (efforts[r.name] ??= new Set()).add(r.effort);
  }
  for (const set of Object.values(efforts)) assert.equal(set.size, 1);
  assert.equal(MODEL_PRESETS.max.planner, MODELS.fable);
});

test("core roles always come first; custom roles are added; overrides win", () => {
  const c = resolveConfig({ roles: { enabled: ["db-guardian"], custom: [{ name: "ops-helper", description: "ops", tier: "planner" }] }, models: { overrides: { "qa-runner": { effort: "low" } } } });
  const names = roleTable(c).map((r) => r.name);
  assert.deepEqual(names.slice(0, 4), CORE_ROLES);
  assert.ok(names.includes("db-guardian") && names.includes("ops-helper"));
  assert.equal(roleTable(c).find((r) => r.name === "qa-runner").effort, "low");
  assert.equal(roleTable(c).find((r) => r.name === "ops-helper").custom, true);
});

test("rigor sets sizes, review and merge checks", () => {
  const light = resolveConfig({ project: { rigor: "light" }, stack: { packageManager: "pnpm", commands: { test: "pnpm test", lint: "pnpm lint" } } });
  assert.deepEqual(light.workflow.sizes, { M: SIZE_CAPS.M.code, L: SIZE_CAPS.L.code });
  assert.equal(light.workflow.review, "m-cards");
  assert.deepEqual(light.workflow.mergeChecks, ["pnpm test", "pnpm check-secrets", "pnpm docs:check"]);
  const strict = resolveConfig({ project: { rigor: "strict" } });
  assert.deepEqual(strict.workflow.sizes, light.workflow.sizes); // one table for every rigor
  assert.equal(strict.workflow.review, "every-card+security");
  assert.deepEqual(resolveConfig({ workflow: { sizes: { M: 10, L: 20 } } }).workflow.sizes, { M: 10, L: 20 });
});

test("scriptCommand follows the package manager (npm needs --)", () => {
  assert.equal(scriptCommand("npm", "task:verify", "T-M1-01"), "npm run task:verify -- T-M1-01");
  assert.equal(scriptCommand("pnpm", "task:verify", "T-M1-01"), "pnpm task:verify T-M1-01");
  assert.equal(scriptCommand("yarn", "docs:check"), "yarn docs:check");
  assert.equal(scriptCommand("bun", "docs:check"), "bun run docs:check");
  assert.equal(scriptCommand("none", "task:verify", "T-M1-01"), "node tools/saf/bin/saf.mjs task verify T-M1-01");
  assert.equal(scriptCommand("none", "measure", "x"), "node tools/saf/bin/saf.mjs measure adhoc -- x");
});

test("schema rejects unknown keys, bad enums and short model ids", () => {
  assert.deepEqual(validateConfig({ project: { name: "x", type: "web-app" } }), []);
  assert.ok(validateConfig({ project: { typo: 1 } }).length);
  assert.ok(validateConfig({ project: { type: "spaceship" } }).length);
  assert.ok(validateConfig({ models: { planner: "opus" } }).length);
  assert.deepEqual(validateConfig({ models: { preset: "custom", planner: "claude-opus-5-5", builder: "claude-haiku-5-5" } }), []);
  assert.ok(validateConfig({ roles: { custom: [{ name: "Bad Name" }] } }).length);
});
