import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { generate, planSetup } = await lib("generate.mjs");
const { init } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const NOW = new Date("2026-01-02T03:04:05Z");
const SAF_CLI = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const sha = (s) => createHash("sha1").update(s).digest("hex");
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(read(root, rel)));

/** Every file (bytes hashed) and every folder under root — the whole tree, nothing skipped. */
function snapshot(root) {
  const out = {};
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = abs.slice(root.length + 1).split("\\").join("/");
      if (e.isDirectory()) {
        out[`${rel}/`] = "dir";
        visit(abs);
      } else out[rel] = createHash("sha256").update(readFileSync(abs)).digest("hex");
    }
  };
  visit(root);
  return out;
}

async function project() {
  const root = gitRepo();
  await init(root, { answers: ANSWERS, now: NOW });
  return root;
}

function answersFile(answers = ANSWERS) {
  const file = join(tmp("saf-answers-"), "answers.json");
  writeFileSync(file, JSON.stringify(answers));
  return file;
}

const cli = (cwd, ...args) => spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", answersFile(), ...args], { cwd, encoding: "utf8" });
const NOTHING = "setup --dry-run: nothing was written";

test("RERUN-AC-03 planSetup on a set-up project with edits changes no byte and no folder", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nour note\n`);
  edit(root, "docs/DECISIONS.md", (t) => `${t}\n| D-900 | ours | decided |\n`);
  put(root, ".claude/settings.json", JSON.stringify({ env: { SECRET_KEY: "x" } }));
  const before = snapshot(root);
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.deepEqual(snapshot(root), before);
  assert.equal(plan.actions.find((a) => a.path === "CLAUDE.md").action, "replace-edited");
  assert.equal(plan.actions.find((a) => a.path === "docs/DECISIONS.md").action, "keep-edited");
  assert.equal(plan.merges.settings.envMoved, true);
  assert.deepEqual(plan.merges.settings.hooks, ["SessionStart", "Stop"]);
});

test("RERUN-AC-03 planSetup in an empty folder writes nothing — no .saf/, no archive, no folder at all", () => {
  const root = tmp();
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.deepEqual(readdirSync(root), []);
  assert.ok(plan.actions.length > 20 && plan.actions.every((a) => a.action === "create"));
  assert.equal(plan.merges.packageJson.state, "create");
  assert.equal(plan.merges.config.action, "create");
});

test("RERUN-AC-03 planSetup on a first run with --adopt lists the archive moves and still writes nothing", () => {
  const root = tmp();
  put(root, "CLAUDE.md", "# mine\n");
  put(root, ".claude/agents/mine.md", "mine\n");
  const before = snapshot(root);
  const yes = planSetup(root, ANSWERS, { now: NOW, adopt: true });
  const no = planSetup(root, ANSWERS, { now: NOW, adopt: false });
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(yes.merges.adopt.map((a) => a.path), [".claude/agents/mine.md"]);
  assert.equal(yes.merges.adopt[0].to, "docs/archive/pre-saf/.claude/agents/mine.md");
  assert.deepEqual(no.merges.adopt, []);
  assert.equal(no.actions.find((a) => a.path === "CLAUDE.md").action, "replace-edited");
});

test("RERUN-AC-03 the CLI --dry-run in a set-up project and in an empty folder: exit 0, nothing-written line first, tree unchanged", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nour note\n`);
  edit(root, "docs/DECISIONS.md", (t) => `${t}\n| D-900 | ours | decided |\n`);
  const before = snapshot(root);
  const r = cli(root, "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split("\n")[0], NOTHING);
  assert.match(r.stdout, /^replace-edited\s+CLAUDE\.md\s+\S/m);
  assert.match(r.stdout, /^keep-edited\s+docs\/DECISIONS\.md\s+\S/m);
  assert.match(r.stdout, /package\.json/);
  assert.deepEqual(snapshot(root), before);

  const empty = tmp();
  const e = cli(empty, "--dry-run");
  assert.equal(e.status, 0, e.stderr);
  assert.equal(e.stdout.split("\n")[0], NOTHING);
  assert.match(e.stdout, /^create\s+CLAUDE\.md\s+\S/m);
  assert.deepEqual(readdirSync(empty), [], "no .saf/ or anything else appears");

  const bad = cli(empty, "--dry-run");
  assert.equal(bad.status, 0);
  const wrong = spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", answersFile({ project: { type: "nope" } }), "--dry-run"], { cwd: empty, encoding: "utf8" });
  assert.equal(wrong.status, 1, "invalid answers fail like setup");
  assert.equal(wrong.stdout, "", "the nothing-written line only follows a plan that worked");
  assert.match(wrong.stderr, /setup answers are invalid/);
  assert.deepEqual(readdirSync(empty), []);
});

test("RERUN-AC-03 the CLI --dry-run honours --adopt and --no-adopt", () => {
  const root = tmp();
  put(root, ".claude/agents/mine.md", "mine\n");
  const yes = cli(root, "--dry-run", "--adopt");
  const no = cli(root, "--dry-run", "--no-adopt");
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /adopt\s+\.claude\/agents\/mine\.md/);
  assert.doesNotMatch(no.stdout, /adopt\s+\.claude\/agents\/mine\.md/);
  assert.ok(existsSync(join(root, ".claude/agents/mine.md")));
});

test("RERUN-AC-03 and a usage error without --answers", () => {
  const r = spawnSync(process.execPath, [SAF_CLI, "setup", "--dry-run"], { cwd: tmp(), encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: setup --answers <file\.json> \[--adopt\|--no-adopt\] \[--dry-run\]/);
});

test("RERUN-AC-04 one fixture with every action: the plan's actions match the real run, list for list", async () => {
  const root = await project();
  // create: a rendered file that is gone
  rmSync(join(root, ".claude/commands/saf-plan.md"));
  // update: SAF wrote it, nobody edited it, the new template differs
  const old = "old text SAF once wrote\n";
  put(root, "docs/plan/README.md", old);
  // replace-edited / keep-edited
  edit(root, "CLAUDE.md", (t) => `${t}\nour note\n`);
  edit(root, "docs/DECISIONS.md", (t) => `${t}\n| D-900 | ours | decided |\n`);
  // remove / keep-unplanned
  put(root, ".claude/rules/gone.md", "shipped once\n");
  put(root, ".claude/rules/mine.md", "shipped once\n");
  const m = JSON.parse(read(root, ".saf/manifest.json"));
  m.files["docs/plan/README.md"] = sha(old);
  m.files[".claude/rules/gone.md"] = sha("shipped once\n");
  m.files[".claude/rules/mine.md"] = sha("shipped once\n");
  writeFileSync(join(root, ".saf/manifest.json"), JSON.stringify(m, null, 2));
  put(root, ".claude/rules/mine.md", "shipped once, then edited\n");
  put(root, "package.json", `{\n    "name": "x"\n}\n`);

  const plan = planSetup(root, ANSWERS, { now: NOW });
  const prior = Object.fromEntries(plan.actions.map((a) => [a.path, existsSync(join(root, a.path)) ? read(root, a.path) : null]));
  const act = Object.fromEntries(plan.actions.map((a) => [a.path, a.action]));
  assert.equal(act[".claude/commands/saf-plan.md"], "create");
  assert.equal(act[".claude/commands/saf.md"], "same");
  assert.equal(act["docs/plan/README.md"], "update");
  assert.equal(act["CLAUDE.md"], "replace-edited");
  assert.equal(act["docs/DECISIONS.md"], "keep-edited");
  assert.equal(act[".claude/rules/gone.md"], "remove");
  assert.equal(act[".claude/rules/mine.md"], "keep-unplanned");
  assert.ok(plan.actions.every((a) => a.reason), "every line says why");
  assert.deepEqual(plan.merges.packageJson.added.length > 5, true);

  const { report } = generate(root, ANSWERS, { now: NOW });

  // each planned action is checked against what is on disk afterwards, not against the plan's own report
  for (const a of plan.actions) {
    const had = prior[a.path];
    const now = existsSync(join(root, a.path)) ? read(root, a.path) : null;
    const archived = a.to ?? `docs/archive/pre-saf/${a.path}`;
    if (a.action === "create" || a.action === "update") assert.equal(now, a.content, a.path);
    if (a.action === "replace-edited") {
      assert.equal(now, a.content, a.path);
      assert.equal(read(root, archived), had, `${a.path} archived with its old bytes`);
    }
    if (a.action === "same") assert.equal(now, had, a.path);
    if (a.action === "keep-edited" || a.action === "keep-unplanned") {
      assert.equal(now, had, `${a.path} unchanged`);
      assert.ok(!existsSync(join(root, archived)), `${a.path} not archived`);
    }
    if (a.action === "remove") assert.equal(now, null, `${a.path} gone`);
  }
  const wrote = plan.actions.filter((a) => a.content !== undefined && a.action !== "keep-edited").map((a) => a.path);
  assert.deepEqual(report.written.filter((w) => wrote.includes(w)), wrote, "every non-kept rendered file is reported written, in order");
  assert.ok(report.written.length === wrote.length + 3 && !report.written.includes("docs/DECISIONS.md"), "plus config, package.json and settings only");
  assert.deepEqual(report.archived, plan.actions.filter((a) => a.to).map((a) => `${a.path} → ${a.to}`));
  assert.ok(report.written.includes(".claude/commands/saf-plan.md") && report.written.includes("docs/plan/README.md"));
  assert.deepEqual(report.removed, [".claude/rules/gone.md"]);
  assert.ok(report.kept.includes("docs/DECISIONS.md"));
  assert.ok(report.kept.includes(".claude/rules/mine.md"), "the real report keeps the plain path (RERUN-AC-16 rule 31)");
  assert.deepEqual(plan.actions.filter((a) => a.action === "keep-unplanned").map((a) => a.path), [".claude/rules/mine.md"], "the plan's kept entry is a plain path");
  assert.ok(!existsSync(join(root, ".claude/rules/gone.md")));
  assert.equal(read(root, ".claude/rules/mine.md"), "shipped once, then edited\n");
  assert.ok(existsSync(join(root, "docs/archive/pre-saf/CLAUDE.md")));
  assert.ok(!read(root, "docs/plan/README.md").includes("old text"));
  assert.match(read(root, "package.json"), /^\{\n {4}"name": "x",\n {4}"scripts"/, "package.json merged with its own indentation");
});

test("RERUN-AC-04 the plan's merges and status files are what the real run leaves on disk", async () => {
  const root = tmp();
  put(root, ".gitignore", "node_modules\n");
  put(root, ".claude/settings.json", JSON.stringify({ env: { A: "1" }, hooks: {} }));
  const plan = planSetup(root, ANSWERS, { now: NOW });
  const { config } = generate(root, ANSWERS, { now: NOW });
  assert.equal(plan.merges.gitignore.text, read(root, ".gitignore"));
  assert.equal(plan.merges.packageJson.text, read(root, "package.json"));
  assert.equal(plan.merges.config.text, read(root, "saf.config.json"));
  assert.equal(plan.merges.settings.text, read(root, ".claude/settings.json"));
  assert.equal(plan.merges.settings.localText, read(root, ".claude/settings.local.json"));
  assert.equal(plan.merges.manifest.text, read(root, ".saf/manifest.json"));
  for (const s of plan.merges.status) assert.equal(s.content, read(root, s.path), s.path);
  assert.deepEqual(plan.merges.status.map((s) => s.path), ["docs/plan/evidence/.gitkeep", "docs/plan/STATE.md", ".saf/plan.md"]);
  assert.deepEqual(plan.config, config);
});

test("RERUN-AC-04 an invalid package.json and invalid settings.json are planned the way the real run treats them", () => {
  const root = tmp();
  put(root, "package.json", "{ not json");
  put(root, ".claude/settings.json", "{ not json");
  const plan = planSetup(root, ANSWERS, { now: NOW });
  assert.equal(plan.merges.packageJson.state, "invalid");
  assert.ok(plan.merges.settings.archivedTo);
  const { report } = generate(root, ANSWERS, { now: NOW });
  assert.deepEqual(report, plan.report);
  assert.equal(read(root, "package.json"), "{ not json");
  assert.ok(report.archived.some((a) => a.startsWith(".claude/settings.json → docs/archive/pre-saf/")));
});

test("RERUN-AC-04 a first run with --adopt: the status files moved aside are recreated and the plan matches the disk", () => {
  const root = tmp();
  put(root, "docs/plan/evidence/.gitkeep", "");
  put(root, "docs/plan/STATE.md", "an old state\n");
  put(root, "CLAUDE.md", "# mine\n");
  const plan = planSetup(root, ANSWERS, { now: NOW, adopt: true });
  assert.ok(plan.merges.adopt.some((a) => a.path === "docs/plan/evidence/.gitkeep"));
  assert.equal(plan.merges.status.find((s) => s.path === "docs/plan/evidence/.gitkeep").action, "create");
  generate(root, ANSWERS, { now: NOW, adopt: true });
  for (const s of plan.merges.status) assert.equal(read(root, s.path), s.content, s.path);
  assert.ok(existsSync(join(root, "docs/plan/evidence/.gitkeep")));
  const files = JSON.parse(read(root, ".saf/manifest.json")).files;
  for (const rel of ["docs/plan/evidence/.gitkeep", "docs/plan/STATE.md", "CLAUDE.md"]) assert.equal(files[rel], sha(read(root, rel)), `manifest hash of ${rel} is the file on disk`);
});

test("RERUN-AC-03 a link under docs/plan does not break the plan, and the dry run lists the warnings", async (t) => {
  const root = await project();
  try {
    symlinkSync(tmp(), join(root, "docs/plan/linked"), "dir");
  } catch {
    t.skip("cannot create a symlink here");
    return;
  }
  assert.doesNotThrow(() => planSetup(root, ANSWERS, { now: NOW }));
  put(root, ".claude/settings.json", JSON.stringify({ env: { A: "1" } }));
  const r = cli(root, "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /warnings:\n[\s\S]*moved the env block/);
});
