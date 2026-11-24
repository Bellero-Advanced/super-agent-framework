import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

const { generate, planSetup } = await lib("generate.mjs");
after(cleanup);

/** docs/specs/agent-instructions.md — the standing checks live in the agent templates. Data, not logic: what each file must say. */
const IMPLEMENTER_CHECKS = {
  "failing first": /see it fail|seen to fail|fail without the feature/i,
  "docs read whole": /whole/i,
  "size from the evidence": /verified\.size/,
  "sentence to code": /sentence → .*code/i,
  "windows-safe tests": /node:path.*CRLF.*process\.execPath.*argument array/is,
  "friction line": /friction: none/,
};
const REPORT_PARTS = [/verify result/, /files changed/, /size/, /failing-first/, /sentence → code/, /friction:/];
const TYPES = {
  text: [/every changed sentence/, /conditions/, /number or model id/, /repeated or contradicting/, /sentence → code list/],
  data: [/missing/, /dry run/, /archive before write/, /unreadable/, /second run changes nothing/],
  security: [/untrusted text/, /secret value/, /shell string/, /escapes the project/, /security-review/],
  refactor: [/old versus new/, /same inputs/, /every caller/],
};
const DESCRIPTIONS = {
  implementer: "description: Implementer — takes exactly one card (an id like T-M1-05), writes code and tests to the spec, and runs task:verify until it passes. Use when a card in docs/plan/tasks/ is ready (milestone active, depends passed). Does not edit specs and never touches files outside the card's touch list.",
  "spec-reviewer": "description: Spec reviewer (read only) — takes a card id whose task:verify passed, compares the code with the card and its spec, and returns pass or fail with every mismatch. Use after an implementer finishes a card and before it is committed or merged. Never edits, never runs commands, never trusts the implementer's summary.",
};

const read = (root, rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const section = (text, heading) => {
  const m = text.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  assert.ok(m, `section "${heading}" exists`);
  return m[1];
};
const project = () => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "npm" } }, { now: new Date("2026-01-02T00:00:00Z") });
  return root;
};

test("AGENT-AC-01 the implementer agent has 'Before you report' with the six checks and the report line", () => {
  const text = read(project(), ".claude/agents/implementer.md");
  const body = section(text, "Before you report");
  for (const [name, re] of Object.entries(IMPLEMENTER_CHECKS)) assert.match(body, re, name);
  assert.equal((body.match(/^\d+\. /gm) ?? []).length, 6, "six numbered checks");
  const report = text.slice(text.indexOf("Report in English"));
  for (const re of REPORT_PARTS) assert.match(report, re, String(re));
  assert.match(body, /no user-facing text/, "a card without user text says so");
  assert.match(body, /guard/, "a guard test is named as one");
  assert.doesNotMatch(text, /\{\{|\}\}/, "no unrendered placeholder");
});

test("AGENT-AC-02 the spec-reviewer agent names the four types, their checklists and the verdict rule", () => {
  const text = read(project(), ".claude/agents/spec-reviewer.md");
  const body = section(text, "Review types");
  for (const [type, items] of Object.entries(TYPES)) {
    const line = body.split("\n").find((l) => l.startsWith(`- \`${type}\``));
    assert.ok(line, `type ${type} has its line`);
    for (const re of items) assert.match(line, re, `${type}: ${re}`);
  }
  assert.match(section(text, "Check"), /size within/, "the general list stays above the types");
  assert.ok(text.indexOf("## Check") < text.indexOf("## Review types"), "types come below the general list");
  assert.match(section(text, "Verdict"), /types: .*none/s, "the verdict names the types (or none)");
  assert.match(section(text, "Verdict"), /general list only/);
  assert.match(section(text, "Input"), /text.*data.*security.*refactor/s, "the input names the types");
  assert.doesNotMatch(text, /\{\{|\}\}/, "no unrendered placeholder");
});

test("AGENT-AC-03 planSetup on this repository reports 'same' for every .claude/agents file of an enabled role", () => {
  const config = JSON.parse(readFileSync(join(REPO, "saf.config.json"), "utf8"));
  const plan = planSetup(REPO, config);
  const agents = plan.actions.filter((a) => a.path.startsWith(".claude/agents/"));
  assert.deepEqual(agents.map((a) => a.path.split("/").pop().replace(/\.md$/, "")).sort(), [...config.roles.enabled].sort());
  assert.deepEqual(agents.filter((a) => a.action !== "same").map((a) => `${a.path}: ${a.action}`), []);
  assert.ok(agents.some((a) => a.path.endsWith("implementer.md")) && agents.some((a) => a.path.endsWith("spec-reviewer.md")));
});

test("AGENT-AC-04 the description line of both roles is unchanged in the template and in the rendering", () => {
  const root = project();
  for (const [role, line] of Object.entries(DESCRIPTIONS)) {
    const lines = (text) => text.split("\n").filter((l) => l.startsWith("description:"));
    assert.deepEqual(lines(read(REPO, `kit/tools-saf/templates/agents/${role}.md`)), [line], `${role} template`);
    assert.deepEqual(lines(read(root, `.claude/agents/${role}.md`)), [line], `${role} rendering`);
    assert.match(read(REPO, `kit/tools-saf/templates/agents/${role}.md`), /^model: \{\{role\.model\}\}\neffort: \{\{role\.effort\}\}$/m, `${role} model and effort stay template variables`);
  }
});
