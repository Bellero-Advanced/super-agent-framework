import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { textFor } from "./text.mjs";

/**
 * Friction log — docs/specs/friction-log.md (rules 1-8, 13). One append-only file where the workflow notes where it got
 * in the way of a card. This module reads the file and appends lines; it never rewrites or removes a line and never
 * commits. No dependency on plan.mjs (plan.mjs imports this file).
 */

export const FRICTION_FILE = "docs/plan/friction.md";
export const FRICTION_MARKER = "<!-- entries: append only -->";
export const FRICTION_KINDS = ["review-bounce", "command-failed", "doc-drift", "workaround"];
export const CLOSE_STATUSES = ["carded", "fixed", "dropped"];
/** Triage (rules 15-16): `recurring` = open entries of one kind and area that make a group recurring. */
export const FRICTION_LIMITS = { recurring: 2 };
/** Kinds a self-fix card may carry (rule 19, D-017). */
export const SELF_FIX_KINDS = ["command-failed", "doc-drift"];

const SEP = " · ";
const TODAY_PLACEHOLDER = "2000-01-01";
const ID = /^F-\d{3,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD = /^T-M\d+-\d{2,3}$/;
const ENTRY_START = /^- F-\d+ · /;
const CLOSING = /^- (F-\d{3,}) → (carded|fixed|dropped) · (\d{4}-\d{2}-\d{2}) · (.+)$/;
const ANY_ID = /^- F-(\d+)\b/;
/** Lock for concurrent appends from several sessions of the same main folder. */
const LOCK_WAIT_MS = 5000;
const LOCK_STALE_MS = 15000;
const LOCK_POLL_MS = 25;

export class FrictionError extends Error {}

/** Lines of a text, tolerant of CRLF (a log edited on Windows) and a BOM. */
const linesOf = (text) => text.replace(/^﻿/, "").split(/\r?\n/);

/**
 * Parse the log. Lines above the marker are free text. Below it every non-blank line must be an entry or a closing line;
 * anything else is an issue with its line number (never skipped silently).
 * → { entries: [{ id, date, kind, card, area, summary, evidence, status, line, closes: [{ status, date, ref, line }] }], issues, hasMarker }
 */
export function parseFriction(text) {
  const entries = [];
  const issues = [];
  const byId = new Map();
  const at = (line, msg) => issues.push(`${FRICTION_FILE}:${line}: ${msg}`);
  const lines = linesOf(text ?? "");
  const mark = lines.findIndex((l) => l.trim() === FRICTION_MARKER);
  if (mark < 0) {
    if ((text ?? "").trim()) at(1, `the marker line ${FRICTION_MARKER} is missing — entries cannot be read`);
    return { entries, issues, hasMarker: false };
  }
  let highest = 0;
  for (let i = mark + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const line = i + 1;
    const close = raw.match(CLOSING);
    if (close) {
      const [, id, status, date, ref] = close;
      const e = byId.get(id);
      if (!e) at(line, `closing line for ${id}, which has no entry above it`);
      else e.closes.push({ status, date, ref: ref.trim(), line });
      if (ref.includes(SEP)) at(line, "text fields must not contain ·");
      continue;
    }
    if (!ENTRY_START.test(raw)) {
      at(line, "not an entry or a closing line (expected `- F-<nnn> · <date> · <kind> · <card or -> · <area> · <summary> · evidence: <text>`)");
      continue;
    }
    const f = raw.slice(2).split(SEP);
    const [id, date, kind, card, area, summary, ev] = f;
    if (f.length !== 7 || !ID.test(id) || !DATE.test(date) || !card || !area || !summary || !ev?.startsWith("evidence: ") || !ev.slice(10).trim() || (card !== "-" && !CARD.test(card))) {
      at(line, f.length > 7 ? "an entry has exactly 7 fields — a text field must not contain ·" : "not a valid entry (expected `- F-<nnn> · <date> · <kind> · <card or -> · <area> · <summary> · evidence: <text>`)");
      continue;
    }
    const n = Number(id.slice(2));
    if (byId.has(id)) at(line, `duplicate id ${id}`);
    else if (n <= highest) at(line, `id ${id} does not increase (the highest so far is F-${String(highest).padStart(3, "0")})`);
    if (!FRICTION_KINDS.includes(kind)) at(line, `unknown kind "${kind}" (one of ${FRICTION_KINDS.join(", ")})`);
    highest = Math.max(highest, n);
    if (byId.has(id)) continue;
    const entry = { id, date, kind, card, area, summary, evidence: ev.slice(10).trim(), status: "open", line, closes: [] };
    byId.set(id, entry);
    entries.push(entry);
  }
  for (const e of entries) if (e.closes.length) e.status = e.closes[e.closes.length - 1].status;
  return { entries, issues, hasMarker: true };
}

export function readFriction(root) {
  const file = join(root, FRICTION_FILE);
  return existsSync(file) ? parseFriction(readFileSync(file, "utf8")) : { entries: [], issues: [], hasMarker: false };
}

export const countByStatus = (entries) => Object.fromEntries(["open", "carded", "fixed", "dropped"].map((s) => [s, entries.filter((e) => e.status === s).length]));

const clean = (v) => (typeof v === "string" ? v.trim() : "");
/** A field must not hold the separator, a line break, or start/end with the dot (` ·` at an end would glue to the neighbouring separator). */
const badText = (v) => v.includes(SEP) || /[\r\n]/.test(v) || v.startsWith("·") || v.endsWith("·");

/** Next id: the highest number on any `- F-<n>` line (even a malformed one) + 1, at least three digits. */
function nextId(text) {
  let top = 0;
  for (const l of linesOf(text)) {
    const m = l.trim().match(ANY_ID);
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `F-${String(top + 1).padStart(3, "0")}`;
}

/** Exclusive lock file next to the log — two sessions appending at once cannot take the same id. */
function withLock(file, fn) {
  const lock = `${file}.lock`;
  const start = Date.now();
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true });
      } catch {
        // the other process just released it
      }
      if (Date.now() - start > LOCK_WAIT_MS) throw new FrictionError(`${FRICTION_FILE} is locked by another command (${lock}) — wait and retry`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

/**
 * Append one line: `pick(text)` returns the value (an id) that `line(value)` turns into the line — it runs under the lock,
 * on the text as it is now. A new or empty file gets `header` first. The file keeps its own line ending; a missing final
 * newline is added before the line. Nothing already in the file is rewritten. `verify(line, made)` runs before the write
 * and throws when the line would not read back as the fields it was built from.
 */
function appendLine(root, line, header, pick, verify) {
  const file = join(root, FRICTION_FILE);
  mkdirSync(dirname(file), { recursive: true });
  return withLock(file, () => {
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const fresh = !text.trim();
    if (!fresh && !linesOf(text).some((l) => l.trim() === FRICTION_MARKER)) throw new FrictionError(`${FRICTION_FILE} has no marker line ${FRICTION_MARKER} — nothing appended`);
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const made = pick(fresh ? "" : text);
    verify(line(made), made);
    let lead = "";
    if (fresh) lead = `${(header ?? `# Friction log\n\n${FRICTION_MARKER}`).replace(/\r?\n/g, eol)}${eol}`;
    else if (!text.endsWith("\n")) lead = eol;
    appendFileSync(file, `${lead}${line(made)}${eol}`);
    return made;
  });
}

/**
 * Append one entry. `fields`: { kind, area, evidence, summary, card? }. `opts`: { today (YYYY-MM-DD), header, cards (card id → boolean) }.
 * Refuses (FrictionError, nothing written) per rule 7. Returns the new id.
 */
export function appendEntry(root, fields, opts = {}) {
  const kind = clean(fields.kind);
  const area = clean(fields.area);
  const evidence = clean(fields.evidence);
  const summary = clean(fields.summary);
  const card = clean(fields.card) || "-";
  if (!FRICTION_KINDS.includes(kind)) throw new FrictionError(`unknown kind "${kind}" — one of ${FRICTION_KINDS.join(", ")}`);
  for (const [name, v] of [["area", area], ["evidence", evidence], ["summary", summary]]) if (!v) throw new FrictionError(`${name} is empty`);
  for (const [name, v] of [["area", area], ["evidence", evidence], ["summary", summary], ["card", card]]) if (badText(v)) throw new FrictionError(`${name} must not contain "${SEP.trim()}" or a line break`);
  if (card !== "-" && !(CARD.test(card) && (opts.cards ? opts.cards(card) : true))) throw new FrictionError(`--card ${card} is not a card of the plan`);
  const today = opts.today;
  if (!DATE.test(today ?? "")) throw new FrictionError("no date for the entry");
  const want = { date: today, kind, card, area, summary, evidence };
  const verify = (l, id) => {
    const got = parseFriction(`${FRICTION_MARKER}\n${l}`);
    const e = got.entries[0];
    if (got.issues.length || !e || e.id !== id || Object.entries(want).some(([k, v]) => e[k] !== v)) throw new FrictionError("the line would not read back as the same fields");
  };
  return appendLine(root, (id) => `- ${id}${SEP}${today}${SEP}${kind}${SEP}${card}${SEP}${area}${SEP}${summary}${SEP}evidence: ${evidence}`, opts.header, nextId, verify);
}

/**
 * Append one closing line (rule 8). `status`: carded | fixed | dropped · `ref`: a card id of the plan (carded, fixed) or a reason (dropped).
 * Refuses an unknown id, an entry already fixed or dropped, an invalid ref. Returns the id.
 */
export function appendClose(root, id, status, ref, opts = {}) {
  const what = clean(ref);
  if (!CLOSE_STATUSES.includes(status)) throw new FrictionError(`status must be one of ${CLOSE_STATUSES.join(", ")}`);
  if (!what) throw new FrictionError(status === "dropped" ? "dropped needs a reason" : `${status} needs a card id`);
  if (badText(what)) throw new FrictionError(`the ${status === "dropped" ? "reason" : "card id"} must not contain "${SEP.trim()}" or a line break`);
  if (status !== "dropped" && !(CARD.test(what) && (opts.cards ? opts.cards(what) : true))) throw new FrictionError(`${status} needs a card id of the plan (${what} is not one)`);
  const today = opts.today;
  if (!DATE.test(today ?? "")) throw new FrictionError("no date for the closing line");
  if (!existsSync(join(root, FRICTION_FILE))) throw new FrictionError(`no entry ${id} — ${FRICTION_FILE} does not exist`);
  return appendLine(
    root,
    () => `- ${id} → ${status}${SEP}${today}${SEP}${what}`,
    null,
    (text) => {
      const e = parseFriction(text).entries.find((x) => x.id === id);
      if (!e) throw new FrictionError(`no entry ${id} in ${FRICTION_FILE}`);
      if (e.status === "fixed" || e.status === "dropped") throw new FrictionError(`${id} is already ${e.status} — a mistake is corrected with a new entry`);
      return id;
    },
    (l, made) => {
      const got = parseFriction(`${FRICTION_MARKER}\n- ${made}${SEP}${TODAY_PLACEHOLDER}${SEP}workaround${SEP}-${SEP}a${SEP}s${SEP}evidence: e\n${l}`);
      const c = got.entries[0]?.closes[0];
      if (got.issues.length || c?.status !== status || c.date !== today || c.ref !== what) throw new FrictionError("the line would not read back as the same fields");
    },
  );
}

/** One line of the friction listing. */
export const entryLine = (e) => [e.id, e.status, e.kind, e.card, e.area, e.summary].join(SEP);

/**
 * Open entries grouped by kind and area (rule 15), recurring groups first, then the larger, then in order of the first id.
 * → [{ kind, area, count, ids, evidence (of the highest id), summaries, recurring }]
 */
export function groupFriction(entries) {
  const groups = new Map();
  for (const e of entries.filter((x) => x.status === "open")) {
    const key = `${e.kind}${SEP}${e.area}`;
    const g = groups.get(key) ?? { kind: e.kind, area: e.area, count: 0, ids: [], evidence: "", summaries: [], recurring: false };
    g.count += 1;
    g.ids.push(e.id);
    g.evidence = e.evidence;
    g.summaries.push(e.summary);
    g.recurring = g.count >= FRICTION_LIMITS.recurring;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.count - a.count);
}

/** The milestone a draft belongs to: the active one, else the first planned one. */
const targetMilestone = (plan) => plan.milestones.find((m) => m.status === "active") ?? plan.milestones.find((m) => m.status === "planned");

/**
 * Card drafts (rule 16): one per recurring group and one per open entry whose kind is in SELF_FIX_KINDS while workflow.selfFix is "on".
 * Each is a string in the shape of docs/plan/tasks/_template.md with touch and "Done when" left as TODO; nothing is written anywhere.
 */
export function renderDrafts(plan) {
  const t = textFor(plan.config?.people?.docLanguage).friction;
  const entries = plan.friction.entries.filter((e) => e.status === "open");
  const mid = targetMilestone(plan)?.id ?? "M?";
  const id = `T-${mid}-??`;
  const draft = ({ title, why, fix }) =>
    [
      "---",
      `id: ${id}`,
      `milestone: ${mid}`,
      `title: ${JSON.stringify(title)}`,
      "spec: []",
      "depends: []",
      "size: S",
      "role: implementer",
      "touch:",
      "  - TODO",
      "dont_touch: []",
      "scenarios: []",
      ...(fix ? [`self_fix: ${fix}`] : []),
      "---",
      "",
      `# ${id} — ${title}`,
      "",
      "## Why",
      "",
      ...why.map((e) => `- ${e.id}${SEP}${e.date}${SEP}${e.kind}${SEP}${e.area}${SEP}${e.summary}${SEP}evidence: ${e.evidence}`),
      "",
      "## What to do",
      "",
      `- ${t.todoDo}`,
      "",
      "## Done when",
      "",
      `- ${t.todoDone}`,
      "",
    ].join("\n");
  const out = [];
  for (const g of groupFriction(entries).filter((x) => x.recurring)) {
    const why = entries.filter((e) => g.ids.includes(e.id));
    out.push(draft({ title: t.groupTitle(g.summaries[g.summaries.length - 1], g.count), why }));
  }
  if (plan.config?.workflow?.selfFix === "on") {
    for (const e of entries.filter((x) => SELF_FIX_KINDS.includes(x.kind))) out.push(draft({ title: e.summary, why: [e], fix: e.id }));
  }
  return out;
}
