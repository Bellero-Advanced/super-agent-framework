import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { DIFF_LIMITS, diffLines, unifiedDiff } = await lib("diff.mjs");
const { planSetup } = await lib("generate.mjs");
const { init } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } }, firstMilestone: { goal: "Ship the first screen. More later." } };
const NOW = new Date("2026-01-02T03:04:05Z");
const SAF_CLI = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const lf = (t) => t.replace(/\r\n/g, "\n");
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(read(root, rel)));
const manifest = (root) => JSON.parse(read(root, ".saf/manifest.json")).files;

function tree(root) {
  const out = {};
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) visit(abs);
      else out[abs.slice(root.length + 1).split("\\").join("/")] = createHash("sha256").update(readFileSync(abs)).digest("hex");
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

function cli(cwd, ...args) {
  const file = join(tmp("saf-answers-"), "answers.json");
  writeFileSync(file, JSON.stringify(ANSWERS));
  return spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", file, ...args], { cwd, encoding: "utf8" });
}

/** Applies hunks to `a` — the way `patch` would — to prove a diff turns a into b. */
function apply(a, hunks) {
  const old = a === "" ? [] : lf(a).replace(/\n$/, "").split("\n");
  const out = [];
  let at = 0;
  for (const h of hunks) {
    const start = h.oldLines ? h.oldStart - 1 : h.oldStart;
    out.push(...old.slice(at, start));
    for (const l of h.lines) if (l[0] === " " || l[0] === "+") out.push(l.slice(1));
    at = start + h.lines.filter((l) => l[0] === " " || l[0] === "-").length;
  }
  out.push(...old.slice(at));
  return out;
}

test("RERUN-AC-05 diffLines turns a known pair of texts into the expected hunk", () => {
  const a = "one\ntwo\nthree\nfour\nfive\n";
  const b = "one\ntwo\n3\nfour\nfive\nsix\n";
  // the two changes are 2 equal lines apart, which context 1 on each side bridges: one hunk
  assert.deepEqual(diffLines(a, b, { context: 1 }), [{ oldStart: 2, oldLines: 4, newStart: 2, newLines: 5, lines: [" two", "-three", "+3", " four", " five", "+six"] }]);
  assert.deepEqual(diffLines(a, b, { context: 0 }), [
    { oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ["-three", "+3"] },
    { oldStart: 5, oldLines: 0, newStart: 6, newLines: 1, lines: ["+six"] },
  ]);
  assert.equal(unifiedDiff("f.txt", a, b), ["--- a/f.txt", "+++ b/f.txt", "@@ -1,5 +1,6 @@", " one", " two", "-three", "+3", " four", " five", "+six"].join("\n"));
  assert.ok(DIFF_LIMITS.context >= 1 && DIFF_LIMITS.maxLines >= 100);
});

test("RERUN-AC-05 far-apart changes make separate hunks and every diff rebuilds the new text", () => {
  const a = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";
  const b = a.replace("line 2\n", "two\n").replace("line 25\n", "");
  const hunks = diffLines(a, b);
  assert.equal(hunks.length, 2);
  assert.deepEqual(apply(a, hunks), lf(b).replace(/\n$/, "").split("\n"));
  // a small seeded property run: random edits of random texts always rebuild
  let seed = 7;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let t = 0; t < 200; t++) {
    const x = Array.from({ length: rnd(12) }, () => `l${rnd(4)}`);
    const y = Array.from({ length: rnd(12) }, () => `l${rnd(4)}`);
    const [tx, ty] = [x.map((l) => `${l}\n`).join(""), y.map((l) => `${l}\n`).join("")];
    assert.deepEqual(apply(tx, diffLines(tx, ty, { context: rnd(3) })), y, `${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
  }
});

test("RERUN-AC-05 identical texts have no diff, and a CRLF-only difference is not a diff (line endings read as LF)", () => {
  assert.deepEqual(diffLines("a\nb\n", "a\nb\n"), []);
  assert.equal(unifiedDiff("f", "a\r\nb\r\n", "a\nb\n"), "");
  assert.equal(unifiedDiff("f", "", ""), "");
  const d = unifiedDiff("f", "a\r\nb\r\n", "a\nB\n");
  assert.ok(!d.includes("\r"), "the shown lines have no CR");
  assert.match(d, /^-b$/m);
});

test("RERUN-AC-05 a missing final newline prints the standard marker, for either side", () => {
  assert.equal(unifiedDiff("f", "a", "a\n"), ["--- a/f", "+++ b/f", "@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+a"].join("\n"));
  assert.equal(unifiedDiff("f", "a\n", "a\nb"), ["--- a/f", "+++ b/f", "@@ -1 +1,2 @@", " a", "+b", "\\ No newline at end of file"].join("\n"));
});

test("RERUN-AC-05 an empty side has the zero-length range, and unicode lines pass through", () => {
  assert.equal(unifiedDiff("f", "", "ก\n"), ["--- a/f", "+++ b/f", "@@ -0,0 +1 @@", "+ก"].join("\n"));
  assert.equal(unifiedDiff("f", "é\n", ""), ["--- a/f", "+++ b/f", "@@ -1 +0,0 @@", "-é"].join("\n"));
});

test("RERUN-AC-05 text with a NUL byte is binary: one line, no hunks", () => {
  assert.equal(unifiedDiff("f.bin", "a\0b\n", "a\n"), "Binary files a/f.bin and b/f.bin differ");
});

test("RERUN-AC-05 a file over the line limit prints one line with both line counts — checked before any table is built", () => {
  const big = Array.from({ length: 20000 }, (_, i) => `row ${i}`).join("\n");
  const started = Date.now();
  const d = unifiedDiff("big.md", big, `${big}\nmore\nmore\n`);
  assert.ok(Date.now() - started < 1500, "a 20k-line file is refused at once, no 20k x 20k table");
  assert.ok(!d.includes("\n"), "one line");
  assert.match(d, /big\.md/);
  assert.ok(d.includes("20000 lines") && d.includes("20002 lines"), d);
  assert.ok(d.includes(String(DIFF_LIMITS.maxLines)));
  // exactly at the limit still diffs
  const edge = Array.from({ length: DIFF_LIMITS.maxLines }, (_, i) => `row ${i}`).join("\n");
  assert.match(unifiedDiff("e", edge, edge.replace("row 1000", "ROW")), /^\+ROW$/m);
});

test("RERUN-AC-05 --dry-run --diff prints the diff of an edited CLAUDE.md (disk a, new b) and writes nothing", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nour own note\n`);
  edit(root, "docs/DECISIONS.md", (t) => `${t}\n| D-900 | ours | decided |\n`);
  const before = tree(root);
  const plain = cli(root, "--dry-run");
  assert.ok(!plain.stdout.includes("--- a/"), "no diff without --diff");
  const r = cli(root, "--dry-run", "--diff");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split("\n")[0], "setup --dry-run: nothing was written");
  assert.ok(r.stdout.includes("--- a/CLAUDE.md\n+++ b/CLAUDE.md\n@@"), r.stdout);
  assert.match(r.stdout, /^-our own note$/m);
  assert.ok(r.stdout.includes("--- a/docs/DECISIONS.md"), "a kept living file shows what the new settings would change");
  assert.match(r.stdout, /^-\| D-900 \| ours \| decided \|$/m);
  assert.ok(!r.stdout.includes("--- a/docs/INDEX.md"), "unchanged files have no diff");
  assert.deepEqual(tree(root), before);
});

test("RERUN-AC-05 --diff shows saf.config.json when the answers change it, and an over-limit CLAUDE.md as one line", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", () => `${"x\n".repeat(DIFF_LIMITS.maxLines + 5)}`);
  const file = join(tmp("saf-answers-"), "a.json");
  writeFileSync(file, JSON.stringify({ ...ANSWERS, workflow: { measure: { enabled: false }, mergeChecks: [] } }));
  const r = spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", file, "--dry-run", "--diff"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n");
  const big = lines.filter((l) => l.startsWith("CLAUDE.md: too large"));
  assert.equal(big.length, 1);
  assert.ok(big[0].includes(`${DIFF_LIMITS.maxLines + 5} lines`), big[0]);
  assert.ok(!r.stdout.includes("--- a/CLAUDE.md"));
  assert.ok(r.stdout.includes("--- a/saf.config.json"), r.stdout);
});

test("RERUN-AC-06 setup --keep CLAUDE.md leaves it unchanged, unarchived, manifest entry unchanged — and the next dry run still sees it edited", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nour own note\n`);
  const mine = read(root, "CLAUDE.md");
  const entry = manifest(root)["CLAUDE.md"];
  const dry = cli(root, "--dry-run", "--keep", "CLAUDE.md");
  assert.match(dry.stdout, /^keep-edited\s+CLAUDE\.md\s+\S/m);
  assert.match(dry.stdout, /CLAUDE\.md kept as you asked/);
  const r = cli(root, "--keep", "CLAUDE.md");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CLAUDE\.md kept as you asked/);
  assert.equal(read(root, "CLAUDE.md"), mine);
  assert.ok(!existsSync(join(root, "docs/archive/pre-saf/CLAUDE.md")));
  assert.equal(manifest(root)["CLAUDE.md"], entry);
  const again = cli(root, "--dry-run");
  assert.match(again.stdout, /^replace-edited\s+CLAUDE\.md\s+\S/m, "still edited, so a later run without --keep would replace it");
});

test("RERUN-AC-06 --keep takes repeated flags, commas, ./ and backslash forms and any letter case; an unedited file is kept too", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nmine\n`);
  const r = cli(root, "--dry-run", "--keep", "./CLAUDE.md,docs\\plan\\README.md", "--keep", "docs/INDEX.md,claude.MD");
  assert.equal(r.status, 0, r.stderr);
  for (const p of ["CLAUDE.md", "docs/plan/README.md", "docs/INDEX.md"]) assert.match(r.stdout, new RegExp(`^keep-edited\\s+${p.replace(/[./]/g, "\\$&")}\\s`, "m"), p);
  assert.ok(planSetup(root, ANSWERS, { now: NOW, keep: [join(root, "CLAUDE.md")] }).actions.find((a) => a.path === "CLAUDE.md").action === "keep-edited", "an absolute path inside the project");
});

test("RERUN-AC-06 planSetup keep: the action carries the disk text and the new text, report.kept lists the file, a stranger path throws", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nmine\n`);
  const plan = planSetup(root, ANSWERS, { now: NOW, keep: ["CLAUDE.md"] });
  const a = plan.actions.find((x) => x.path === "CLAUDE.md");
  assert.equal(a.action, "keep-edited");
  assert.equal(a.current, lf(read(root, "CLAUDE.md")));
  assert.ok(a.content.length > 0 && a.content !== a.current);
  assert.ok(plan.report.kept.includes("CLAUDE.md"));
  assert.ok(!plan.report.archived.some((x) => x.startsWith("CLAUDE.md")));
  assert.throws(() => planSetup(root, ANSWERS, { now: NOW, keep: ["nope.md", "src/x.js"] }), (e) => e.code === "SETUP_KEEP" && e.message.includes("nope.md") && e.message.includes("src/x.js"));
  assert.throws(() => planSetup(root, ANSWERS, { now: NOW, keep: ["../outside.md"] }), /outside\.md/);
});

test("RERUN-AC-06 --keep nope.md exits 2 naming the path, and writes nothing", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nmine\n`);
  const before = tree(root);
  for (const flags of [["--keep", "nope.md"], ["--dry-run", "--keep", "nope.md"]]) {
    const r = cli(root, ...flags);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /nope\.md/);
    assert.equal(r.stdout, "");
  }
  assert.deepEqual(tree(root), before);
});

test("RERUN-AC-06 --diff without --dry-run, and --keep without a path, exit 2 with the usage line and write nothing", async () => {
  const root = await project();
  edit(root, "CLAUDE.md", (t) => `${t}\nmine\n`);
  const before = tree(root);
  for (const flags of [["--diff"], ["--keep"], ["--dry-run", "--keep", "--diff"]]) {
    const r = cli(root, ...flags);
    assert.equal(r.status, 2, `${flags}: ${r.stderr}`);
    assert.match(r.stderr, /^usage: setup --answers .*\[--dry-run\] \[--diff\] \[--keep/);
  }
  assert.deepEqual(tree(root), before);
});
