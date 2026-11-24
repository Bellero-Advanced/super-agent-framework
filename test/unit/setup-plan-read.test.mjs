import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { generate, planSetup } = await lib("generate.mjs");
const { loadPlan, diskIo } = await lib("plan.mjs");
const { FRICTION_MARKER } = await lib("friction.mjs");
const { generatedFiles } = await lib("task.mjs");
const { init } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(read(root, rel)));
const scratch = () => readdirSync(tmpdir()).filter((n) => n.startsWith("saf-plan-")).sort();
const NORMAL = (s) => s.replace(/\r\n/g, "\n");

async function project() {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  return root;
}

test("RERUN-AC-17 setup computes the status files without a temp copy of docs/plan; the planned STATE.md is the one task:state writes", async () => {
  const root = await project();
  const had = process.env.TMPDIR;
  process.env.TMPDIR = tmp("saf-private-tmp-"); // only this test's own scratch folders can show up in os.tmpdir()
  try {
    await body(root);
  } finally {
    if (had === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = had;
  }
});

async function body(root) {
  const card = read(root, "docs/plan/tasks/M0/T-M0-01.md");
  put(root, "docs/plan/tasks/M0/T-M0-02.md", card.replace(/T-M0-01/g, "T-M0-02"));
  edit(root, "docs/plan/milestones/M0.md", (t) => t.replace(/(cards:\n(?:\s+- .*\n)+)/, "$1  - T-M0-02\n"));
  put(root, "docs/plan/evidence/T-M0-01.json", `${JSON.stringify({ id: "T-M0-01", status: "in_progress", started: { at: "2026-01-02T03:04:05Z" } })}\n`);
  const before = scratch();

  const plan = planSetup(root, ANSWERS);
  const { report } = generate(root, ANSWERS);

  assert.deepEqual(scratch(), before, "no saf-plan-* entry appears in os.tmpdir()");
  assert.doesNotMatch(readFileSync(join(REPO, "kit/tools-saf/lib/generate.mjs"), "utf8"), /mkdtempSync/, "generate.mjs no longer imports mkdtempSync");
  const planned = new Map(generatedFiles(loadPlan(root, plan.config)));
  const state = plan.merges.status.find((s) => s.path === "docs/plan/STATE.md");
  assert.equal(NORMAL(state.content), NORMAL(planned.get("docs/plan/STATE.md")), "planned STATE.md equals task:state's");
  assert.equal(NORMAL(read(root, "docs/plan/STATE.md")), NORMAL(planned.get("docs/plan/STATE.md")), "written STATE.md equals task:state's");
  assert.match(read(root, "docs/plan/STATE.md"), /T-M0-02/, "the card on disk is in the status");
  assert.ok(!report.warnings.some((w) => w.startsWith("plan:")), `no plan issues: ${report.warnings}`);
}

test("RERUN-AC-17 loadPlan without an overlay is unchanged; with one it reads through read/list only", async () => {
  const root = await project();
  const config = planSetup(root, ANSWERS).config;
  const direct = loadPlan(root, config);
  const disk = diskIo(root);
  const viaIo = loadPlan(root, config, disk);
  assert.deepEqual([...viaIo.cards.keys()], [...direct.cards.keys()]);
  assert.deepEqual(viaIo.milestones.map((m) => m.id), direct.milestones.map((m) => m.id));
  assert.deepEqual(viaIo.issues, direct.issues);

  const seen = [];
  const hidden = loadPlan(root, config, { has: disk.has, read: (rel) => (seen.push(rel), disk.read(rel)), list: (rel) => disk.list(rel).filter((e) => e.name !== "M0.md") });
  assert.ok(!hidden.milestones.some((m) => m.id === "M0"), "a file the overlay does not list is not read");
  assert.ok(!seen.includes("docs/plan/milestones/M0.md"));
});

test("RERUN-AC-18 on a re-run an edited task template is replaced (archive target named) while an edited card is kept; --keep keeps the template", async () => {
  const root = await project();
  edit(root, "docs/plan/tasks/_template.md", (t) => `${t}\nour own template line\n`);
  edit(root, "docs/plan/tasks/M0/T-M0-01.md", (t) => `${t}\nour own card note\n`);
  const act = (plan) => Object.fromEntries(plan.actions.map((a) => [a.path, a]));

  const a = act(planSetup(root, ANSWERS));
  assert.equal(a["docs/plan/tasks/_template.md"].action, "replace-edited");
  assert.equal(a["docs/plan/tasks/_template.md"].to, "docs/archive/pre-saf/docs/plan/tasks/_template.md", "archive target named");
  assert.equal(a["docs/plan/tasks/M0/T-M0-01.md"].action, "keep-edited");

  const kept = act(planSetup(root, ANSWERS, { keep: ["docs/plan/tasks/_template.md"] }));
  assert.equal(kept["docs/plan/tasks/_template.md"].action, "keep-edited");
});

test("RERUN-AC-19 the setup skill decides a re-run by .saf/manifest.json, not by saf.config.json (guard: the skill text already says so)", () => {
  const skill = read(REPO, "kit/claude/skills/saf-setup/SKILL.md");
  assert.match(skill, /check whether `\.saf\/manifest\.json` exists/);
  assert.doesNotMatch(skill, /(?:re-run|rerun)[^.\n]*(?:if|when|whether)[^.\n]*`?saf\.config\.json`? exists/i);
});

const FRICTION = `# Friction\n\n${FRICTION_MARKER}\n- F-001 · 2026-01-02 · workaround · - · task:merge · restore by hand · evidence: a hand step\n`;
const snap = (plan) => ({ cards: [...plan.cards.keys()], evidence: [...plan.evidence.keys()], gates: [...plan.gateEvidence.keys()], friction: plan.friction.entries.map((e) => e.id), submodules: plan.submodules, issues: plan.issues });
const outcome = (fn) => {
  try {
    return snap(fn());
  } catch (e) {
    return { threw: e.code };
  }
};

test("RERUN-AC-17 loadPlan with the disk io equals loadPlan without io: friction, evidence, submodules (file, link, folder, docs/plan that is a file)", async (t) => {
  const root = await project();
  const config = planSetup(root, ANSWERS).config;
  put(root, "docs/plan/evidence/T-M0-01.json", `${JSON.stringify({ id: "T-M0-01", status: "in_progress", started: { at: "2026-01-02T03:04:05Z" } })}\n`);
  put(root, ".gitmodules", '[submodule "a"]\n\tpath = vendor/a\n\turl = x\n');
  put(root, "docs/plan/friction.md", FRICTION);
  const both = (r) => {
    const plain = outcome(() => loadPlan(r, config));
    assert.deepEqual(outcome(() => loadPlan(r, config, diskIo(r))), plain, "same with the disk io");
    return plain;
  };

  const file = both(root);
  assert.deepEqual([file.friction, file.evidence, file.submodules], [["F-001"], ["T-M0-01"], ["vendor/a"]]);

  const real = join(root, "docs/plan/friction.real");
  writeFileSync(real, FRICTION);
  try {
    rmSync(join(root, "docs/plan/friction.md"));
    symlinkSync(real, join(root, "docs/plan/friction.md"), "file");
    assert.deepEqual(both(root).friction, ["F-001"], "friction.md that links to a file is read");
  } catch (e) {
    if (e.name === "AssertionError") throw e;
    t.diagnostic("cannot create a symlink here");
  }

  rmSync(join(root, "docs/plan/friction.md"), { force: true });
  mkdirSync(join(root, "docs/plan/friction.md"));
  assert.deepEqual(both(root), { threw: "EISDIR" }, "friction.md that is a folder throws as before");

  const odd = gitRepo();
  put(odd, "docs/plan", "not a folder");
  assert.deepEqual(both(odd).cards, [], "docs/plan that is a file gives an empty plan");
});
