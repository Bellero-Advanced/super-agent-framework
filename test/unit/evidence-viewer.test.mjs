import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, lib, planRepo, write } from "../helpers.mjs";

const { renderEvidencePage, htmlPath } = await lib("viewer.mjs");
const { resolveConfig } = await lib("config.mjs");
const { TEXT } = await lib("text.mjs");
after(cleanup);

const cfg = (lang = "en") => resolveConfig({ version: 1, stack: { packageManager: "none" }, people: { docLanguage: lang, timeZone: "UTC" } });
const BAD_TITLE = `Fix "a" & 'b' <script>alert(1)</script>`;
const cmd = (c, exit, tail) => ({ cmd: c, exit, ms: 12, tail });
const size = { size: "S", code: { lines: 40, cap: 150 }, test: { lines: 300, cap: 250 }, over: ["test"] };
const files = (extra = {}) => ({ changed: ["src/a.mjs"], outside: [], forbidden: [], hashes: {}, ...extra });
const ok = { required: ["AC-01"], missing: [] };

/** M1 with a passed card, a failed card and a not-started card · gate evidence with a declared and an undeclared gate. */
function fixture(lang = "en", over = {}) {
  const card = (id, title) => ({ id, title, file: `docs/plan/tasks/M1/${id}.md`, touch: [], depends: [], scenarios: [] });
  const ev1 = {
    id: "T-M1-01", status: "done", attempts: 2, started: { at: "2026-01-01T10:00:00.000Z", base: "abcdef1234567890", dirty: {} },
    verified: {
      at: "2026-01-02T10:00:00.000Z", head: "1234567deadbeef", pass: true,
      commands: [cmd("npm run one", 0, ["line <script>alert(1)</script>", "&lt;already&gt;", "\"><img src=x onerror=alert(1)>", "</details> --> done"]), cmd("npm run two", 0, [])],
      files: files(), scenarios: ok, size, testMode: { mode: "targeted", source: "config" }, deferred: ["npm test"], targeted: { files: ["test/unit/a.test.mjs"] },
    },
    failures: [{ at: "2026-01-01T12:00:00.000Z", head: "x", attempts: 1, commands: [cmd("npm run one", 1, ["first try broke"])] }],
  };
  const ev2 = {
    id: "T-M1-02", status: "failed", attempts: 1, started: { at: "2026-01-03T10:00:00.000Z", base: "fedcba9876543210", dirty: {} },
    verified: {
      at: "2026-01-04T08:30:00.000Z", head: "9999999aaaa", pass: false,
      commands: [cmd("npm run bad", 7, ["\u001b[31mred\u001b[0m", "x".repeat(5000)])],
      files: files({ outside: ["other/b.mjs"], forbidden: ["secret/k.mjs"] }), scenarios: { required: ["AC-09"], missing: ["AC-09"] }, size: { ...size, over: [] },
    },
  };
  const gate = (id, pass, commands) => ({ id, pass, commands });
  const cards = [card("T-M1-01", BAD_TITLE), card("T-M1-02", "second"), card("T-M1-03", "third")];
  return {
    config: cfg(lang),
    milestones: [{
      id: "M1", title: "First <b>", status: "active", file: "docs/plan/milestones/M1.md", cards: cards.map((c) => c.id), sideCards: [], legacy: {},
      gates: [{ id: "project-checks", text: "checks pass", run: ["npm test"] }, { id: "owner-ok", text: "owner looks", run: [] }],
    }],
    cards: new Map(cards.map((c) => [c.id, c])),
    evidence: new Map([[ev1.id, ev1], [ev2.id, ev2]]),
    gateEvidence: new Map([["M1", { id: "M1", kind: "milestone", verified: { at: "2026-01-05T09:00:00.000Z", head: "abcdef0123", gates: [gate("project-checks", true, [cmd("npm test", 0, ["# pass 9"])]), gate("owner-ok", null, []), gate("full-suite", false, [cmd("npm run full", 1, ["suite broke"])])] } }]]),
    ...over,
  };
}

test("VIEW-AC-01 cards in milestone order with status, passed card shows commands and tails, failed card its reasons, not started has no section, both gates listed", () => {
  const html = renderEvidencePage(fixture(), "M1");
  const at = (s) => html.indexOf(s);
  assert.ok(at("T-M1-01") > 0 && at("T-M1-01") < at("T-M1-02") && at("T-M1-02") < at("T-M1-03"));
  const t = TEXT.en;
  assert.ok(html.includes(t.status.done) && html.includes(t.status.failed) && html.includes(t.status.todo));
  assert.ok(html.includes("npm run one") && html.includes("npm run two") && html.includes("first try broke"));
  assert.match(html, /exit 0/);
  assert.match(html, /exit 7/);
  assert.ok(html.includes("other/b.mjs") && html.includes("secret/k.mjs") && html.includes("AC-09"), "failure reasons");
  assert.ok(html.includes("npm test") && html.includes("test/unit/a.test.mjs"), "deferred and targeted");
  assert.ok(html.includes("2026-01-02 10:00") && html.includes("abcdef1") && html.includes("1234567"));
  assert.equal(html.split('<details class="card">').length - 1, 2, "two card sections, none for the not-started card");
  assert.ok(!html.includes("third</summary>"));
  for (const g of ["project-checks", "owner-ok", "full-suite"]) assert.ok(html.includes(g), g);
  assert.ok(html.includes(t.fullSuiteGate) && html.includes(t.gateManual) && html.includes(t.gateFail));
  assert.ok(html.includes("2026-01-05 09:00"), "newest evidence time");
  assert.match(html, /1 \/ 150|40 \/ 150/);
  assert.equal(renderEvidencePage(fixture(), "M1"), html, "pure and deterministic");
  assert.throws(() => renderEvidencePage(fixture(), "M9"), /no milestone M9/);
});

test("VIEW-AC-02 hostile text is escaped once, nothing can load or run, the CSP meta tag is there", () => {
  const html = renderEvidencePage(fixture(), "M1");
  assert.ok(html.includes("Fix &quot;a&quot; &amp; &#39;b&#39; &lt;script&gt;alert(1)&lt;/script&gt;"), "title");
  assert.ok(html.includes("line &lt;script&gt;alert(1)&lt;/script&gt;"), "tail");
  assert.ok(html.includes("&amp;lt;already&amp;gt;"), "already-escaped text is shown as typed, not decoded");
  assert.ok(html.includes("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"), "attribute-breaking text");
  assert.ok(html.includes("&lt;/details&gt; --&gt; done"));
  assert.ok(!html.includes("\u001b"), "no raw escape character");
  assert.ok(html.includes("\\x1b[31mred"), "control characters are made visible");
  assert.ok(html.includes("x".repeat(5000)), "long lines are kept whole");
  assert.ok(html.includes("First &lt;b&gt;"), "milestone title");
  const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
  const allowed = new Set(["html", "head", "meta", "title", "style", "body", "h1", "h2", "h3", "p", "table", "thead", "tbody", "tr", "th", "td", "details", "summary", "pre", "code", "ul", "li", "div", "span", "main", "section", "header", "strong"]);
  assert.deepEqual([...new Set(tags)].filter((x) => !allowed.has(x)), [], "only tags this page writes itself");
  assert.doesNotMatch(html, /<script|<link|<iframe|<img|<object|<embed|<base|<form/i);
  const markup = (html.match(/<[^>]+>/g) ?? []).join("\n"); // escaped text holds no "<", so this is every real tag
  assert.doesNotMatch(markup, /\s(src|href|action|data|srcset|formaction|poster)\s*=/i);
  assert.doesNotMatch(markup, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(markup, /https?:|\/\/|javascript:/i);
  assert.doesNotMatch(html.match(/<style>[^]*<\/style>/)[0], /https?:|\/\/|url\(|@import/i);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">/);
  assert.equal(html.split("<style>").length, 2);
  // a broken or hostile evidence record is shown, never executed
  const p = fixture();
  p.evidence.get("T-M1-01").status = `"><script>alert(2)</script>`;
  p.evidence.get("T-M1-01").verified.at = "not a date";
  const h2 = renderEvidencePage(p, "M1");
  assert.doesNotMatch(h2, /<script/i);
  assert.ok(h2.includes("&quot;&gt;&lt;script&gt;alert(2)"));
});

test("VIEW-AC-03 a Thai document language gives the Thai labels", () => {
  const html = renderEvidencePage(fixture("th"), "M1");
  const th = TEXT.th;
  for (const label of [th.viewer.cards, th.viewer.gates, th.viewer.commands, th.status.done, th.status.todo, th.gateManual]) assert.ok(html.includes(label), label);
  assert.ok(html.includes('<html lang="th">'));
  assert.ok(!html.includes(TEXT.en.viewer.commands) && !html.includes(TEXT.en.viewer.gates));
  assert.ok(renderEvidencePage(fixture("en"), "M1").includes(TEXT.en.viewer.gates));
  for (const k of Object.keys(TEXT.en.viewer)) assert.equal(typeof TEXT.th.viewer[k], typeof TEXT.en.viewer[k], `viewer.${k} exists in th`);
});

test("VIEW-AC-04 task report --html writes the .md and the .html twice byte-identical; without --html no .html", async () => {
  const { root } = await planRepo({ cards: [{ id: "T-M1-01", title: BAD_TITLE }, { id: "T-M1-02" }] });
  const fx = fixture();
  write(root, "docs/plan/evidence/T-M1-01.json", fx.evidence.get("T-M1-01"));
  write(root, "docs/plan/evidence/M1.json", fx.gateEvidence.get("M1"));
  commitAll(root, "evidence");
  const bin = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
  const cli = (...args) => spawnSync(process.execPath, [bin, "task", "report", ...args], { cwd: root, encoding: "utf8" });
  const htmlFile = join(root, ...htmlPath("M1").split("/"));
  const plain = cli("M1");
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(existsSync(join(root, "docs", "plan", "reports", "M1.md")));
  assert.ok(!existsSync(htmlFile), "no .html without --html");
  assert.doesNotMatch(plain.stdout, /\.html/);
  const a = cli("M1", "--html");
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /docs\/plan\/reports\/M1\.md/);
  assert.match(a.stdout, /docs\/plan\/reports\/M1\.html/);
  const first = readFileSync(htmlFile);
  const b = cli("--html", "M1");
  assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(readFileSync(htmlFile), first, "byte-identical");
  assert.ok(first.toString("utf8").includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const bad = cli("M9", "--html");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no milestone M9/);
  assert.equal(htmlPath("M2"), "docs/plan/reports/M2.html");
});

test("VIEW-AC-01 a milestone without any evidence lists every card as not started and every gate as not checked", () => {
  const p = fixture("en", { evidence: new Map(), gateEvidence: new Map() });
  const html = renderEvidencePage(p, "M1");
  assert.equal(html.split(TEXT.en.status.todo).length - 1, 3);
  assert.ok(html.includes(TEXT.en.gateNotRun));
  assert.ok(!html.includes(`<details class="card">`), "no card section without evidence");
});
