import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib } from "../helpers.mjs";

/** Wording about card sizes M and L in setup and the user docs (docs/specs/card-sizes.md rules 17-18, SIZE-AC-10 and SIZE-AC-11). */
const { CHOICES, FIELD_MAX, LABELS, NOT_ASKED, MACHINE_SWITCHES } = await lib("choices.mjs");
const { SIZE_CAPS } = await lib("config.mjs");
const { generate } = await lib("generate.mjs");
after(cleanup);

const read = (...p) => readFileSync(join(REPO, ...p), "utf8").replace(/\r\n/g, "\n");
const flat = (s) => s.replace(/\s+/g, " ");
const FIELDS = ["what", "good", "cost", "when"];
const entry = (question, value) => CHOICES.find((e) => e.question === question && e.values.includes(value));
const entryOf = (question) => CHOICES.find((e) => e.question === question);
/** Body of the `## <heading>` section, up to the next `## `. */
const section = (text, heading) => text.split(/^## /m).find((s) => s.startsWith(heading))?.split("\n").slice(1).join("\n") ?? "";
/** The one line of a text that starts with `start`. */
const line = (text, start) => {
  const found = text.split("\n").find((l) => l.startsWith(start));
  assert.ok(found, `a line starting with: ${start}`);
  return found;
};
/** Sentences of a text: split at a full stop, a new line or a table cell. */
const sentences = (text) => text.split(/\.\s+|\n|\|/).map((s) => s.trim()).filter(Boolean);
/** What a sentence about legacy cards may say about S; nothing else may name size S. */
const OLD_S = { en: /size S\b|\bS cards?\b|size-S|S ≤|S \/ M|<S\|M>/, th: /การ์ด(ขนาด)? S|ขนาด S|S ≤|S \/ M/ };
const LEGACY = { en: /legacy|retired|\bold\b/i, th: /การ์ด S เดิม|การ์ด S เก่า/ };
const stray = (text, lang) => sentences(text).filter((s) => OLD_S[lang].test(s) && !LEGACY[lang].test(s));
const noDigitCaps = (text) => assert.ok(![SIZE_CAPS.M.code, SIZE_CAPS.L.code, SIZE_CAPS.M.test, SIZE_CAPS.L.test].some((n) => new RegExp(`\\b${n}\\b`).test(text)), "no cap number copied from the table");

const generated = (language) => {
  const root = gitRepo();
  generate(root, { stack: { packageManager: "none" }, people: { docLanguage: language }, workflow: { review: "m-cards", selfFix: "on" } }, { now: new Date("2026-01-02T00:00:00Z") });
  return { saf: readFileSync(join(root, ".claude", "commands", "saf.md"), "utf8").replace(/\r\n/g, "\n"), claude: readFileSync(join(root, "CLAUDE.md"), "utf8").replace(/\r\n/g, "\n") };
};

test("SIZE-AC-10 size-caps names M and L cards, the warning, the failure above twice a cap and one table for every rigor, within FIELD_MAX and with no digits, in en and th", () => {
  const e = entryOf("size-caps");
  for (const lang of ["en", "th"]) {
    for (const f of FIELDS) {
      const t = e[lang][f];
      assert.ok(t.trim() && t.length <= FIELD_MAX, `${lang}.${f}: ${t.length}`);
      assert.ok(!/\d/.test(t), `${lang}.${f}: digit`);
    }
  }
  assert.match(e.en.what, /caps of M and L cards/);
  assert.match(e.en.what, /verify warns above a cap and fails above twice it/);
  assert.match(e.en.cost, /same for every rigor/);
  assert.ok(!/S and M|not a failure/.test(Object.values(e.en).join(" ")), "the old S and M / not-a-failure wording is gone");
  assert.match(e.th.what, /การ์ด M และ L/);
  assert.match(e.th.what, /เตือนเมื่อเกินเพดาน และล้มเมื่อเกินสองเท่า/);
  assert.match(e.th.cost, /ทุก rigor/);
  assert.ok(!/การ์ด S และ M|ไม่ใช่การล้มเหลว/.test(Object.values(e.th).join(" ")), "th: the old wording is gone");
});

test("SIZE-AC-10 the rigor options promise no larger or smaller cards, and the review is named per option", () => {
  for (const value of ["light", "standard", "strict"]) {
    const e = entry("project-rigor", value);
    assert.ok(!/larger|smaller|bigger/i.test(e.en.what), `${value} en: ${e.en.what}`);
    assert.ok(!/ใหญ่ขึ้น|เล็กลง/.test(e.th.what), `${value} th: ${e.th.what}`);
  }
  const light = entry("project-rigor", "light");
  assert.match(light.en.what, /spec review for every new M and L card \(legacy S cards batched at the gate\)/);
  assert.match(light.en.what, /the test command as the only project check at merge\.$/);
  assert.match(light.th.what, /เป็นเช็กเดียวของโปรเจกต์$/);
  assert.match(light.th.what, /การ์ด M และ L ใหม่ทุกใบ \(การ์ด S เดิมตรวจรวมที่ gate\)/);
  assert.equal(light.en.cost, "Fewer checks at merge, so mistakes are found later and cost more to fix.");
  assert.equal(light.th.cost, "เช็กตอน merge น้อยลง จึงเจอข้อผิดพลาดช้าและแก้แพงกว่า");
  for (const f of FIELDS) for (const lang of ["en", "th"]) assert.ok(light[lang][f].length <= FIELD_MAX && !/\d/.test(light[lang][f]), `light ${lang}.${f}`);
  assert.match(entry("project-rigor", "strict").en.what, /^The tightest defaults: a spec review on every card/);
});

test("SIZE-AC-10 the m-cards words and the workflow.review line say M and L cards each get a review and legacy S cards are reviewed together at the gate", () => {
  assert.match(LABELS.en.reviewWords["m-cards"], /spec review of each M and L card; legacy S cards together at the milestone gate/);
  assert.match(LABELS.th.reviewWords["m-cards"], /การ์ดขนาด M และ L ทุกใบ ส่วนการ์ด S เดิมตรวจรวมที่ประตูออก milestone/);
  assert.match(NOT_ASKED["workflow.review"].en, /m-cards \(each M and L card; legacy S cards together at the milestone gate\)/);
  assert.match(NOT_ASKED["workflow.review"].th, /m-cards \(การ์ดขนาด M และ L ทุกใบ ส่วนการ์ด S เดิมตรวจรวมที่ประตูออก milestone\)/);
  assert.ok(!/size M only|เฉพาะขนาด M/.test(NOT_ASKED["workflow.review"].en + NOT_ASKED["workflow.review"].th), "the M-only wording is gone");
});

test("SIZE-AC-10 the selfFix line says size M and keeps the th phrase; the effort lines say M cards where they said small cards", () => {
  assert.match(NOT_ASKED["workflow.selfFix"].en, /command-failed or doc-drift, size M, with a test/);
  assert.match(NOT_ASKED["workflow.selfFix"].th, /ชนิด command-failed หรือ doc-drift ขนาด M มี test/);
  assert.ok(NOT_ASKED["workflow.selfFix"].th.includes("engine ไม่ยอมรับอย่างอื่น เรื่องที่ใหญ่กว่านี้จึงยังต้องรอเจ้าของ"));
  const fixed = entry("effort", "fixed");
  const bySize = entry("effort", "by-size");
  assert.match(fixed.en.cost, /^M cards run at the same effort as L cards/);
  assert.match(fixed.th.cost, /^การ์ด M ใช้ effort เท่ากับการ์ด L/);
  assert.match(bySize.en.good, /many M cards/);
  assert.match(bySize.en.cost, /^M cards at lower effort may bounce more in review/);
  assert.match(bySize.en.when, /spend less on M cards/);
  assert.match(bySize.th.cost, /^การ์ด M ที่ใช้ effort ต่ำลง/);
  assert.match(bySize.th.when, /ลดค่าใช้จ่ายของการ์ด M/);
  assert.match(MACHINE_SWITCHES["models.effort"].en, /lower effort for M cards/);
  assert.match(MACHINE_SWITCHES["models.effort"].th, /effort ที่ต่ำลงกับการ์ด M/);
  for (const e of [fixed, bySize]) for (const lang of ["en", "th"]) for (const f of FIELDS) assert.ok(e[lang][f].length <= FIELD_MAX && !/\d/.test(e[lang][f]), `${lang}.${f}`);
});

test("SIZE-AC-10 no choices text, setup file, template or user doc names size S outside a sentence about legacy cards", () => {
  const texts = [];
  for (const e of CHOICES) for (const lang of ["en", "th"]) texts.push([`choices ${e.question} ${lang}`, lang, Object.values(e[lang]).join(". ")]);
  for (const [k, v] of [...Object.entries(NOT_ASKED), ...Object.entries(MACHINE_SWITCHES)]) for (const lang of ["en", "th"]) texts.push([`${k} ${lang}`, lang, v[lang]]);
  for (const lang of ["en", "th"]) texts.push([`LABELS ${lang}`, lang, Object.values(LABELS[lang].reviewWords).join(". ")]);
  const files = [
    ["kit", "claude", "skills", "saf-setup", "questions.md"], ["kit", "claude", "skills", "saf-setup", "SKILL.md"],
    ["docs", "card-lifecycle.md"], ["docs", "config-reference.md"], ["docs", "setup-questions.md"],
    ["kit", "tools-saf", "templates", "en", "commands", "saf.md"], ["kit", "tools-saf", "templates", "en", "CLAUDE.template.md"],
  ];
  for (const f of files) texts.push([f.join("/"), "en", read(...f)]);
  for (const f of [["commands", "saf.md"], ["CLAUDE.template.md"]]) texts.push([`th ${f.join("/")}`, "th", read("kit", "tools-saf", "templates", "th", ...f)]);
  texts.push([".claude/commands/saf.md", "en", read(".claude", "commands", "saf.md")]);
  for (const [name, lang, text] of texts) assert.deepEqual(stray(text, lang), [], name);
});

test("SIZE-AC-10 the setup skill: the rigor table has no size columns, the sizes row says { M, L } and the size table, the effort paragraph says M cards, the derived values name the M / L caps", () => {
  const q = read("kit", "claude", "skills", "saf-setup", "questions.md");
  const tableHead = line(q, "| Rigor |");
  assert.ok(!/size|caps/i.test(tableHead), `no size columns: ${tableHead}`);
  assert.ok(line(q, "| light |").includes("| spec review for every new M and L card (legacy S cards together at the milestone gate) |"), "the light row: every new card is reviewed");
  assert.match(flat(q), /Card size caps come from the size table .*?the same for every rigor/);
  const row = line(q, "| Override card size caps?");
  const cells = row.split("|").slice(1, -1).map((c) => c.trim());
  assert.ok(cells[2].includes("{ M, L }"), cells[2]);
  assert.ok(/the size table/.test(cells[3]), cells[3]);
  assert.match(flat(q), /M cards at a lower effort may bounce more in review; `task:report` shows review rounds by size and effort/);
  assert.ok(/M cards\?/.test(line(q, "| Effort for every card")), "the effort question says M cards");
  noDigitCaps(row);
  const skill = flat(read("kit", "claude", "skills", "saf-setup", "SKILL.md"));
  assert.match(skill, /\(the M \/ L card and test caps, review and merge checks for a rigor;/);
});

test("SIZE-AC-10 the generated /saf review row and the CLAUDE.md review line say M and L cards, with legacy S cards at the gate (m-cards, en and th)", () => {
  const en = generated("en");
  assert.match(line(en.saf, "| review |"), /— M and L cards; legacy S cards at the milestone gate/);
  assert.match(en.claude, /- `spec-reviewer` compared M and L cards with the spec; legacy S cards are reviewed together at the milestone gate/);
  const th = generated("th");
  assert.match(line(th.saf, "| เทียบสเปก |"), /— การ์ดขนาด M และ L · การ์ด S เดิมตรวจรวมที่ประตูออก/);
  assert.match(th.claude, /- `spec-reviewer` เทียบการ์ดขนาด M และ L กับสเปก · การ์ด S เดิมตรวจรวมที่ประตูออก milestone/);
  for (const t of [en.saf, en.claude]) assert.deepEqual(stray(t, "en"), []);
  for (const t of [th.saf, th.claude]) assert.deepEqual(stray(t, "th"), []);
});

test("SIZE-AC-11 the lifecycle loop names the size shown at start, the warning, the hard stop with exit 1 and the designer's split, legacy S, and the review of M and L cards", () => {
  const doc = read("docs", "card-lifecycle.md");
  const loop = section(doc, "The loop");
  const step = (n, next) => flat(loop.slice(loop.indexOf(`\n${n}. `), loop.indexOf(`\n${next}. `)));
  const two = step(2, 3);
  assert.match(two, /· size <M\|L> · models\.effort <mode>/);
  assert.match(two, /records the agent, effort, mode and source in the evidence \(`started\.effort`; the size is printed, not stored\)/);
  assert.match(two, /a card that says `S` \(legacy\) or has no size is counted as M/);
  const four = step(4, 5);
  assert.match(four, /caps of the card's size \(`workflow\.sizes`, `workflow\.testCaps`; `SIZE_CAPS` in `lib\/config\.mjs`, the same for every rigor\)/);
  assert.match(four, /Over a cap = a warning in the output and in the evidence \(`verified\.size`\)/);
  assert.match(four, /Above twice the cap \(`HARD_STOP_FACTOR`\) the card fails and `task:verify` exits 1[^.]*no command runs[^.]*the designer splits the card/);
  assert.match(four, /A legacy `S` card counts as M/);
  assert.ok(!/never a failure/.test(four), "the old 'never a failure' is gone");
  noDigitCaps(four);
  const five = step(5, 6);
  assert.match(five, /every card at standard\/strict rigor; at light rigor every new M and L card too, and legacy S cards are reviewed together at the milestone gate — the convention the generated CLAUDE\.md asks for; the engine does not enforce it/);
});

test("SIZE-AC-11 the card format example says size: M with a comment that points to SIZE_CAPS and copies no number", () => {
  const doc = read("docs", "card-lifecycle.md");
  const sizeLine = line(section(doc, "Card format"), "size: ");
  assert.match(sizeLine, /^size: M\s+# M or L: the caps are `SIZE_CAPS` in `lib\/config\.mjs`/);
  noDigitCaps(sizeLine);
  assert.ok(!/\d/.test(sizeLine), "no number at all");
});

test("SIZE-AC-11 self-fix: the lifecycle section and the config row say the card is size M and that size L waits; the generated /saf says the same in en and th", () => {
  const sf = flat(section(read("docs", "card-lifecycle.md"), "Self-fix cards"));
  assert.match(sf, /the card is size M, its milestone is the active one/);
  assert.match(sf, /Everything that does not qualify \(another kind, size L, the cap reached, `selfFix` off\) waits for the designer and the owner's Go/);
  const cr = read("docs", "config-reference.md");
  assert.match(line(cr, "| `selfFix`"), /and the card is size M, lists a test file in `touch`/);
  const en = generated("en").saf;
  assert.match(flat(en), /that one size M card with a test can fix/);
  assert.match(flat(en), /Anything else — another kind, size L \(a self-fix card is size M\), no test, the cap reached — waits for `designer`/);
  const th = generated("th").saf;
  assert.match(flat(th), /การ์ดขนาด M ใบเดียวพร้อม test แก้ได้/);
  assert.match(flat(th), /อย่างอื่น — ชนิดอื่น ขนาด L \(การ์ดแก้ตัวเองเป็นขนาด M\) ไม่มี test เกินเพดาน — รอ `designer`/);
});

test("SIZE-AC-11 config-reference: rigor row without sizes, the sizes row ({ M, L }, the table, the hard stop, the ignored old shape), the review row, the effort row", () => {
  const cr = read("docs", "config-reference.md");
  const rigor = line(cr, "| `rigor`");
  assert.match(rigor, /derives review and merge checks/);
  assert.ok(!/sizes|test caps/.test(rigor), `no sizes in the rigor row: ${rigor}`);
  const sizes = line(cr, "| `sizes` · `testCaps`");
  for (const t of ["`{ \"M\": <lines>, \"L\": <lines> }`", "`SIZE_CAPS` in `lib/config.mjs`", "the same for every rigor", "warns above a cap", "fails above twice it", "`{ \"S\", \"M\" }`", "ignored with a warning"]) assert.ok(sizes.includes(t), t);
  noDigitCaps(sizes);
  assert.match(line(cr, "| `review`"), /m-cards \(every new M and L card; legacy S cards together at the milestone gate, as the generated CLAUDE\.md asks — the engine does not enforce it\)/);
  assert.match(line(cr, "| `effort`"), /the effort of size M and size L cards/);
  assert.match(line(cr, "| `effort`"), /M cards at a lower effort may bounce more in review/);
});

test("SIZE-AC-11 setup-questions lists the card size caps as M / L and the effort question as lowering M cards", () => {
  const sq = flat(read("docs", "setup-questions.md"));
  assert.match(sq, /card size caps \(M \/ L, one table for every rigor\)/);
  assert.match(sq, /`by-size` gives M cards a lower effort/);
});
