import { scriptCommand } from "./config.mjs";
import { PLAN_DIR, cardStatus, doneCount, formatTime, gateResults, gateWord, titleOf, undeclaredGates } from "./plan.mjs";
import { RUN_LIMITS } from "./run.mjs";
import { textFor } from "./text.mjs";

/**
 * Evidence page — `task:report <M> --html` writes docs/plan/reports/<M>.html: ONE file, no scripts, nothing loaded.
 * Everything that comes from the plan or the evidence goes through esc() — titles, commands, tails, file names, reasons.
 * Same plan and evidence = same bytes (the newest evidence time is shown, never "now"). Spec: docs/specs/evidence-viewer.md.
 */

export const htmlPath = (mid) => `${PLAN_DIR}/reports/${mid}.html`;

const ENTITY = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
// control characters (not \t \n), DEL, C1, line/paragraph separators, bidi marks and overrides: shown as text, never passed through
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const visible = (c) => {
  const n = c.charCodeAt(0);
  return n < 256 ? `\\x${n.toString(16).padStart(2, "0")}` : `\\u${n.toString(16).padStart(4, "0")}`;
};
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ENTITY[c]).replace(HIDDEN, visible);

/** Text-table strings carry markdown: escape first, then a backticked part becomes `<code>` (rule 12). */
const md = (v) => esc(v).replace(/`([^`]*)`/g, (_, x) => `<code>${x}</code>`);

const el = (tag, cls, inner) => `<${tag}${cls ? ` class="${cls}"` : ""}>${inner}</${tag}>`;
const STATUS_CLASS = new Set(["legacy", "done", "failed", "in_progress", "todo"]);
const list = (items) => (items.length ? el("ul", "", items.map((x) => el("li", "", el("code", "", esc(x)))).join("")) : "");
const arr = (v) => (Array.isArray(v) ? v : []);

const CSS = `body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#fafafa;color:#1b1b1b}
main{max-width:64rem;margin:0 auto;padding:1rem}
h1{font-size:1.5rem;margin:.2rem 0}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #ccc}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.3rem .5rem;text-align:left;vertical-align:top}th{background:#eee}
details{border:1px solid #ccc;border-radius:.4rem;margin:.5rem 0;padding:.3rem .6rem;background:#fff}summary{cursor:pointer;font-weight:600}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f0f0;padding:.5rem;border-radius:.3rem;margin:.2rem 0 .8rem}
code{overflow-wrap:anywhere}.muted{color:#666}.over,.bad,.failed{color:#b00020;font-weight:600}.ok,.done,.legacy{color:#176b2c}.in_progress{color:#8a5a00}.todo{color:#666}
@media (prefers-color-scheme:dark){body{background:#161616;color:#e8e8e8}th{background:#262626}details{background:#1e1e1e;border-color:#444}th,td,h2{border-color:#444}pre{background:#262626}.muted,.todo{color:#aaa}.bad,.over,.failed{color:#ff8a80}.ok,.done,.legacy{color:#7bd88f}}`;

export function renderEvidencePage(plan, mid) {
  const m = plan.milestones.find((x) => x.id === mid);
  if (!m) throw new Error(`no milestone ${mid}`);
  const t = textFor(plan.config.people.docLanguage);
  const v = t.viewer;
  const tz = plan.config.people.timeZone;
  const when = (iso) => {
    try {
      return formatTime(iso, tz);
    } catch {
      return String(iso ?? "-");
    }
  };
  const gateEv = plan.gateEvidence.get(m.id)?.verified;
  const evs = m.cards.map((id) => plan.evidence.get(id)).filter(Boolean);
  const stamps = [...evs.flatMap((e) => [e.started?.at, e.verified?.at]), gateEv?.at].map((s) => [s, Date.parse(s)]).filter((x) => !Number.isNaN(x[1]));
  const newest = stamps.sort((a, b) => b[1] - a[1])[0]?.[0];

  const label = (st) => (Object.hasOwn(t.status, st) ? t.status[st] : st);
  /** Rule 14: the last `RUN_LIMITS.tailFail` lines, and one line saying how many earlier ones were left out. */
  const shownTail = (lines) => (lines.length > RUN_LIMITS.tailFail ? [v.tailOmitted(lines.length - RUN_LIMITS.tailFail), ...lines.slice(-RUN_LIMITS.tailFail)] : lines).join("\n");
  const block = (c) =>
    el("div", "", `${el("code", "", esc(c.cmd))} ${el("span", c.exit === 0 ? "ok" : "bad", esc(v.exit(c.exit)))} · ${esc(v.duration(c.ms))}`) +
    el("pre", "", esc(shownTail(arr(c.tail))) || esc(v.noOutput));
  const field = (label, items) => el("p", "", `${el("strong", "", esc(label))}`) + (items.length ? list(items) : el("p", "muted", esc(v.none)));

  // ── exit gates ──
  const results = gateResults(plan.gateEvidence.get(m.id));
  const rows = [
    ...m.gates.map((g) => {
      const res = results.find((x) => x.id === g.id);
      return { id: g.id, text: g.text, mark: gateWord(t, g, res), run: g.run, res };
    }),
    ...undeclaredGates(plan, m).map((g) => ({ id: g.id, text: g.text, mark: gateWord(t, g, g.result), run: [], res: g.result })),
  ];
  const gateHead = gateEv ? t.report.gatesChecked(when(gateEv.at), String(gateEv.head ?? "").slice(0, 7)) : t.report.gatesNot(scriptCommand(plan.config.stack.packageManager, "task:verify", m.id));
  const gateFolds = rows
    .filter((g) => arr(g.res?.commands).length || g.run.length)
    .map((g) => {
      const body = arr(g.res?.commands).length ? el("p", "", esc(v.gateCommands)) + arr(g.res.commands).map(block).join("") : el("p", "", esc(v.gateDeclared)) + list(g.run);
      return el("details", "gate", el("summary", "", `${esc(g.id)} — ${esc(g.mark)}`) + body);
    });
  const gates = [
    el("p", "", md(gateHead)),
    el("table", "", el("thead", "", el("tr", "", [v.gate, v.criterion, v.result].map((x) => el("th", "", esc(x))).join(""))) + el("tbody", "", rows.map((g) => el("tr", "", [g.id, g.text, g.mark].map((x) => el("td", "", esc(x))).join(""))).join(""))),
    ...gateFolds,
  ];

  // ── cards ──
  const lines = (s) => (s ? `${s.lines ?? 0}${s.cap != null ? ` / ${s.cap}` : ""}` : "—");
  const sizeCell = (ev, k) => {
    const s = ev?.verified?.size;
    return el("td", arr(s?.over).includes(k) ? "over" : "", esc(lines(s?.[k])) + (arr(s?.over).includes(k) ? ` ${esc(v.over)}` : ""));
  };
  const cardRows = m.cards.map((id) => {
    const ev = plan.evidence.get(id);
    const st = cardStatus(plan, id);
    const passed = st === "done" && ev?.verified ? when(ev.verified.at) : st === "legacy" ? (m.legacy[id]?.commits ?? []).join(" · ") || t.nothingYet : "—";
    const cells = [esc(id), esc(titleOf(plan, id)), el("span", STATUS_CLASS.has(st) ? st : "", esc(label(st))), esc(passed), esc(ev ? ev.attempts : "—"), esc(ev?.verified?.testMode?.mode ?? "—")];
    return el("tr", "", cells.map((c) => el("td", "", c)).join("") + sizeCell(ev, "code") + sizeCell(ev, "test"));
  });
  const cardTable = el("table", "", el("thead", "", el("tr", "", [v.card, v.work, v.status, v.passedAt, v.attempts, v.testMode, v.code, v.tests].map((x) => el("th", "", esc(x))).join(""))) + el("tbody", "", cardRows.join("")));

  const folds = m.cards.filter((id) => plan.evidence.has(id)).map((id) => {
    const ev = plan.evidence.get(id);
    const vv = ev.verified;
    const st = cardStatus(plan, id);
    const out = [];
    out.push(el("p", "", esc(v.started(when(ev.started?.at), String(ev.started?.base ?? "").slice(0, 7)))));
    if (!vv) out.push(el("p", "muted", esc(v.notVerified)));
    else {
      out.push(el("p", "", esc(v.verified(when(vv.at), String(vv.head ?? "").slice(0, 7), vv.pass ? v.pass : v.fail))));
      out.push(el("h3", "", esc(v.commands)), arr(vv.commands).map(block).join("") || el("p", "muted", esc(v.none)));
      if (arr(vv.deferred).length) out.push(el("h3", "", esc(v.deferred)), list(vv.deferred));
      if (vv.targeted) out.push(el("h3", "", esc(v.targeted)), vv.targeted.fallback ? el("p", "", esc(v.targetedFallback(vv.targeted.fallback))) : list(arr(vv.targeted.files)));
      const f = vv.files ?? {};
      out.push(field(v.changed, arr(f.changed)), field(v.outside, arr(f.outside)), field(v.forbidden, arr(f.forbidden)));
      out.push(field(v.scenarios, arr(vv.scenarios?.required)), field(v.missing, arr(vv.scenarios?.missing)));
      if (!vv.pass) {
        const why = [...arr(vv.commands).filter((c) => c.exit !== 0).map((c) => `${c.cmd} — ${v.exit(c.exit)}`), ...arr(f.outside).map((x) => `${v.outside}: ${x}`), ...arr(f.forbidden).map((x) => `${v.forbidden}: ${x}`), ...arr(vv.scenarios?.missing).map((x) => `${v.missing}: ${x}`)];
        out.push(el("h3", "", esc(v.why)), list(why));
      }
    }
    const last = arr(ev.failures).at(-1);
    if (last && last.at !== vv?.at) out.push(el("h3", "", esc(v.lastFailure(when(last.at), last.attempts))), arr(last.commands).map(block).join(""));
    return el("details", "card", el("summary", "", `${esc(id)} ${esc(titleOf(plan, id))} — ${el("span", STATUS_CLASS.has(st) ? st : "", esc(label(st)))}`) + out.join(""));
  });

  const body = [
    el("header", "", el("h1", "", esc(v.title(m.id, m.title))) + el("p", "", esc(v.milestone(Object.hasOwn(t.milestoneStatus, m.status) ? t.milestoneStatus[m.status] : m.status))) + el("p", "", esc(v.cardsDone(doneCount(plan, m), m.cards.length))) + el("p", "muted", esc(newest ? v.newest(when(newest)) : v.noEvidence))),
    el("section", "", el("h2", "", esc(v.gates)) + gates.join("")),
    el("section", "", el("h2", "", esc(v.cards)) + cardTable + (folds.length ? el("h2", "", esc(v.details)) + folds.join("") : "")),
    el("p", "muted", md(v.note(scriptCommand(plan.config.stack.packageManager, "task:report", `${m.id} --html`)))),
  ].join("\n");
  return `<!DOCTYPE html>\n<html lang="${v.htmlLang}"><head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(v.title(m.id, m.title))}</title>\n<style>${CSS}</style></head>\n<body><main>\n${body}\n</main></body></html>\n`;
}
