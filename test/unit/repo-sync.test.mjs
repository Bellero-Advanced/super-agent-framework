import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO, lib } from "../helpers.mjs";

const { planSetup } = await lib("generate.mjs");
const EX = join(REPO, "examples", "todo-api");
const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const lf = (root, rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const plan = (root) => planSetup(root, readJson(root, "saf.config.json"));
const owned = (a) => /^\.claude\/(commands|skills)\//.test(a.path);

/** The lines of the first bash block under `## Commands`, runs of spaces collapsed, trailing spaces removed. */
export function commandsBlock(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const from = lines.findIndex((l) => l === "## Commands" || l.startsWith("## Commands "));
  const open = lines.findIndex((l, i) => i > from && l.startsWith("```bash"));
  const close = lines.findIndex((l, i) => i > open && l.startsWith("```"));
  assert.ok(from >= 0 && open > from && close > open, "CLAUDE.md has a ## Commands heading with a bash block");
  return lines.slice(open + 1, close).map((l) => l.replace(/ +/g, " ").trimEnd());
}

const sameBlock = (actual, rendered) =>
  JSON.stringify(commandsBlock(actual)) === JSON.stringify(commandsBlock(rendered)) ? null : `the Commands block of CLAUDE.md differs from the rendering. Rendered block:\n${commandsBlock(rendered).join("\n")}`;

test("COPIES-AC-13 this repository's commands and skills equal the templates and the manifest holds their current hashes", () => {
  const p = plan(REPO);
  const files = p.actions.filter(owned);
  assert.ok(files.length >= 10, "commands and skills are planned");
  assert.deepEqual(files.filter((a) => a.action !== "same").map((a) => `${a.path}: ${a.action}`), []);
  const manifest = readJson(REPO, ".saf/manifest.json").files;
  assert.deepEqual(files.filter((a) => manifest[a.path] !== sha1(lf(REPO, a.path))).map((a) => `${a.path}: manifest hash is not the file's`), []);
});

test("COPIES-AC-14 this repository's CLAUDE.md Commands block equals the rendering, and a copy missing a line does not", () => {
  const rendered = plan(REPO).actions.find((a) => a.path === "CLAUDE.md").content;
  const actual = lf(REPO, "CLAUDE.md");
  assert.equal(sameBlock(actual, rendered), null, sameBlock(actual, rendered) ?? "");
  const lines = actual.split("\n");
  const at = lines.findIndex((l) => l.startsWith("npm run task:culprit"));
  assert.ok(at > 0, "the real file has the task:culprit line");
  const broken = sameBlock([...lines.slice(0, at), ...lines.slice(at + 1)].join("\n"), rendered);
  assert.match(broken ?? "", /Rendered block:/);
  assert.ok(broken.includes("npm run task:culprit"), "the message prints the rendered block");
});

test("COPIES-AC-15 the example plans no update for CLAUDE.md, commands, skills or agents", () => {
  const p = plan(EX);
  const scope = p.actions.filter((a) => a.path === "CLAUDE.md" || /^\.claude\/(commands|skills|agents)\//.test(a.path));
  assert.ok(scope.length >= 10, "the example plans those files");
  assert.deepEqual(scope.filter((a) => a.action === "update").map((a) => a.path), []);
});
