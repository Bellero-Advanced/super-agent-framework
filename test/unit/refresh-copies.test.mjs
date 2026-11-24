import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, fakeCtx, git, lib, planRepo, tmp, write } from "../helpers.mjs";

const { pathToFileURL } = await import("node:url");
const script = await import(pathToFileURL(join(REPO, "scripts", "refresh-copies.mjs")).href);
const task = await lib("task.mjs");
after(cleanup);

const EX = "examples/todo-api";
const OLD = "old bytes\n";
const put = (root, rel, body) => write(root, rel, body);
const read = (root, rel) => readFileSync(join(root, rel), "utf8");

/** Every compared pair holds the same file, so the check at the end of a refresh is green. */
function equalCopies(root) {
  for (const [kit, copy] of script.TABLE.pairs) for (const d of [kit, copy]) put(root, `${d}/a.mjs`, "same\n");
  for (const d of ["kit/tools-saf", "tools/saf"]) put(root, `${d}/x.mjs`, "engine\n"); // the file the fake upgrade writes into the example engine
}

function harness(root, change) {
  const calls = [];
  const lines = [];
  const spawn = (cmd, args) => {
    calls.push({ cmd, args });
    if (args[3] === join(root, EX)) change?.(join(root, EX));
    return 0;
  };
  const io = { out: (l) => lines.push(l), err: (l) => lines.push(l) };
  return { calls, lines, run: (argv = []) => script.refresh({ root, argv, spawn, ...io }) };
}

const upgradeB = (ex) => {
  writeFileSync(join(ex, ".claude/commands/saf.md"), "upgraded\n");
  writeFileSync(join(ex, "package.json"), "upgraded package\n");
  mkdirSync(join(ex, "tools/saf"), { recursive: true });
  writeFileSync(join(ex, "tools/saf/x.mjs"), "engine\n");
  mkdirSync(join(ex, ".claude/skills/new"), { recursive: true });
  writeFileSync(join(ex, ".claude/skills/new/SKILL.md"), "new skill\n");
};

async function started(touch) {
  const { root, config } = await planRepo({ cards: [{ id: "T-M1-01", touch }] });
  put(root, `${EX}/.claude/commands/saf.md`, OLD);
  put(root, `${EX}/package.json`, "old package\n");
  equalCopies(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "example");
  task.startCard(fakeCtx(root, config), "T-M1-01");
  return { root, config };
}

test("COPIES-AC-01 restores example files outside touch, keeps touch and the example engine", async () => {
  const { root } = await started([`${EX}/package.json`]);
  const h = harness(root, upgradeB);
  assert.equal(await h.run(), 0);
  assert.equal(read(root, `${EX}/.claude/commands/saf.md`), OLD);
  assert.ok(!existsSync(join(root, `${EX}/.claude/skills/new/SKILL.md`)));
  assert.equal(read(root, `${EX}/package.json`), "upgraded package\n");
  assert.equal(read(root, `${EX}/tools/saf/x.mjs`), "engine\n");
  assert.deepEqual(h.lines.filter((l) => l.startsWith("  ")), [`  ${EX}/.claude/commands/saf.md`, `  ${EX}/.claude/skills/new/SKILL.md`]);
  assert.ok(h.lines.includes("restored: 2"));
  assert.equal(h.calls.length, 2);
});

test("COPIES-AC-02 a file edited before the run keeps the edited bytes, not HEAD and not the upgrade", async () => {
  const { root } = await started(["scripts/**"]);
  put(root, `${EX}/.claude/commands/saf.md`, "edited before the run\n");
  const h = harness(root, upgradeB);
  assert.equal(await h.run(), 0);
  assert.equal(read(root, `${EX}/.claude/commands/saf.md`), "edited before the run\n");
  assert.equal(read(root, `${EX}/package.json`), "old package\n");
});

test("COPIES-AC-03 refuses with exit 2 and runs nothing: no card, only a lane card, unknown argument", async () => {
  const none = await planRepo({ cards: [{ id: "T-M1-01" }] });
  put(none.root, `${EX}/package.json`, OLD);
  const h1 = harness(none.root, upgradeB);
  assert.equal(await h1.run(), 2);
  assert.match(h1.lines.join("\n"), /no card in progress/);

  const lane = await planRepo({ config: { workflow: { lanes: { code: 2, main: 1 } } }, cards: [{ id: "T-M1-01", touch: ["src/**"] }] });
  const ev = task.startCard(fakeCtx(lane.root, lane.config), "T-M1-01", { worktree: true });
  const h2 = harness(lane.root, upgradeB);
  assert.equal(await h2.run(), 2);
  assert.ok(h2.lines.join("\n").includes(ev.worktree), "names the lane worktree");

  const h3 = harness(none.root, upgradeB);
  assert.equal(await h3.run(["--foo"]), 2);
  for (const h of [h1, h2, h3]) assert.equal(h.calls.length, 0, "no upgrade was called");
  assert.equal(read(none.root, `${EX}/package.json`), OLD);
});

test("COPIES-AC-04 in a lane worktree the card is the lane's and the restore runs on its example folder", async () => {
  const { root, config } = await planRepo({ config: { workflow: { lanes: { code: 2, main: 1 } } }, cards: [{ id: "T-M1-01", touch: ["src/**"] }, { id: "T-M1-02", touch: [`${EX}/package.json`] }] });
  put(root, `${EX}/.claude/commands/saf.md`, OLD);
  put(root, `${EX}/package.json`, "old package\n");
  equalCopies(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "example");
  const ev = task.startCard(fakeCtx(root, config), "T-M1-02", { worktree: true });
  const lane = join(root, ev.worktree);
  const h = harness(lane, upgradeB);
  assert.equal(await h.run(), 0);
  assert.ok(h.lines.includes("card: T-M1-02"));
  assert.equal(read(lane, `${EX}/.claude/commands/saf.md`), OLD);
  assert.equal(read(lane, `${EX}/package.json`), "upgraded package\n", "the lane card owns package.json");
  assert.equal(read(root, `${EX}/.claude/commands/saf.md`), OLD, "the main folder was not touched");
});

test("COPIES-AC-05 a second run writes nothing and says nothing to restore", async () => {
  const { root } = await started([`${EX}/package.json`]);
  assert.equal(await harness(root, upgradeB).run(), 0);
  const h = harness(root, undefined);
  assert.equal(await h.run(), 0);
  assert.ok(h.lines.includes("nothing to restore"));
  assert.equal(read(root, `${EX}/.claude/commands/saf.md`), OLD);
});

test("COPIES-AC-06 --check: CRLF only is equal, different content is named with the fix, nothing written, no card", () => {
  const root = tmp();
  for (const [kit, copy] of script.TABLE.pairs) {
    put(root, `${kit}/a.mjs`, "one\ntwo\n");
    put(root, `${copy}/a.mjs`, "one\r\ntwo\r\n");
  }
  const lines = [];
  const io = { out: (l) => lines.push(l), err: (l) => lines.push(l) };
  return script.refresh({ root, argv: ["--check"], ...io }).then(async (code) => {
    assert.equal(code, 0);
    put(root, "tools/saf/a.mjs", "different\n");
    put(root, "tools/saf/extra.mjs", "x\n");
    const before = readFileSync(join(root, "tools/saf/a.mjs"), "utf8");
    lines.length = 0;
    assert.equal(await script.refresh({ root, argv: ["--check"], ...io }), 1);
    const all = lines.join("\n");
    assert.match(all, /differs: tools\/saf\/a\.mjs/);
    assert.match(all, /extra: tools\/saf\/extra\.mjs/);
    assert.match(all, /npm run saf:refresh/);
    assert.equal(readFileSync(join(root, "tools/saf/a.mjs"), "utf8"), before);
  });
});

test("COPIES-AC-07 each upgrade is process.execPath with an argument array, also when the path has a space", async () => {
  const base = await planRepo({ cards: [{ id: "T-M1-01", touch: ["scripts/**"] }], files: {} });
  equalCopies(base.root);
  git(base.root, "add", "-A");
  git(base.root, "commit", "-q", "-m", "copies");
  const spaced = join(tmp(), "a folder with space");
  git(base.root, "clone", "-q", base.root, spaced);
  task.startCard(fakeCtx(spaced, base.config), "T-M1-01");
  const h = harness(spaced, (ex) => {
    mkdirSync(join(ex, "tools/saf"), { recursive: true });
    writeFileSync(join(ex, "tools/saf/x.mjs"), "engine\n");
  });
  assert.equal(await h.run(), 0);
  assert.deepEqual(h.calls.map((c) => c.cmd), [process.execPath, process.execPath]);
  assert.deepEqual(h.calls.map((c) => c.args), [
    [join(spaced, "bin", "cli.mjs"), "upgrade", "--dir", spaced],
    [join(spaced, "bin", "cli.mjs"), "upgrade", "--dir", join(spaced, EX)],
  ]);
  assert.ok(h.calls.every((c) => Array.isArray(c.args)));
});

test("COPIES-AC-08 package.json and saf.config.json wire the script and the first merge check", () => {
  assert.equal(JSON.parse(read(REPO, "package.json")).scripts["saf:refresh"], "node scripts/refresh-copies.mjs");
  assert.equal(JSON.parse(read(REPO, "saf.config.json")).workflow.mergeChecks[0], "npm run saf:refresh -- --check");
});
