import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lib } from "../helpers.mjs";

/** Lane caps explanations and docs (docs/specs/lane-caps.md rules 10-12). */
const { LOCAL_KEYS, LANE_CEILING, LOCAL_CONFIG_FILE } = await lib("config.mjs");
const { CHOICES, MACHINE_SWITCHES } = await lib("choices.mjs");

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const entry = (q, v) => CHOICES.find((e) => e.question === q && e.values.includes(v));
const words = (e, lang) => Object.values(e[lang]).join(" ");

const DOCS = [
  "docs/config-reference.md",
  "docs/card-lifecycle.md",
  "kit/tools-saf/templates/en/docs/plan/README.md",
  "kit/tools-saf/templates/th/docs/plan/README.md",
  "kit/claude/skills/saf-setup/SKILL.md",
  "kit/claude/skills/saf-setup/questions.md",
];

test("LCAP-AC-06 MACHINE_SWITCHES has en and th lines for every LOCAL_KEYS key", () => {
  for (const key of LOCAL_KEYS) {
    const line = MACHINE_SWITCHES[key];
    assert.ok(line?.en?.trim() && line?.th?.trim(), `${key}: en and th line`);
  }
});

test("LCAP-AC-06 the lanes and side-lanes explanations name the worktree, the install step, the per-machine file and why the main lane stays one", () => {
  const custom = words(entry("lanes", "on-custom"), "en");
  assert.match(custom, /worktree/);
  assert.match(custom, /install step/);
  assert.ok(custom.includes(LOCAL_CONFIG_FILE));
  const lanesAll = ["on", "on-custom"].map((v) => words(entry("lanes", v), "en")).join(" ");
  assert.match(lanesAll, /main-folder lane stays one card/);
  assert.match(lanesAll, /share one folder/);
  assert.match(lanesAll, /start commit/);
  const more = words(entry("side-lanes", "on-more"), "en");
  assert.ok(more.includes(LOCAL_CONFIG_FILE));
  assert.match(more, /free lane slots/);
  for (const [q, v] of [["lanes", "on"], ["lanes", "on-custom"], ["side-lanes", "on"], ["side-lanes", "on-more"]]) {
    assert.ok(words(entry(q, v), "th").includes(LOCAL_CONFIG_FILE) || q === "lanes" && v === "on", `${q} ${v}: th names the file`);
  }
});

test("LCAP-AC-06 the docs, templates and skill name both lane caps as per-machine keys and none says the local file holds only workflow.testMode", () => {
  for (const f of DOCS) {
    const text = read(f);
    assert.ok(text.includes("workflow.lanes.code") && text.includes("workflow.sideLanes.max"), `${f}: names both per-machine caps`);
    assert.ok(text.includes("saf.config.local.json"), `${f}: names the local file`);
    assert.ok(!/only `workflow\.testMode`|holds only `workflow\.testMode`|เฉพาะ `workflow\.testMode`/.test(text), `${f}: still says only testMode`);
  }
  const ref = read("docs/config-reference.md");
  assert.ok(ref.includes("LANE_CEILING") && ref.includes(`(${LANE_CEILING}, in`), "config-reference names LANE_CEILING and its value");
  assert.match(ref, /no environment variable for lane caps/i);
  assert.match(ref, /start commit/);
  assert.match(read("docs/card-lifecycle.md"), /no environment variable/);
  assert.match(read("kit/claude/skills/saf-setup/SKILL.md"), /no environment variable/);
});
