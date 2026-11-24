import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

const { ARCHIVE, generate, mergeScriptsText, planLines, planSetup } = await lib("generate.mjs");
const { init, upgrade } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const SETTINGS = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (root, rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

/** A set-up project whose CLAUDE.md is edited and whose settings.json holds `body`. */
async function project(body) {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  put(root, "CLAUDE.md", `${read(root, "CLAUDE.md")}\nour own note\n`);
  put(root, `${ARCHIVE}/CLAUDE.md`, "older archive");
  put(root, SETTINGS, body);
  return root;
}

const OBJECT = "is not a JSON object";
const JSONERR = "is not valid JSON";
for (const [body, why, reason] of [["[]", OBJECT, `root ${OBJECT}`], ["null", OBJECT, `root ${OBJECT}`], ['"text"', OBJECT, `root ${OBJECT}`], ["{ nope", JSONERR, "not valid JSON"]]) {
  test(`RERUN-AC-20 settings.json holding ${body}: the warning and the dry-run line say "${why}" and name the archive path`, async () => {
    const root = await project(body);
    const plan = planSetup(root, ANSWERS);
    const dest = `${ARCHIVE}/${SETTINGS}`;
    assert.equal(plan.merges.settings.archivedTo, dest);
    const warning = plan.report.warnings.find((w) => w.startsWith(`${SETTINGS} `));
    assert.equal(warning, `${SETTINGS} ${why} — archived to ${dest} and replaced`);
    const line = planLines(plan).find((l) => l.includes(`${SETTINGS}:`));
    assert.ok(line.includes(`${reason}, archived to ${dest}`), line);
    const other = why === JSONERR ? OBJECT : JSONERR;
    assert.ok(!line.includes(other) && !warning.includes(other), "only one reason is named");
    const doc = plan.actions.find((a) => a.path === "CLAUDE.md");
    assert.equal(doc.action, "replace-edited");
    assert.equal(doc.to, `${ARCHIVE}/CLAUDE.md.1`);
    assert.ok(planLines(plan).some((l) => l.startsWith("replace-edited") && l.includes(" CLAUDE.md ") && l.endsWith(` → ${ARCHIVE}/CLAUDE.md.1`)), "the dry-run line ends with the archive target");
    assert.equal(read(root, SETTINGS), body, "a dry run writes nothing");
  });
}

test("RERUN-AC-20 the dry-run archive target of CLAUDE.md equals the real run's archived: line", async () => {
  const root = await project("[]");
  const plan = planSetup(root, ANSWERS);
  const target = planLines(plan).find((l) => l.startsWith("replace-edited") && l.includes(" CLAUDE.md ")).split(" → ").pop();
  const { report } = generate(root, ANSWERS);
  assert.ok(report.archived.includes(`CLAUDE.md → ${target}`), report.archived.join("\n"));
  assert.equal(read(root, target).includes("our own note"), true, "the archive holds the edited file");
  assert.equal(read(root, `${ARCHIVE}/${SETTINGS}`), "[]", "the old settings are archived byte for byte");
});

test("RERUN-AC-20 a settings.local.json holding [] is reported as not a JSON object, with its archive path", async () => {
  const root = await project(JSON.stringify({ env: { A: "1" } }));
  put(root, LOCAL, "[]");
  const plan = planSetup(root, ANSWERS);
  const dest = `${ARCHIVE}/${LOCAL}`;
  assert.ok(plan.report.warnings.includes(`${LOCAL} is not a JSON object — archived to ${dest} and replaced by the moved env block`), plan.report.warnings.join("\n"));
  const line = planLines(plan).find((l) => l.includes(`${SETTINGS}:`));
  assert.ok(line.includes(`${LOCAL} root is not a JSON object, archived to ${dest}`), line);
});

const MIN = '{"name":"x","scripts":{"test":"node --test"}}';
const WANT = { "task:culprit": "node tools/saf/bin/saf.mjs task culprit" };

test("UPG-AC-08 a minified one-line package.json stays one line when a script is added", () => {
  for (const [text, tail] of [[MIN, ""], [`${MIN}\n`, "\n"], [`${MIN}\r\n`, "\r\n"], [`﻿${MIN}\n`, "\n"]]) {
    const res = mergeScriptsText(text, WANT);
    const bom = text.startsWith("﻿") ? "﻿" : "";
    assert.equal(res.text, `${bom}${JSON.stringify({ name: "x", scripts: { test: "node --test", ...WANT } })}${tail}`);
  }
});

test("UPG-AC-08 a pretty package.json keeps its indent; an indent of 2 or tabs is not squeezed", () => {
  for (const indent of [2, "\t"]) {
    const res = mergeScriptsText(`${JSON.stringify(JSON.parse(MIN), null, indent)}\n`, WANT);
    assert.equal(res.text, `${JSON.stringify({ name: "x", scripts: { test: "node --test", ...WANT } }, null, indent)}\n`);
  }
});

test("UPG-AC-08 upgrade adds task:culprit to a minified package.json and the file is still one line", async () => {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  const pkg = JSON.parse(read(root, "package.json"));
  delete pkg.scripts["task:culprit"];
  writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg)}\n`);
  await upgrade(root);
  const text = read(root, "package.json");
  assert.equal(JSON.parse(text).scripts["task:culprit"], WANT["task:culprit"]);
  assert.equal(text.trimEnd().split("\n").length, 1, "still one line");
  assert.ok(text.endsWith("}\n") && !text.endsWith("\n\n"));
});
