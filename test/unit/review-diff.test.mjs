import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, fakeCtx, git, gitRepo, lib, planRepo, write } from "../helpers.mjs";

const task = await lib("task.mjs");
const { generate } = await lib("generate.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, "task", "diff", ...args], { cwd, encoding: "utf8" });
const ID = "T-M1-01";
const REL = `.saf/memory/review/${ID}.diff`;
const TOUCH = ["src/**", "-lead.txt", "engine/**"];
const read = (root, rel = REL) => readFileSync(join(root, rel), "utf8");
/** The files a unified diff covers, from its `diff --git a/<p> b/<p>` lines (the two halves are equal, so a name with spaces is split exactly). */
const filesIn = (text) =>
  text
    .split("\n")
    .filter((l) => l.startsWith("diff --git "))
    .map((l) => {
      const rest = l.slice("diff --git ".length).replace(/\r$/, "");
      return rest.slice(2, 2 + (rest.length - 5) / 2);
    })
    .sort();
const printed = (r) => r.stdout.match(/^wrote (.+)$/m)?.[1];
const same = (a, b) => assert.equal(realpathSync(a), realpathSync(b));
const none = (root) => assert.equal(existsSync(join(root, ".saf", "memory", "review")), false, "no review folder, nothing written");

const repo = (extra = {}) =>
  planRepo({
    config: extra.config,
    cards: [{ id: ID, title: "the card", touch: TOUCH, size: extra.size ?? "S" }],
    files: { "src/mod.ts": "one\ntwo\nthree\n", "src/gone.ts": "bye\nbye\n", "src/crlf.txt": "a\r\nb\r\n", "src/img.bin": Buffer.from([0, 1, 2, 3]).toString("latin1"), "dirty.txt": "base\n", "engine/lib.mjs": "old\n", ...extra.files },
  });

test("RDIFF-AC-01 the diff holds the changed, new and deleted card files and nothing else; the path is absolute; exit 0", async () => {
  const { root, config } = await repo();
  write(root, "dirty.txt", "dirty before the start\n");
  const ctx = fakeCtx(root, config);
  task.startCard(ctx, ID);
  write(root, "src/mod.ts", "one\nTWO\nthree\nfour\n");
  write(root, "src/new file ü.ts", "x\ny\n");
  write(root, "src/a[1].ts", "glob-looking name\n");
  write(root, "-lead.txt", "dash first\n");
  write(root, "src/crlf.txt", "a\r\nB\r\n");
  writeFileSync(join(root, "src/img.bin"), Buffer.from([0, 9, 9, 9, 0]));
  writeFileSync(join(root, "src/new.bin"), Buffer.from([0, 255, 0]));
  rmSync(join(root, "src/gone.ts"));
  assert.equal((await task.verifyCard(ctx, ID)).status, "done", "evidence and STATE.md changed too");
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  const path = printed(r);
  assert.ok(isAbsolute(path));
  same(path, join(root, REL));
  const text = read(root);
  assert.deepEqual(filesIn(text), ["-lead.txt", "src/a[1].ts", "src/crlf.txt", "src/gone.ts", "src/img.bin", "src/mod.ts", "src/new file ü.ts", "src/new.bin"]);
  assert.ok(!text.includes("diff --git a/dirty.txt"), "a file dirty before the start and untouched");
  assert.ok(!/diff --git a\/(docs|\.saf)\//.test(text), "no evidence, STATE.md, mirror or review file");
  assert.match(text, /^# T-M1-01 the card\n# base [0-9a-f]{40} · HEAD [0-9a-f]{40}\n# files 8\n# size S: code \d+\/150 · test 0\/250 changed lines\n/);
  const block = (f) => text.split("diff --git ").find((b) => b.startsWith(`a/${f} `));
  const lines = (b) => b.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
  assert.match(block("src/new file ü.ts"), /new file mode/);
  assert.deepEqual(lines(block("src/new file ü.ts")), ["+x", "+y"], "a new file is all added lines");
  assert.match(block("src/gone.ts"), /deleted file mode/);
  assert.deepEqual(lines(block("src/gone.ts")), ["-bye", "-bye"], "a deleted file is all removed lines");
  assert.match(block("src/img.bin"), /Binary files a\/src\/img\.bin and b\/src\/img\.bin differ/);
  assert.match(block("src/new.bin"), /Binary files \/dev\/null and b\/src\/new\.bin differ/);
  assert.ok(text.includes("-b\r\n") && text.includes("+B\r\n"), "CRLF lines are kept as they are");
  assert.match(block("src/mod.ts"), /-two\n\+TWO\n three\n\+four/);
});

test("RDIFF-AC-01 a second run rewrites the file whole and leaves no temporary file; uncommitted and staged work both count", async () => {
  const { root, config } = await repo();
  task.startCard(fakeCtx(root, config), ID);
  write(root, "src/mod.ts", "first\n");
  assert.equal(cli(root, ID).status, 0);
  assert.match(read(root), /\+first/);
  write(root, "src/mod.ts", "second\n");
  git(root, "add", "src/mod.ts");
  write(root, "src/more.ts", "m\n");
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  const text = read(root);
  assert.ok(!text.includes("first") && text.includes("+second") && text.includes("src/more.ts"));
  assert.deepEqual(readdirSync(join(root, ".saf/memory/review")), [`${ID}.diff`]);
  assert.match(r.stdout, /2 file\(s\)/);
});

test("RDIFF-AC-01 a diff of tens of thousands of lines is written whole and the command prints its size in lines", async () => {
  const { root, config } = await repo();
  task.startCard(fakeCtx(root, config), ID);
  const big = Array.from({ length: 60000 }, (_, i) => `line ${i}`).join("\n");
  write(root, "src/big.txt", `${big}\n`);
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root).split("\n").filter((l) => l.startsWith("+line ")).length, 60000);
  const n = Number(r.stdout.match(/ (\d+) line\(s\)/)[1]);
  assert.ok(n >= 60000, r.stdout);
});

test("RDIFF-AC-01 a change inside a submodule card is read from the submodule against its own start commit", async () => {
  const sub = gitRepo();
  write(sub, "lib/s.ts", "s1\n");
  commitAll(sub, "sub");
  const { root, config } = await planRepo({ cards: [{ id: ID, touch: ["libs/sub/lib/**"] }] });
  git(root, "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "libs/sub");
  write(root, "docs/plan/tasks/M1/T-M1-01.md", read(root, "docs/plan/tasks/M1/T-M1-01.md").replace("size: S\n", "size: S\nrepo: libs/sub\n"));
  const ctx = fakeCtx(root, config);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "submodule + repo card");
  task.startCard(ctx, ID);
  write(root, "libs/sub/lib/s.ts", "s1\ns2\n");
  write(root, "libs/sub/lib/t.ts", "t\n");
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(filesIn(read(root)), ["libs/sub/lib/s.ts", "libs/sub/lib/t.ts"]);
});

test("RDIFF-AC-02 an engine-copy path in workflow.alwaysAllowed that the card changed is not in the diff", async () => {
  const { root, config } = await repo({ config: { workflow: { alwaysAllowed: ["engine/**"] } } });
  task.startCard(fakeCtx(root, config), ID);
  write(root, "engine/lib.mjs", "refreshed\n");
  write(root, "engine/new.mjs", "copy\n");
  write(root, "src/mod.ts", "changed\n");
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(filesIn(read(root)), ["src/mod.ts"]);
});

test("RDIFF-AC-03 a lane card: from the main folder and from the worktree the file is written in the worktree with committed and uncommitted work, same content", async () => {
  const { root, config } = await repo({ config: { workflow: { lanes: { code: 3, main: 1 } } } });
  const ev = task.startCard(fakeCtx(root, config), ID, { worktree: true });
  const lane = join(root, ev.worktree);
  write(lane, "src/committed.ts", "c\n");
  write(lane, "src/mod.ts", "committed edit\n");
  commitAll(lane, "T-M1-01 work");
  write(lane, "src/loose.ts", "l\n");
  write(lane, "src/mod.ts", "committed edit\nloose edit\n");
  const fromMain = cli(root, ID);
  assert.equal(fromMain.status, 0, fromMain.stderr);
  same(printed(fromMain), join(lane, REL));
  assert.equal(existsSync(join(root, REL)), false, "nothing written in the main folder");
  const first = read(lane);
  assert.deepEqual(filesIn(first), ["src/committed.ts", "src/loose.ts", "src/mod.ts"]);
  assert.ok(first.includes("+loose edit") && first.includes("+c"));
  const fromLane = cli(lane, ID);
  assert.equal(fromLane.status, 0, fromLane.stderr);
  same(printed(fromLane), join(lane, REL));
  assert.equal(read(lane), first, "the same content both times");
  const v = await task.verifyCard(fakeCtx(lane, config), ID);
  assert.deepEqual(v.verified.files.changed, ["src/committed.ts", "src/loose.ts", "src/mod.ts"], "the diff file is never counted as the card's");
});

test("RDIFF-AC-04 refusals exit 2 and write nothing: not started · another lane's card in the worktree · the worktree is missing · unknown flag · stray word · bad id", async () => {
  const { root, config } = await planRepo({
    config: { workflow: { lanes: { code: 3, main: 1 } } },
    cards: [{ id: "T-M1-01", touch: ["src/a/**"] }, { id: "T-M1-02", touch: ["src/b/**"] }, { id: "T-M1-03", touch: ["src/c/**"] }],
  });
  const refuse = (cwd, args, re) => {
    const r = cli(cwd, ...args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, re);
  };
  refuse(root, ["T-M1-01"], /has not started/);
  refuse(root, ["T-M1-09"], /no card T-M1-09/);
  refuse(root, ["--foo"], /unknown option --foo/);
  refuse(root, ["T-M1-01", "extra"], /unexpected argument "extra"/);
  refuse(root, [], /give a card id/);
  refuse(root, ["../escape"], /not a card id/);
  const ev = task.startCard(fakeCtx(root, config), "T-M1-01", { worktree: true });
  const lane = join(root, ev.worktree);
  refuse(lane, ["T-M1-02"], /lane 1, card T-M1-01/);
  refuse(lane, ["--foo", "T-M1-01"], /unknown option --foo/);
  git(root, "worktree", "remove", "--force", ev.worktree);
  refuse(root, ["T-M1-01"], /T-M1-01 --worktree --resume/);
  none(root);
  assert.equal(existsSync(join(root, "..", "escape.diff")), false);
});

test("RDIFF-AC-04 a failing git call exits 1 and an older file stays as it was", async () => {
  const { root, config } = await repo();
  task.startCard(fakeCtx(root, config), ID);
  write(root, "src/mod.ts", "x\n");
  assert.equal(cli(root, ID).status, 0);
  const before = read(root);
  const evFile = join(root, "docs/plan/evidence", `${ID}.json`);
  const ev = JSON.parse(readFileSync(evFile, "utf8"));
  ev.started.base = "0".repeat(40);
  writeFileSync(evFile, `${JSON.stringify(ev)}\n`);
  const r = cli(root, ID);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /git/);
  assert.equal(read(root), before);
});

test("RDIFF-AC-05 a started card with no changed files: the header and 'no changed files', exit 0", async () => {
  const { root, config } = await repo({ size: "M" });
  write(root, "dirty.txt", "dirty before\n");
  task.startCard(fakeCtx(root, config), ID);
  const r = cli(root, ID);
  assert.equal(r.status, 0, r.stderr);
  const text = read(root);
  assert.match(text, /^# T-M1-01 the card\n# base [0-9a-f]{40} · HEAD [0-9a-f]{40}\n# files 0\n# size M: code 0\/400 · test 0\/600 changed lines\nno changed files\n/);
  assert.equal(filesIn(text).length, 0);
  assert.match(r.stdout, /0 file\(s\)/);
});

test("RDIFF-AC-06 /saf (en and th): reviewerDiff on names task:diff and the review types · off has no task:diff and still names the types", () => {
  const TYPES = ["`text`", "`data`", "`security`", "`refactor`"];
  for (const docLanguage of ["en", "th"]) {
    const run = (reviewerDiff) => {
      const root = gitRepo();
      generate(root, { people: { docLanguage }, stack: { packageManager: "npm" }, tokenSaving: { reviewerDiff } }, { now: new Date("2026-01-02T00:00:00Z") });
      return read(root, ".claude/commands/saf.md");
    };
    const on = run(true);
    assert.equal((on.match(/npm run task:diff -- <id>/g) ?? []).length, 2, `${docLanguage}: the review row and the sentence name the command`);
    for (const t of TYPES) assert.ok(on.includes(t), `${docLanguage} on ${t}`);
    const off = run(false);
    assert.ok(!off.includes("task:diff"), `${docLanguage} off: no task:diff`);
    for (const t of TYPES) assert.ok(off.includes(t), `${docLanguage} off ${t}`);
    assert.doesNotMatch(on + off, /\{\{|\}\}/);
  }
});

test("RDIFF-AC-06 the commands block of the CLAUDE templates and the script wiring carry task:diff", () => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "npm" } }, { now: new Date("2026-01-02T00:00:00Z") });
  assert.match(read(root, "CLAUDE.md"), /^npm run task:diff -- <id> {2,}#/m);
  const th = gitRepo();
  generate(th, { people: { docLanguage: "th" }, stack: { packageManager: "npm" } }, { now: new Date("2026-01-02T00:00:00Z") });
  assert.match(read(th, "CLAUDE.md"), /^npm run task:diff -- <id> +# /m);
  assert.equal(JSON.parse(read(REPO, "package.json")).scripts["task:diff"], "node tools/saf/bin/saf.mjs task diff");
});
