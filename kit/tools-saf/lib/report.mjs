import { posix } from "node:path";
import { scriptCommand } from "./config.mjs";
import { buildMatrix, isSpecFile } from "./matrix.mjs";
import { EVIDENCE_DIR, PLAN_DIR, cardStatus, formatTime, titleOf } from "./plan.mjs";
import { textFor } from "./text.mjs";

/**
 * Milestone report — task:report <M> writes docs/plan/reports/<M>.md from files only:
 * cards + evidence · gates · scenario matrix of the specs the cards reference. Missing data is written as such — never guessed.
 */

export const reportPath = (mid) => `${PLAN_DIR}/reports/${mid}.md`;
const cell = (s) => s.replace(/\|/g, "\\|");

export function renderReport(input, mid) {
  const { plan } = input;
  const t = textFor(plan.config.people.docLanguage);
  const r = t.report;
  const tz = plan.config.people.timeZone;
  const c = (s, a) => scriptCommand(plan.config.stack.packageManager, s, a);
  const m = plan.milestones.find((x) => x.id === mid);
  if (!m) throw new Error(`no milestone ${mid}`);
  const out = [r.title(m.id, m.title), "", r.note(c("task:report", m.id)), "", r.cards, "", r.cardsTable, "|---|---|---|---|---|"];
  for (const id of m.cards) {
    const ev = plan.evidence.get(id);
    const st = cardStatus(plan, id);
    const passed = st === "done" && ev?.verified ? formatTime(ev.verified.at, tz) : st === "legacy" ? (m.legacy[id]?.commits.join(" · ") ?? t.nothingYet) : "—";
    out.push(`| ${id} | ${cell(titleOf(plan, id))} | ${t.status[st]} | ${cell(passed)} | ${ev ? ev.attempts : "—"} |`);
  }
  const done = m.cards.filter((id) => ["done", "legacy"].includes(cardStatus(plan, id))).length;
  out.push("", r.doneLine(done, m.cards.length), "", r.gates, "");
  const gates = plan.gateEvidence.get(m.id)?.verified;
  out.push(gates ? r.gatesChecked(formatTime(gates.at, tz), gates.head.slice(0, 7)) : r.gatesNot(c("task:verify", m.id)), "");
  out.push(t.gatesTable, "|---|---|---|");
  for (const g of m.gates) {
    const res = gates?.gates.find((x) => x.id === g.id);
    const mark = !res ? t.gateNotRun : res.pass === null ? t.gateManual : res.pass ? "✓" : t.gateFail;
    out.push(`| ${g.id} | ${cell(g.text)} | ${mark} |`);
  }
  out.push("", r.matrix, "");
  const specs = [...new Set(m.cards.flatMap((id) => plan.cards.get(id)?.spec ?? []))].filter(isSpecFile).sort();
  if (!specs.length) out.push(r.noSpecs(m.id));
  else {
    const matrix = buildMatrix({ files: input.files, read: input.read, cards: [...plan.cards.values()], status: (id) => cardStatus(plan, id) });
    out.push(r.matrixTable, "|---|---|---|---|");
    for (const s of specs) {
      const rows = matrix.rows.filter((x) => x.spec === s);
      const hit = rows.filter((x) => x.tests.length).length;
      out.push(`| ${posix.basename(s, ".md")} | ${rows.length} | ${hit} | ${rows.length - hit} |`);
    }
  }
  out.push("", `${r.raw} \`${EVIDENCE_DIR}/\``, "");
  return out.join("\n");
}
