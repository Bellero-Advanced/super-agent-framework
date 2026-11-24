import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lib } from "../helpers.mjs";

/** Lane caps explanations and docs (docs/specs/lane-caps.md rules 10-12). */
const { LOCAL_KEYS, LANE_CEILING, MAX_PORT, LOCAL_CONFIG_FILE } = await lib("config.mjs");
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
  assert.match(custom, /main-folder lane stays one card/);
  assert.match(custom, /two cards cannot be told apart/);
  assert.match(custom, /since the start commit/);
  for (const [q, v] of [["lanes", "on"], ["side-lanes", "on"], ["side-lanes", "on-more"]]) {
    const en = words(entry(q, v), "en");
    assert.match(en, /worktree/, `${q} ${v}: worktree`);
    assert.match(en, /install step/, `${q} ${v}: install step`);
    assert.match(en, /CPU, memory and disk/, `${q} ${v}: cost`);
    assert.match(words(entry(q, v), "th"), /worktree/, `${q} ${v}: th worktree`);
  }
  for (const v of ["on", "on-more"]) assert.ok(words(entry("side-lanes", v), "en").includes(LOCAL_CONFIG_FILE), `side-lanes ${v}: file`);
  for (const [q, v] of [["lanes", "on-custom"], ["side-lanes", "on"], ["side-lanes", "on-more"]]) assert.ok(words(entry(q, v), "th").includes(LOCAL_CONFIG_FILE), `${q} ${v}: th file`);
});

test("LCAP-AC-06 rule 12 file by file: every LOCAL_KEYS key, LANE_CEILING, no environment variable for caps and why the main lane stays one", () => {
  for (const f of DOCS) {
    const text = read(f);
    for (const k of LOCAL_KEYS) assert.ok(text.includes(k), `${f}: names ${k}`);
    assert.ok(text.includes("LANE_CEILING"), `${f}: names LANE_CEILING`);
    assert.ok(/no environment variable|ไม่มีตัวแปรสภาพแวดล้อม/i.test(text), `${f}: no env variable for caps`);
    assert.ok(/cannot be told apart|could not be told apart|แยกการ์ดสองใบไม่ได้/.test(text), `${f}: why the main lane stays one`);
    assert.ok(!/only \`workflow\.testMode\`|เฉพาะ \`workflow\.testMode\`/.test(text), `${f}: still says only testMode`);
  }
  const ref = read("docs/config-reference.md");
  assert.ok(ref.includes(`(${LANE_CEILING}, in`), "config-reference names the ceiling value");
  assert.ok(ref.includes(`now ${LANE_CEILING})`), "the lanes row names the ceiling value");
  assert.ok(ref.includes(`above ${MAX_PORT}`) && ref.includes(`at most ${MAX_PORT}`), "config-reference names the highest port in both places");
});
