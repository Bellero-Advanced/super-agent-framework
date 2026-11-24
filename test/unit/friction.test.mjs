import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, fakeCtx, gitRepo, lib, planRepo, write } from "../helpers.mjs";

const fr = await lib("friction.mjs");
const task = await lib("task.mjs");
const { loadPlan, sessionContext, formatTime, alwaysAllowed } = await lib("plan.mjs");
const config = await lib("config.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const FILE = fr.FRICTION_FILE;
const TODAY = "2026-03-04";
const CARDS = [{ id: "T-M1-01", touch: ["src/**"] }, { id: "T-M1-02", touch: ["lib/**"] }];
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
const text = (root) => readFileSync(join(root, FILE), "utf8");
const FIELDS = { kind: "workaround", area: "task:merge", evidence: "the merge needed a hand step", summary: "restore the example by hand" };
const add = (root, over = {}, opts = {}) => fr.appendEntry(root, { ...FIELDS, ...over }, { today: TODAY, ...opts });
const HEAD = `# Friction log\n\nfree text, may mention F-009 · anything\n\n${fr.FRICTION_MARKER}\n`;
const entry = (n, over = "") => `- F-${String(n).padStart(3, "0")} · 2026-01-0${n % 9 || 1} · workaround · - · area${n} · summary ${n}${over} · evidence: ev ${n}`;

async function repo(extra = {}) {
  return planRepo({ cards: CARDS, ...extra });
}

test("FRIC-AC-01 the first add creates the file with header and marker; the entry has id, date and every field; the second add gets F-002", async () => {
  const { root } = await repo();
  assert.equal(existsSync(join(root, FILE)), false, "no file before the first entry");
  assert.equal(add(root, { card: "T-M1-01" }), "F-001");
  const first = text(root);
  assert.match(first, /^# Friction log\n/);
  assert.ok(first.includes(`\n${fr.FRICTION_MARKER}\n`), "marker line");
  assert.ok(first.endsWith(`- F-001 · ${TODAY} · workaround · T-M1-01 · task:merge · restore the example by hand · evidence: the merge needed a hand step\n`));
  assert.equal(add(root, { card: undefined, summary: "second" }), "F-002");
  const parsed = fr.parseFriction(text(root));
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.entries.map((e) => [e.id, e.card, e.status]), [["F-001", "T-M1-01", "open"], ["F-002", "-", "open"]]);
});

test("FRIC-AC-01 the CLI prints the id, dates the entry in people.timeZone and creates the file in the document language", async () => {
  const tz = "Pacific/Kiritimati";
  const { root } = await repo({ config: { people: { docLanguage: "th", timeZone: tz } } });
  const day = () => formatTime(new Date().toISOString(), tz).slice(0, 10);
  const before = day();
  const r = cli(root, "task", "friction", "add", "--kind", "doc-drift", "--area", "docs/plan/README.md", "--evidence", "see the card", "the", "text", "differs");
  const after = day();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "F-001");
  const parsed = fr.parseFriction(text(root));
  assert.ok([before, after].includes(parsed.entries[0].date), parsed.entries[0].date);
  assert.equal(parsed.entries[0].summary, "the text differs");
  assert.match(text(root), /^# Friction log\n\nจุดที่ workflow/, "th header");
});

test("FRIC-AC-01 appending twice never rewrites earlier lines: the old bytes stay a prefix (also with CRLF, a trailing blank line and ids out of order)", async () => {
  const { root } = await repo();
  add(root);
  let prev = text(root);
  const step = (fn) => {
    fn();
    const now = text(root);
    assert.ok(now.startsWith(prev), "earlier bytes unchanged");
    assert.ok(now.length > prev.length);
    prev = now;
  };
  step(() => add(root, { summary: "two" }));
  step(() => fr.appendClose(root, "F-001", "dropped", "not a real problem", { today: TODAY }));
  step(() => add(root, { summary: "three" }));

  const odd = await repo();
  const crlf = `${HEAD}${entry(1)}\n${entry(7)}\n${entry(3)}\n\n`.replace(/\n/g, "\r\n");
  write(odd.root, FILE, crlf);
  assert.equal(add(odd.root), "F-008", "highest id + 1 even when the order is broken and the file ends with blank lines");
  const out = text(odd.root);
  assert.ok(out.startsWith(crlf));
  assert.ok(out.slice(crlf.length).startsWith("- F-008 · "));
  assert.equal(out.slice(crlf.length).split("\r\n").length, 2, "the new line ends with CRLF like the rest of the file");
  assert.ok(!/[^\r]\n/.test(out), "no bare LF was added to a CRLF file");

  const noEol = await repo();
  write(noEol.root, FILE, `${HEAD}${entry(1)}`);
  assert.equal(add(noEol.root), "F-002");
  assert.equal(text(noEol.root), `${HEAD}${entry(1)}\n- F-002 · ${TODAY} · workaround · - · task:merge · restore the example by hand · evidence: the merge needed a hand step\n`);
});

test("FRIC-AC-01 commands from several sessions at once never take the same id", async () => {
  const { root } = await repo();
  const run = (i) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [BIN, "task", "friction", "add", "--kind", "workaround", "--area", "x", "--evidence", "e", `entry ${i}`], { cwd: root });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, id: out.trim() }));
    });
  const results = await Promise.all([...Array(6).keys()].map(run));
  assert.deepEqual(results.map((r) => r.code), Array(6).fill(0));
  assert.equal(new Set(results.map((r) => r.id)).size, 6);
  const parsed = fr.parseFriction(text(root));
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.entries.map((e) => e.id), ["F-001", "F-002", "F-003", "F-004", "F-005", "F-006"]);
  assert.deepEqual(readdirSync(join(root, "docs/plan")).filter((f) => f.endsWith(".lock")), [], "the lock file is gone");
});

test("FRIC-AC-02 an unknown kind, an empty field, a field with a separator or line break, an unknown --card: refused and the file is byte-identical", async () => {
  const { root } = await repo();
  add(root);
  const before = text(root);
  const bad = [
    { kind: "bug" },
    { kind: "" },
    { evidence: "" },
    { evidence: "   " },
    { summary: "" },
    { area: "" },
    { summary: "a · b" },
    { area: "x · y" },
    { evidence: "line\nbreak" },
    { summary: "line\r\nbreak" },
    { card: "T-M9-99" },
    { card: "nonsense" },
  ];
  for (const over of bad) assert.throws(() => add(root, over, { cards: (id) => ["T-M1-01", "T-M1-02"].includes(id) }), fr.FrictionError, JSON.stringify(over));
  assert.equal(text(root), before);
  const r = cli(root, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e", "--card", "T-M9-99", "summary");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /T-M9-99 is not a card of the plan/);
  assert.equal(cli(root, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e").status, 1, "no summary");
  assert.equal(cli(root, "task", "friction", "add", "--kind", "bug", "--area", "a", "--evidence", "e", "s").status, 1);
  assert.equal(cli(root, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e", "--card", "T-M1-02", "ok").status, 0, "a card of the plan is accepted");
  for (const bad of [["--oops", "x"], ["--area", "--card", "T-M1-01", "s"], ["--kind=workaround", "s"], ["--evidence"]]) {
    const r2 = cli(root, "task", "friction", "add", ...bad);
    assert.equal(r2.status, 2, bad.join(" "));
    assert.match(r2.stderr, /usage: node tools\/saf\/bin\/saf\.mjs task friction add --kind/);
  }
  assert.equal(text(root), before.concat(text(root).slice(before.length)), "the earlier text is unchanged");
  assert.equal(fr.parseFriction(text(root)).entries.length, 2, "only the two valid adds above were written");
  assert.equal(cli(root, "task", "friction", "frobnicate").status, 2);
  const fresh = await repo();
  assert.throws(() => add(fresh.root, { kind: "bug" }), fr.FrictionError);
  assert.equal(existsSync(join(fresh.root, FILE)), false, "a refused first add creates no file");
});

test("FRIC-AC-02 a field that starts or ends with the dot is refused (it would glue to the separator and break the command's own line); odd text round-trips", async () => {
  const { root } = await repo();
  add(root);
  const before = text(root);
  for (const over of [{ area: "a ·" }, { summary: "foo ·" }, { evidence: "e ·" }, { area: "· a" }, { summary: "·" }, { evidence: "·" }]) {
    assert.throws(() => add(root, over), /must not contain|start|end/, JSON.stringify(over));
  }
  assert.throws(() => fr.appendClose(root, "F-001", "dropped", "reason ·", { today: TODAY }), fr.FrictionError);
  assert.equal(text(root), before, "nothing written");
  const r = cli(root, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e", "foo", "·");
  assert.equal(r.status, 1);
  assert.equal(text(root), before);
  const odd = ["tab\tinside", "\u001b[31mansi\u001b[0m", "line\u2028sep and \u2029 para", "x".repeat(5000), "ไทย 日本語 😀 é", "a·b", "a ·b", "a· b", "  padded  ", "evidence: inside", "F-009 → fixed · not"];
  const field = ["area", "summary", "evidence"];
  odd.forEach((v, i) => {
    const f = field[i % 3];
    const clean = v.trim();
    let id;
    try {
      id = add(root, { [f]: v });
    } catch (e) {
      assert.ok(e instanceof fr.FrictionError, `${JSON.stringify(v)}: ${e.message}`);
      return; // refused is fine; written wrongly is not
    }
    const parsed = fr.parseFriction(text(root));
    assert.deepEqual(parsed.issues, [], JSON.stringify(v));
    assert.equal(parsed.entries.find((e) => e.id === id)[f], clean, `${f} ${JSON.stringify(v)} reads back unchanged`);
  });
  assert.ok(fr.readFriction(root).entries.length >= 8, "most odd values are accepted");
  assert.equal(fr.appendClose(root, "F-001", "dropped", "ansi \u001b[0m tab\t and 日本語", { today: TODAY }), "F-001");
  assert.equal(fr.readFriction(root).entries[0].closes[0].ref, "ansi \u001b[0m tab\t and 日本語");
  assert.deepEqual(fr.readFriction(root).issues, []);
});

test("FRIC-AC-03 carded then fixed append two closing lines and the status is fixed; closing a fixed entry is refused", async () => {
  const { root } = await repo();
  add(root);
  const cards = (id) => ["T-M1-01", "T-M1-02"].includes(id);
  fr.appendClose(root, "F-001", "carded", "T-M1-01", { today: TODAY, cards });
  assert.equal(fr.readFriction(root).entries[0].status, "carded");
  fr.appendClose(root, "F-001", "fixed", "T-M1-02", { today: TODAY, cards });
  const lines = text(root).trim().split("\n");
  assert.equal(lines.at(-2), `- F-001 → carded · ${TODAY} · T-M1-01`);
  assert.equal(lines.at(-1), `- F-001 → fixed · ${TODAY} · T-M1-02`);
  assert.equal(fr.readFriction(root).entries[0].status, "fixed");
  const before = text(root);
  assert.throws(() => fr.appendClose(root, "F-001", "dropped", "x", { today: TODAY, cards }), /already fixed/);
  assert.throws(() => fr.appendClose(root, "F-009", "dropped", "x", { today: TODAY, cards }), /no entry F-009/);
  assert.equal(text(root), before, "refused closings write nothing");

  add(root, { summary: "other" });
  for (const [status, ref] of [["carded", "T-M9-99"], ["fixed", "not a card"], ["carded", ""], ["dropped", ""], ["dropped", "a · b"], ["done", "T-M1-01"]]) {
    assert.throws(() => fr.appendClose(root, "F-002", status, ref, { today: TODAY, cards }), fr.FrictionError, `${status} ${ref}`);
  }
  fr.appendClose(root, "F-002", "dropped", "same event as F-001", { today: TODAY, cards });
  assert.equal(fr.readFriction(root).entries[1].status, "dropped");
  assert.throws(() => fr.appendClose(root, "F-002", "carded", "T-M1-01", { today: TODAY, cards }), /already dropped/);
});

test("FRIC-AC-03 the CLI: close appends a line, a refused close exits 1, no sub-command lists open and carded entries then the counts", async () => {
  const { root } = await repo();
  assert.equal(cli(root, "task", "friction").stdout.trim(), "no friction recorded");
  cli(root, "task", "friction", "add", "--kind", "review-bounce", "--area", "task:verify", "--evidence", "e", "one");
  cli(root, "task", "friction", "add", "--kind", "doc-drift", "--area", "README.md", "--evidence", "e", "two");
  cli(root, "task", "friction", "add", "--kind", "command-failed", "--area", "task:state", "--evidence", "e", "three");
  assert.equal(cli(root, "task", "friction", "close", "F-001", "carded", "T-M1-01").status, 0);
  assert.equal(cli(root, "task", "friction", "close", "F-002", "dropped", "not", "a", "problem").status, 0);
  const refused = cli(root, "task", "friction", "close", "F-002", "carded", "T-M1-01");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already dropped/);
  const list = cli(root, "task", "friction").stdout.trim().split("\n");
  assert.equal(list.length, 3);
  assert.match(list[0], /^F-001 · carded · review-bounce · - · task:verify · one$/);
  assert.match(list[1], /^F-003 · open · command-failed/);
  assert.equal(list[2], "open 1 · carded 1 · fixed 0 · dropped 1");
  assert.match(text(root), /- F-002 → dropped · \d{4}-\d{2}-\d{2} · not a problem\n$/);
});

test("FRIC-AC-04 a malformed line, a duplicate id, a decreasing id, an unknown kind and a closing line for an unknown id are plan issues with their line numbers (CRLF too)", async () => {
  const body = [...HEAD.trimEnd().split("\n"), entry(1), "this line is not an entry", entry(1), entry(5), entry(3), "- F-006 · 2026-01-01 · bug · - · a · s · evidence: e", "- F-099 → fixed · 2026-01-01 · T-M1-01", entry(7), "- F-007 → fixed · 2026-01-01 · T-M1-01", ""];
  const { root, config: cfg } = await repo({ files: { [FILE]: body.join("\n") } });
  const lineOf = (re) => body.findIndex((l) => re.test(l)) + 1;
  const issues = loadPlan(root, cfg).issues.filter((i) => i.startsWith(`${FILE}:`));
  const has = (line, re) => assert.ok(issues.some((i) => i.startsWith(`${FILE}:${line}:`) && re.test(i)), `${line} ${re}: ${issues.join(" | ")}`);
  has(lineOf(/^this line/), /not an entry or a closing line/);
  has(lineOf(/^this line/) + 1, /duplicate id F-001/);
  has(lineOf(/^- F-003 /), /id F-003 does not increase/);
  has(lineOf(/ bug /), /unknown kind "bug"/);
  has(lineOf(/^- F-099/), /F-099, which has no entry above it/);
  assert.equal(issues.length, 5, issues.join("\n"));
  const ctx = fakeCtx(root, cfg);
  assert.equal(task.stateCheck(ctx).issues.filter((i) => i.startsWith(`${FILE}:`)).length, 5, "task:state --check sees the same issues");
  const r = cli(root, "task", "state", "--check");
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`${FILE}:${lineOf(/^this line/)}: `));

  const crlf = await repo({ files: { [FILE]: body.join("\r\n") } });
  assert.equal(loadPlan(crlf.root, crlf.config).issues.filter((i) => i.startsWith(`${FILE}:`)).length, 5, "CRLF gives the same lines and issues");
  const clean = await repo({ files: { [FILE]: `${HEAD}${entry(1)}\n${entry(2)}\n- F-001 → carded · 2026-01-01 · T-M1-01\n` } });
  assert.deepEqual(loadPlan(clean.root, clean.config).issues, [], "free text above the marker is never an issue");
  const noMarker = await repo({ files: { [FILE]: `# Friction log\n${entry(1)}\n` } });
  assert.match(loadPlan(noMarker.root, noMarker.config).issues.join("\n"), new RegExp(`${FILE}:1: the marker line`));
  assert.throws(() => add(noMarker.root), /no marker line/, "add refuses a file without the marker and writes nothing");
  assert.equal(text(noMarker.root), `# Friction log\n${entry(1)}\n`);
});

test("FRIC-AC-05 the session summary shows the open and carded counts with the command, in both document languages, and nothing when there is no file or nothing open", async () => {
  const log = `${HEAD}${entry(1)}\n${entry(2)}\n${entry(3)}\n${entry(4)}\n- F-003 → carded · 2026-01-01 · T-M1-01\n- F-004 → fixed · 2026-01-01 · T-M1-01\n`;
  const en = await repo({ files: { [FILE]: log } });
  const ctx = sessionContext(loadPlan(en.root, en.config));
  assert.match(ctx, /^Friction: 2 open · 1 carded — node tools\/saf\/bin\/saf\.mjs task friction$/m);
  const th = await repo({ config: { stack: { packageManager: "npm" }, people: { docLanguage: "th" } }, files: { [FILE]: log } });
  assert.match(sessionContext(loadPlan(th.root, th.config)), /^Friction: ค้างอยู่ 2 · ออกการ์ดแล้ว 1 — ดูด้วย npm run task:friction$/m);
  const none = await repo();
  assert.doesNotMatch(sessionContext(loadPlan(none.root, none.config)), /Friction/);
  const closed = await repo({ files: { [FILE]: `${HEAD}${entry(1)}\n- F-001 → dropped · 2026-01-01 · no\n` } });
  assert.doesNotMatch(sessionContext(loadPlan(closed.root, closed.config)), /Friction/);
  const hook = cli(en.root, "hook", "session-start");
  assert.match(hook.stdout, /Friction: 2 open · 1 carded/);
});

test("FRIC-AC-06 in a lane worktree add and close are refused with the main-folder command and nothing is written (the main folder works)", async () => {
  const made = await planRepo({ config: { workflow: { lanes: { code: 2, main: 1 } } }, cards: CARDS });
  const ev = task.startCard(fakeCtx(made.root, made.config), "T-M1-01", { worktree: true });
  const lane = join(made.root, ev.worktree);
  assert.ok(realpathSync(lane));
  const a = cli(lane, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e", "s");
  assert.equal(a.status, 1);
  assert.match(a.stderr, /worktree of lane 1, card T-M1-01/);
  assert.match(a.stderr, /run node tools\/saf\/bin\/saf\.mjs task friction add --kind <kind>/);
  assert.match(a.stderr, /"friction:" line in your report/);
  assert.equal(existsSync(join(lane, FILE)), false);
  assert.equal(existsSync(join(made.root, FILE)), false);
  assert.equal(cli(made.root, "task", "friction", "add", "--kind", "workaround", "--area", "a", "--evidence", "e", "s").status, 0);
  const c = cli(lane, "task", "friction", "close", "F-001", "dropped", "x");
  assert.equal(c.status, 1);
  assert.match(c.stderr, /task friction close <F-id> carded\|fixed\|dropped/);
  assert.equal(cli(lane, "task", "friction").status, 0, "listing is read only and allowed");
});

test("FRIC-AC-07 an entry appended while a card is in progress is not reported outside touch; a real file outside touch still is", async () => {
  const { root, config: cfg } = await repo();
  const ctx = fakeCtx(root, cfg);
  task.startCard(ctx, "T-M1-01");
  add(root);
  write(root, "src/a.ts", "export const a = 1;\n");
  const ok = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(ok.status, "done");
  assert.deepEqual(ok.verified.files.outside, []);
  assert.deepEqual(alwaysAllowed(cfg).filter((p) => p.includes("friction")), [FILE, `${FILE}.lock`], "the log and its lock file only");
  task.startCard(ctx, "T-M1-01", { restart: true });
  add(root, { summary: "again" });
  write(root, "docs/plan/friction-notes.md", "x\n");
  write(root, "docs/plan/other.md", "x\n");
  const bad = await task.verifyCard(ctx, "T-M1-01");
  assert.equal(bad.status, "failed");
  assert.deepEqual(bad.verified.files.outside.sort(), ["docs/plan/friction-notes.md", "docs/plan/other.md"]);
});

test("the engine knows the task:friction script and the cmd table, and CLAUDE.md + the plan README of both languages name the commands", async () => {
  assert.equal(config.ENGINE_SCRIPTS["task:friction"], "task friction");
  assert.equal(config.scriptCommand("npm", "task:friction"), "npm run task:friction");
  const { generate } = await lib("generate.mjs");
  for (const lang of ["en", "th"]) {
    const root = gitRepo();
    write(root, "package.json", { name: "demo", scripts: { test: "node -e 0" } });
    generate(root, { people: { docLanguage: lang }, stack: { packageManager: "npm", commands: { test: "npm test" } } }, { now: new Date("2026-01-02T00:00:00Z") });
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.match(claude, /npm run task:friction\b/, `${lang}: CLAUDE.md lists task:friction`);
    const readme = readFileSync(join(root, "docs/plan/README.md"), "utf8");
    assert.match(readme, /npm run task:friction -- add --kind <kind>/, `${lang}: README names add`);
    assert.match(readme, /npm run task:friction -- close <F-id>/, `${lang}: README names close`);
    assert.match(readme, /docs\/plan\/friction\.md/, `${lang}: README names the file`);
    assert.match(readme, lang === "th" ? /Friction: ค้างอยู่ <จำนวน> · ออกการ์ดแล้ว <จำนวน>/ : /`Friction: <open> open · <carded> carded`/, `${lang}: README quotes the real session line`);
    assert.ok(readFileSync(join(root, ".gitignore"), "utf8").split(/\r?\n/).includes(`${FILE}.lock`), `${lang}: the lock file is gitignored`);
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["task:friction"], "node tools/saf/bin/saf.mjs task friction");
  }
});
