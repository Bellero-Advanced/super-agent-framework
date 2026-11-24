import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

const { generate, mergeScriptsText, engineScripts, LIVING_FILES } = await lib("generate.mjs");
const { resolveConfig } = await lib("config.mjs");
const { init, upgrade } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const manifest = (root) => JSON.parse(read(root, ".saf/manifest.json")).files;
/** Edit a file keeping its line endings, so the tests also pass on a CRLF checkout of the templates. */
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(read(root, rel)));

async function project() {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  return root;
}

test("RERUN-AC-01 a re-run keeps an edited decision log and an active M1.md, and still replaces an edited CLAUDE.md", async () => {
  const root = await project();
  edit(root, "docs/DECISIONS.md", (t) => `${t}\n| D-900 | our own decision | decided |\n`);
  edit(root, "docs/plan/milestones/M1.md", (t) => t.replace("status: planned", "status: active"));
  edit(root, "CLAUDE.md", (t) => `${t}\nour own note\n`);
  const keep = { decisions: read(root, "docs/DECISIONS.md"), m1: read(root, "docs/plan/milestones/M1.md"), m0: read(root, "docs/plan/milestones/M0.md") };
  const before = manifest(root);

  const { report } = generate(root, ANSWERS);

  assert.equal(read(root, "docs/DECISIONS.md"), keep.decisions, "decision log byte-identical");
  assert.equal(read(root, "docs/plan/milestones/M1.md"), keep.m1, "active M1 byte-identical");
  assert.match(read(root, "docs/plan/milestones/M1.md"), /status: active/);
  assert.equal(read(root, "docs/plan/milestones/M0.md"), keep.m0, "untouched M0 stays");
  assert.ok(!existsSync(join(root, "docs/archive/pre-saf/docs/DECISIONS.md")), "decision log not archived");
  assert.ok(!existsSync(join(root, "docs/archive/pre-saf/docs/plan/milestones/M1.md")), "M1 not archived");
  for (const rel of ["docs/DECISIONS.md", "docs/plan/milestones/M1.md"]) {
    assert.ok(report.kept.includes(rel), `${rel} in report.kept`);
    assert.ok(report.warnings.some((w) => w.includes(rel) && w.includes("has your edits") && w.includes("kept")), `${rel} warned`);
    assert.equal(manifest(root)[rel], before[rel], `${rel} manifest entry unchanged`);
    assert.ok(!report.written.includes(rel), `${rel} not written`);
  }
  assert.deepEqual(report.archived.map((a) => a.split(" → ")[0]), ["CLAUDE.md"], "only the edited non-living file is archived");
  assert.match(read(root, "CLAUDE.md"), /^# /m);
  assert.ok(!read(root, "CLAUDE.md").includes("our own note"), "edited CLAUDE.md replaced");
});

test("RERUN-AC-01 a CRLF checkout of an unedited living file is not an edit; an unedited living file is still updated", async () => {
  const root = await project();
  const crlf = read(root, "docs/DECISIONS.md").replace(/\r?\n/g, "\r\n");
  writeFileSync(join(root, "docs/DECISIONS.md"), crlf);
  const { report } = generate(root, ANSWERS);
  assert.ok(!report.kept.includes("docs/DECISIONS.md"));
  assert.ok(!report.warnings.some((w) => w.includes("has your edits")));
  assert.equal(report.archived.length, 0);
  // a living file the manifest does not know counts as edited
  const bare = await project();
  const m = JSON.parse(read(bare, ".saf/manifest.json"));
  delete m.files["docs/INDEX.md"];
  writeFileSync(join(bare, ".saf/manifest.json"), JSON.stringify(m));
  edit(bare, "docs/INDEX.md", (t) => `${t}\nmine\n`);
  const r2 = generate(bare, ANSWERS);
  assert.ok(r2.report.kept.includes("docs/INDEX.md"));
  assert.ok(!("docs/INDEX.md" in manifest(bare)), "no manifest entry invented");
  assert.ok(read(bare, "docs/INDEX.md").endsWith("mine\n"));
});

test("RERUN-AC-01 an unedited living file is really updated when the answers change what it says", async () => {
  const root = await project();
  const old = read(root, "docs/DECISIONS.md");
  const oldHash = manifest(root)["docs/DECISIONS.md"];
  const changed = { ...ANSWERS, project: { rigor: "strict" } };
  const { report } = generate(root, changed);
  const now = read(root, "docs/DECISIONS.md");
  assert.notEqual(now, old, "the bytes changed");
  assert.match(now, /Rigor level \*\*strict\*\*/);
  assert.ok(report.written.includes("docs/DECISIONS.md"), "in report.written");
  assert.ok(!report.kept.includes("docs/DECISIONS.md"), "not kept");
  assert.ok(!report.warnings.some((w) => w.includes("docs/DECISIONS.md")), "no edit warning");
  assert.equal(report.archived.length, 0, "nothing archived");
  assert.notEqual(manifest(root)["docs/DECISIONS.md"], oldHash, "manifest entry follows the new text");
});

test("RERUN-AC-01 LIVING_FILES covers the decision log, the index, milestones and cards", () => {
  const living = (rel) => LIVING_FILES.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p));
  for (const rel of ["docs/DECISIONS.md", "docs/INDEX.md", "docs/plan/milestones/M1.md", "docs/plan/tasks/M0/T-M0-01.md", "docs/plan/tasks/_template.md"]) assert.ok(living(rel), rel);
  for (const rel of ["CLAUDE.md", "docs/plan/README.md", "docs/specs/_template.md", ".claude/agents/designer.md"]) assert.ok(!living(rel), rel);
});

const pkgPath = (root) => join(root, "package.json");
function rewritePkg(root, { drop = [], indent = 4, eol = "\n", tail = true, bom = "" } = {}) {
  const pkg = JSON.parse(read(root, "package.json").replace(/^\uFEFF/, ""));
  for (const k of drop) delete pkg.scripts[k];
  const text = bom + JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + (tail ? eol : "");
  writeFileSync(pkgPath(root), text);
  return text;
}

test("RERUN-AC-02 a re-run leaves package.json byte-identical when no script is missing, and adds only the missing one otherwise", async () => {
  const root = await project();
  const text = rewritePkg(root, { indent: 4 });
  const r1 = generate(root, ANSWERS);
  assert.equal(read(root, "package.json"), text, "re-indented file untouched");
  assert.ok(!r1.report.written.some((w) => w.startsWith("package.json")));

  rewritePkg(root, { indent: 4, drop: ["task:culprit"] });
  const r2 = generate(root, ANSWERS);
  const out = read(root, "package.json");
  assert.match(out, /^\{\n {4}"/, "4-space indent kept");
  assert.ok(out.endsWith("}\n"), "trailing newline kept");
  assert.equal(JSON.parse(out).scripts["task:culprit"], "node tools/saf/bin/saf.mjs task culprit");
  assert.ok(r2.report.written.includes("package.json (scripts merged)"));

  // BOM + CRLF + no trailing newline survive a setup write
  const odd = await project();
  rewritePkg(odd, { indent: "\t", eol: "\r\n", tail: false, bom: "\uFEFF", drop: ["task:culprit"] });
  generate(odd, ANSWERS);
  const o = read(odd, "package.json");
  assert.ok(o.startsWith("\uFEFF{\r\n\t\""), "BOM, CRLF and tab kept");
  assert.ok(o.endsWith("}") && !o.endsWith("\n"), "no trailing newline stays none");
  assert.ok(!/[^\r]\n/.test(o), "no bare LF");
});

test("RERUN-AC-02 setup still creates a missing package.json, warns on invalid JSON, and upgrade shares the one merge function", async () => {
  const fresh = gitRepo();
  await init(fresh, { answers: ANSWERS });
  assert.equal(JSON.parse(read(fresh, "package.json")).scripts.saf, "node tools/saf/bin/saf.mjs");
  assert.ok(read(fresh, "package.json").endsWith("}\n"));

  const bad = await project();
  writeFileSync(pkgPath(bad), "{ not json");
  const r = generate(bad, ANSWERS);
  assert.equal(read(bad, "package.json"), "{ not json");
  assert.ok(r.report.warnings.some((w) => w.includes("package.json is not valid JSON")));

  const config = resolveConfig(ANSWERS);
  const want = engineScripts(config);
  const same = `{\n    "scripts": ${JSON.stringify(want)}\n}\n`;
  assert.equal(mergeScriptsText(same, want).text, null, "nothing added → null text");
  const one = mergeScriptsText('{\r\n  "name": "x"\r\n}\r\n', { a: "1" });
  assert.deepEqual(one.added, ["a"]);
  assert.equal(one.text, '{\r\n  "name": "x",\r\n  "scripts": {\r\n    "a": "1"\r\n  }\r\n}\r\n');
  assert.deepEqual(mergeScriptsText('{"scripts":{"a":"2"}}', { a: "1" }).kept, ["a"]);
  assert.equal(mergeScriptsText("[1]", { a: "1" }).invalid, true);
  assert.equal(mergeScriptsText("{ nope", { a: "1" }).invalid, true);

  // upgrade after a setup re-run: the second case of the scenario
  const root = await project();
  rewritePkg(root, { indent: 4, drop: ["task:culprit"] });
  const res = await upgrade(root);
  assert.deepEqual(res.scripts.added, ["task:culprit"]);
  assert.match(read(root, "package.json"), /^\{\n {4}"/);
  assert.ok(read(root, "package.json").endsWith("}\n"));
});
