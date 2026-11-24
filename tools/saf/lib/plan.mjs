import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SIZES, roleTable, scriptCommand } from "./config.mjs";
import { FRICTION_FILE, countByStatus, parseFriction, selfFixIssues } from "./friction.mjs";
import { submodulePaths } from "./git.mjs";
import { codeSpans, findSection, frontmatter, scanLines, sections } from "./markdown.mjs";
import { stripComment } from "./yaml.mjs";
import { parseYaml } from "./yaml.mjs";
import { FULL_SUITE_GATE } from "./testmode.mjs";
import { textFor } from "./text.mjs";

/**
 * Card-based plan — reads docs/plan/ and computes status from evidence only.
 *
 *   milestones/M1.md        goal · scope · exit gates · ordered card list · status (one active at a time) ·
 *                           side_cards: cards that may run as a side lane while the milestone is still planned
 *   tasks/M1/T-M1-01.md     one card per file (frontmatter + a criteria section whose items are commands)
 *   evidence/T-M1-01.json   evidence — written by task:start / task:verify only
 *   STATE.md · .saf/plan.md generated from the three above (never edited by hand)
 *
 * This module never runs commands and never writes git.
 */

export const PLAN_DIR = "docs/plan";
export const MILESTONE_DIR = `${PLAN_DIR}/milestones`;
export const TASK_DIR = `${PLAN_DIR}/tasks`;
export const EVIDENCE_DIR = `${PLAN_DIR}/evidence`;
export const STATE_FILE = `${PLAN_DIR}/STATE.md`;
export const MIRROR_FILE = ".saf/plan.md";
export const SPEC_DIR = "docs/specs/";
export const ROOT_REPO = ".";

export const CARD_ID = /^T-(M\d+)-\d{2,3}$/;
export const MILESTONE_ID = /^M\d+$/;
const MILESTONE_STATUS = ["planned", "active", "paused", "done"];

export const CRITERIA_HEADINGS = ["Done when", "Pass criteria", "Criteria", "เกณฑ์ผ่าน"];
/** Rule 19 of docs/specs/card-sizes.md: the section of numbered steps, and how few an L card may list (data, not logic). */
export const STEPS_HEADINGS = ["Steps", "ขั้นตอน"];
export const L_MIN_STEPS = 2;
export const MILESTONE_HEADINGS = { goal: ["Goal", "เป้าหมาย"], scope: ["Scope", "ขอบเขต"], risks: ["Risks", "ความเสี่ยง"] };

export const alwaysAllowed = (config) => [`${EVIDENCE_DIR}/**`, STATE_FILE, MIRROR_FILE, ".saf/memory/**", FRICTION_FILE, `${FRICTION_FILE}.lock`, ...(config?.workflow?.alwaysAllowed ?? [])];

const asRecord = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const str = (v) => (typeof v === "string" ? v.trim() : "");
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);

/** Criteria items: a backticked command at the start of the item, or the whole item (`#` comment removed). */
export function criteriaCommands(lines) {
  const out = [];
  for (const l of lines) {
    if (l.inFence) continue;
    const item = l.text.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim();
    if (!item) continue;
    const first = codeSpans(item)[0];
    const cmd = first && first.start === 0 ? first.content.trim() : stripComment(item).trim();
    if (cmd) out.push(cmd);
  }
  return out;
}

/** Steps: the numbered items (`1. text`) of the steps section, outside code fences, in order · no section → []. */
export function cardSteps(sectionLines) {
  const out = [];
  let indent = null;
  for (const l of sectionLines ?? []) {
    if (l.inFence) continue;
    const m = l.text.match(/^( *)\d+[.)]\s+(.+?)\s*$/);
    if (!m) continue;
    // top level = the indent of the first numbered item, at most 3 spaces (4 or more is code); a nested list is indented deeper
    if (m[1].length > 3) continue;
    indent ??= m[1].length;
    if (m[1].length === indent) out.push(m[2]);
  }
  return out;
}

function readFrontmatter(src, file) {
  const fm = frontmatter(src);
  if (!fm) return { error: `${file}: no frontmatter` };
  try {
    return { data: asRecord(parseYaml(fm.yaml)) };
  } catch (e) {
    return { error: `${file}: frontmatter is not readable YAML (${e.message})` };
  }
}

export function parseCard(src, file, roles) {
  const r = readFrontmatter(src, file);
  if (r.error) return { issues: [r.error] };
  const data = r.data;
  const issues = [];
  const id = str(data.id);
  const milestone = str(data.milestone);
  const title = str(data.title);
  const name = file.split("/").pop()?.replace(/\.md$/, "") ?? "";
  const folder = file.split("/").slice(-2, -1)[0] ?? "";
  if (!CARD_ID.test(id)) issues.push(`${file}: id "${id}" is not of the form T-M<n>-<nn>`);
  if (id !== name) issues.push(`${file}: file name must equal the id (${id})`);
  if (!MILESTONE_ID.test(milestone) || id.match(CARD_ID)?.[1] !== milestone || folder !== milestone) {
    issues.push(`${file}: milestone "${milestone}" must match the card id and the folder`);
  }
  if (!title) issues.push(`${file}: no title`);
  const size = str(data.size) || undefined;
  const role = str(data.role) || undefined;
  if (role && roles && !roles.includes(role)) issues.push(`${file}: role must be one of ${roles.join(", ")}`);
  const touch = strList(data.touch);
  if (!touch.length) issues.push(`${file}: needs at least one touch entry (files this card may change)`);
  const parts = sections(src);
  const crit = findSection(parts, CRITERIA_HEADINGS);
  const steps = cardSteps(findSection(parts, STEPS_HEADINGS));
  const criteria = crit ? criteriaCommands(crit) : [];
  if (!criteria.length) issues.push(`${file}: the "## ${CRITERIA_HEADINGS[0]}" section needs at least one command`);
  if (issues.length) return { issues };
  // rule 19: too few steps is a plan issue, but the card itself still reads (the rest of the plan stays checkable)
  const stepIssues = size === "L" && steps.length < L_MIN_STEPS ? [`${file}: an L card needs a "## ${STEPS_HEADINGS[0]}" section with at least ${L_MIN_STEPS} numbered steps`] : [];
  return {
    card: {
      id,
      milestone,
      title,
      file,
      spec: strList(data.spec),
      depends: strList(data.depends),
      size,
      role,
      repo: str(data.repo) || ROOT_REPO,
      touch,
      dontTouch: strList(data.dont_touch),
      scenarios: strList(data.scenarios),
      selfFix: str(data.self_fix) || undefined,
      criteria,
      steps,
    },
    issues: stepIssues,
  };
}

export function parseMilestone(src, file) {
  const r = readFrontmatter(src, file);
  if (r.error) return { issues: [r.error] };
  const data = r.data;
  const issues = [];
  const id = str(data.id);
  if (!MILESTONE_ID.test(id) || file.split("/").pop() !== `${id}.md`) issues.push(`${file}: id "${id}" must be M<n> and equal the file name`);
  const status = str(data.status);
  if (!MILESTONE_STATUS.includes(status)) issues.push(`${file}: status must be ${MILESTONE_STATUS.join("/")}`);
  const legacy = {};
  for (const [cid, v] of Object.entries(asRecord(data.done_before_cards))) {
    const rec = asRecord(v);
    const commits = strList(rec.commits);
    if (!CARD_ID.test(cid) || !commits.length || !str(rec.title)) {
      issues.push(`${file}: done_before_cards.${cid} needs commits and title`);
      continue;
    }
    legacy[cid] = { commits, title: str(rec.title) };
  }
  const gates = [];
  for (const g of Array.isArray(data.gates) ? data.gates : []) {
    const rec = asRecord(g);
    if (!str(rec.id) || !str(rec.text)) issues.push(`${file}: every gate needs id and text`);
    else if (str(rec.id) === FULL_SUITE_GATE.id) issues.push(`${file}: gate id "${FULL_SUITE_GATE.id}" is reserved for the extra exit gate (test mode) — rename it`);
    else gates.push({ id: str(rec.id), text: str(rec.text), run: strList(rec.run) });
  }
  const body = new Map();
  for (const [k, lines] of sections(src)) body.set(k, lines.map((l) => l.text).join("\n").trim());
  if (issues.length) return { issues };
  return { milestone: { id, title: str(data.title), status, file, cards: strList(data.cards), sideCards: strList(data.side_cards), legacy, gates, sections: body }, issues };
}

/** The plan as files on disk: `has(rel)` → does the path exist (links followed), `list(rel)` → [{ name, isDirectory }] (empty when the folder is missing; links are left out), `read(rel)` → text. */
export const diskIo = (root) => ({
  has: (rel) => existsSync(join(root, rel)),
  read: (rel) => readFileSync(join(root, rel), "utf8"),
  list: (rel) => (existsSync(join(root, rel)) ? readdirSync(join(root, rel), { withFileTypes: true }).filter((e) => e.isDirectory() || e.isFile()).map((e) => ({ name: e.name, isDirectory: e.isDirectory() })) : []),
});

function listFiles(io, dir, ext, recursive) {
  const out = [];
  for (const e of io.list(dir)) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory && recursive) out.push(...listFiles(io, rel, ext, recursive));
    else if (!e.isDirectory && e.name.endsWith(ext) && !e.name.startsWith("_")) out.push(rel);
  }
  return out.sort();
}

/** `io` (optional) is a read overlay `{ has(rel), read(rel), list(rel) }` — setup uses it to read the plan as it will be after the apply, without writing it. */
export function loadPlan(root, config, io = diskIo(root)) {
  const issues = [];
  const read = (rel) => io.read(rel);
  const roles = roleTable(config).map((r) => r.name);
  const milestones = [];
  for (const f of listFiles(io, MILESTONE_DIR, ".md", false)) {
    const r = parseMilestone(read(f), f);
    issues.push(...r.issues);
    if (r.milestone) milestones.push(r.milestone);
  }
  milestones.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const cards = new Map();
  for (const f of listFiles(io, TASK_DIR, ".md", true)) {
    const r = parseCard(read(f), f, roles);
    issues.push(...r.issues);
    if (r.card) cards.set(r.card.id, r.card);
  }
  const evidence = new Map();
  const gateEvidence = new Map();
  for (const f of listFiles(io, EVIDENCE_DIR, ".json", false)) {
    try {
      const data = JSON.parse(read(f));
      if (data.kind === "milestone") {
        gateEvidence.set(data.id, data);
        if (!Array.isArray(data.verified?.gates)) issues.push(`${f}: gates is not a list — read as no gate results`);
      }
      else evidence.set(data.id, data);
    } catch {
      issues.push(`${f}: JSON is not readable`);
    }
  }
  const friction = io.has(FRICTION_FILE) ? parseFriction(read(FRICTION_FILE)) : { entries: [], issues: [], hasMarker: false };
  const plan = { config, milestones, cards, evidence, gateEvidence, friction, submodules: submodulePaths(root), issues };
  issues.push(...validatePlan(plan), ...friction.issues);
  return plan;
}

const inside = (pattern, dir) => pattern === dir || pattern.startsWith(`${dir}/`);

/** Submodule cards: `repo: <path>` must be a real submodule, touch inside it, and no other submodule. Root cards may not touch submodules. */
export function repoIssues(c, submodules) {
  if (c.repo === ROOT_REPO) {
    const bad = c.touch.filter((t) => submodules.some((s) => inside(t, s)));
    return bad.length ? [`${c.file}: a root card cannot touch a submodule (${bad.join(", ")}) — set repo: <submodule> or split the card`] : [];
  }
  if (!submodules.includes(c.repo)) return [`${c.file}: repo "${c.repo}" is not "." or a submodule (${submodules.join(", ") || "none"})`];
  const issues = [];
  if (!c.touch.some((t) => inside(t, c.repo))) issues.push(`${c.file}: repo: ${c.repo} but no touch entry inside ${c.repo}/`);
  const other = c.touch.filter((t) => submodules.some((s) => s !== c.repo && inside(t, s)));
  if (other.length) issues.push(`${c.file}: one card touches one submodule — ${other.join(", ")} belong to another submodule`);
  return issues;
}

/** Rule 10 of docs/specs/card-sizes.md: M or L; S or no size only in a started milestone or on a card with evidence (counted as M). */
function sizeIssues(plan, c) {
  if (SIZES.includes(c.size)) return [];
  const m = plan.milestones.find((x) => x.id === c.milestone);
  if ((c.size === "S" || !c.size) && (["active", "paused", "done"].includes(m?.status) || plan.evidence.has(c.id))) return [];
  if (c.size === "S") return [`${c.file}: size S is retired — use M or L (docs/specs/card-sizes.md)`];
  return [`${c.file}: ${c.size ? "size must be M or L (bigger than L → split the card)" : "needs size M or L"}`];
}

/** Consistency across files (legacy commit checks need git and live in task.mjs). */
export function validatePlan(plan) {
  const issues = [];
  const ids = new Set(plan.milestones.map((m) => m.id));
  const active = plan.milestones.filter((m) => m.status === "active");
  if (active.length > 1) issues.push(`at most one milestone may be status: active (now: ${active.map((m) => m.id).join(", ")})`);
  const listed = new Map();
  for (const m of plan.milestones) {
    for (const cid of m.cards) {
      if (listed.has(cid)) issues.push(`${m.file}: card ${cid} is listed twice`);
      listed.set(cid, m.id);
      const hasFile = plan.cards.has(cid);
      if (!hasFile && !m.legacy[cid]) issues.push(`${m.file}: card ${cid} has no file in ${TASK_DIR}/${m.id}/`);
      if (hasFile && m.legacy[cid]) issues.push(`${m.file}: card ${cid} has both a card file and done_before_cards`);
    }
    for (const cid of Object.keys(m.legacy)) if (!m.cards.includes(cid)) issues.push(`${m.file}: done_before_cards.${cid} is not in cards`);
  }
  const known = (cid) => plan.cards.has(cid) || plan.milestones.some((m) => m.legacy[cid]);
  for (const c of plan.cards.values()) {
    if (!ids.has(c.milestone)) issues.push(`${c.file}: milestone ${c.milestone} does not exist`);
    else if (listed.get(c.id) !== c.milestone) issues.push(`${c.file}: not listed in cards of ${c.milestone}`);
    for (const d of c.depends) if (!known(d)) issues.push(`${c.file}: depends on a card that does not exist (${d})`);
    issues.push(...repoIssues(c, plan.submodules ?? []), ...sizeIssues(plan, c));
  }
  // side lanes: side_cards ⊆ cards · a side card may only depend on cards that are done or can start themselves
  for (const m of plan.milestones.filter((x) => x.status === "planned")) {
    for (const cid of m.sideCards ?? []) if (!m.cards.includes(cid)) issues.push(`${m.file}: side_cards lists ${cid}, which is not in cards of ${m.id}`);
    if (!sideLanesOn(plan)) continue;
    for (const cid of (m.sideCards ?? []).filter((x) => m.cards.includes(x))) {
      const never = (plan.cards.get(cid)?.depends ?? []).filter((d) => !isDone(cardStatus(plan, d)) && !startableMilestone(plan, d));
      if (never.length) issues.push(`${m.file}: side card ${cid} depends on ${never.join(", ")}, which cannot start (its milestone is not active and it is not a side card)`);
    }
  }
  issues.push(...selfFixIssues(plan));
  for (const id of plan.evidence.keys()) if (!plan.cards.has(id)) issues.push(`${EVIDENCE_DIR}/${id}.json: card ${id} does not exist`);
  for (const id of plan.gateEvidence.keys()) if (!ids.has(id)) issues.push(`${EVIDENCE_DIR}/${id}.json: milestone ${id} does not exist`);
  return issues;
}

// ── status (from evidence only) ──────────────────────────────────────────────

export const isDone = (s) => s === "done" || s === "legacy";

export function cardStatus(plan, id) {
  if (plan.milestones.some((m) => m.legacy[id])) return "legacy";
  return plan.evidence.get(id)?.status ?? "todo";
}

export const activeMilestone = (plan) => plan.milestones.find((m) => m.status === "active");

// ── side lanes ───────────────────────────────────────────────────────────────
// A planned milestone may list `side_cards`: those cards can start, verify and merge while the active milestone runs —
// same card rules (depends · touch · caps · evidence · review), but they only take capacity the active milestone leaves free.

export const sideLanesOn = (plan) => plan.config?.workflow?.sideLanes?.enabled !== false;
export const sideLaneMax = (plan) => plan.config?.workflow?.sideLanes?.max ?? 1;

/** Planned milestones with their side cards (in `cards` order) — only those that have any. */
export function sideTracks(plan) {
  if (!sideLanesOn(plan)) return [];
  return plan.milestones
    .filter((m) => m.status === "planned")
    .map((m) => ({ m, cards: m.cards.filter((id) => (m.sideCards ?? []).includes(id)) }))
    .filter((t) => t.cards.length);
}

export const isSideCard = (plan, id) => sideTracks(plan).some((t) => t.cards.includes(id));

/** Side cards started but not passed. */
export const activeSideCards = (plan) => activeCards(plan).filter((c) => isSideCard(plan, c.id));

/** The card's milestone lets it start: the active milestone, or a side card. */
export function startableMilestone(plan, id) {
  const mid = plan.cards.get(id)?.milestone ?? id.match(CARD_ID)?.[1];
  return plan.milestones.some((m) => m.id === mid && m.status === "active") || isSideCard(plan, id);
}

export function titleOf(plan, id) {
  return plan.cards.get(id)?.title ?? plan.milestones.find((m) => m.legacy[id])?.legacy[id]?.title ?? id;
}

/** Started but not passed (in progress, or verified and failed). */
export function activeCards(plan) {
  return [...plan.cards.values()].filter((c) => {
    const s = cardStatus(plan, c.id);
    return s === "in_progress" || s === "failed";
  });
}

export const unmetDepends = (plan, id) => (plan.cards.get(id)?.depends ?? []).filter((d) => !isDone(cardStatus(plan, d)));

export function nextCards(plan, m, limit = 3) {
  return m.cards.filter((id) => cardStatus(plan, id) === "todo" && !unmetDepends(plan, id).length).slice(0, limit);
}

export const doneCount = (plan, m) => m.cards.filter((id) => isDone(cardStatus(plan, id))).length;

const cmdOf = (plan) => (script, args) => scriptCommand(plan.config.stack.packageManager, script, args);
const T = (plan) => textFor(plan.config.people.docLanguage);

export function nextLine(plan, m, side = false) {
  const t = T(plan);
  const next = nextCards(plan, m);
  if (next.length) return next.map((id) => `${id} ${titleOf(plan, id)}`).join(" · ");
  const waiting = m.cards.filter((id) => cardStatus(plan, id) === "todo").map((id) => t.nextWait(id, unmetDepends(plan, id).join(", ")));
  if (waiting.length) return t.nextWaiting(waiting.join(" · "));
  if (doneCount(plan, m) < m.cards.length) return t.nextOnlyActive;
  return side ? t.sideAllDone : t.nextGate(cmdOf(plan)("task:verify", m.id));
}

export function formatTime(iso, timeZone = "UTC") {
  if (!iso) return "-";
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return f.format(new Date(iso));
}
const timeOf = (plan, iso) => formatTime(iso, plan.config.people.timeZone);

export function verifySummary(plan, ev) {
  const t = T(plan);
  if (!ev) return t.notStarted;
  const v = ev.verified;
  if (!v) return t.startedNotVerified(timeOf(plan, ev.started.at));
  if (v.pass) return t.passed(timeOf(plan, v.at), v.commands.length) + (v.deferred?.length ? t.deferredToGate : "");
  const why = [];
  const failed = v.commands.filter((c) => c.exit !== 0).map((c) => `\`${c.cmd}\``);
  if (failed.length) why.push(t.whyCommands(failed.join(" · ")));
  if (v.files.outside.length) why.push(t.whyOutside(v.files.outside.length));
  if (v.files.forbidden.length) why.push(t.whyForbidden(v.files.forbidden.length));
  if (v.scenarios.missing.length) why.push(t.whyScenarios(v.scenarios.missing.join(", ")));
  return t.failed(timeOf(plan, v.at), why.join(" · "));
}

export function laneTag(plan, id) {
  const ev = plan.evidence.get(id);
  return ev?.lane && ev.status !== "done" ? T(plan).lane(ev.lane, ev.worktree ?? "-") : "";
}

const cell = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The gate results of milestone evidence — a list, `[]` for anything else (hand-made or broken evidence never throws). */
export const gateResults = (gateEvidence) => (Array.isArray(gateEvidence?.verified?.gates) ? gateEvidence.verified.gates.filter((x) => x !== null && typeof x === "object") : []);

/**
 * The ONE place that decides a gate's result word (spec evidence-viewer rule 10) — STATE.md, the mirror, the report and the page use it.
 * `gate.run` = the commands of the gate (declared: its `run`; undeclared: the commands the evidence recorded). `at` (optional) adds the time to "passed".
 */
export function gateWord(t, gate, result, at) {
  if (!Array.isArray(gate?.run) || !gate.run.length) return t.gateManual;
  if (!result || result.pass === null) return t.gateNotRun;
  if (result.pass === true) return at === undefined ? "✓" : t.gatePass(at);
  return t.gateFail;
}

/** Rules 29-30: the gates of the milestone evidence that the milestone file does not declare, in evidence order (no evidence = none). */
export function undeclaredGates(plan, m) {
  const t = T(plan);
  const declared = new Set(m.gates.map((g) => g.id));
  return gateResults(plan.gateEvidence.get(m.id))
    .filter((g) => !declared.has(g.id))
    .map((g) => ({ id: g.id, text: g.id === FULL_SUITE_GATE.id ? t.fullSuiteGate : t.undeclaredGate, pass: g.pass, run: Array.isArray(g.commands) ? g.commands : [], result: g }));
}

/** Heading · in progress · next · card table for `m.cards` (the active milestone, or one milestone's side cards). */
function stateBlock(plan, m, heading, side = false) {
  const t = T(plan);
  const out = [`## ${heading} — ${t.doneCount(doneCount(plan, m), m.cards.length)}`, ""];
  const act = activeCards(plan).filter((x) => m.cards.includes(x.id));
  out.push(`- ${t.doing}: ${act.length ? act.map((x) => `**${x.id}** ${x.title} — ${verifySummary(plan, plan.evidence.get(x.id))}${laneTag(plan, x.id)}`).join(" · ") : t.none}`);
  out.push(`- ${t.next}: ${nextLine(plan, m, side)}`, "");
  out.push(t.table, "|---|---|---|---|");
  for (const id of m.cards) {
    const s = cardStatus(plan, id);
    const card = plan.cards.get(id);
    const ref = card ? `[${id}](${card.file.slice(PLAN_DIR.length + 1)})` : id;
    const ev =
      s === "legacy"
        ? (m.legacy[id]?.commits ?? []).map((x) => `\`${x}\``).join(" · ")
        : plan.evidence.has(id)
          ? `[${id}.json](evidence/${id}.json) · ${verifySummary(plan, plan.evidence.get(id))}`
          : "–";
    out.push(`| ${ref} | ${cell(titleOf(plan, id))} | ${t.status[s]} | ${cell(ev)} |`);
  }
  return out;
}

export function renderState(plan) {
  const t = T(plan);
  const c = cmdOf(plan);
  const out = [t.stateTitle, "", t.stateNote(c), ""];
  const m = activeMilestone(plan);
  if (!m) {
    out.push(t.noActive, "");
  } else {
    out.push(...stateBlock(plan, m, `${m.id} ${m.title}`));
    const extra = undeclaredGates(plan, m);
    if (m.gates.length || extra.length) {
      out.push("", t.gatesTitle(m.id, c("task:verify", m.id)), "", t.gatesTable, "|---|---|---|");
      const results = gateResults(plan.gateEvidence.get(m.id));
      const word = (g, r) => gateWord(t, g, r, r?.pass === true ? timeOf(plan, plan.gateEvidence.get(m.id).verified.at) : undefined);
      for (const g of m.gates) out.push(`| ${g.id} | ${cell(g.text)} | ${word(g, results.find((x) => x.id === g.id))} |`);
      for (const g of extra) out.push(`| ${g.id} | ${cell(g.text)} | ${word(g, g.result)} |`);
    }
    out.push("");
  }
  for (const tr of sideTracks(plan)) out.push(...stateBlock(plan, { ...tr.m, cards: tr.cards }, t.sideHeading(tr.m.id, tr.m.title), true), "");
  const recent = [...plan.evidence.values()]
    .map((e) => ({ e, at: e.verified?.at ?? e.started.at }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.e.id.localeCompare(b.e.id))
    .slice(0, 5);
  out.push(t.recent, "");
  if (!recent.length) out.push(t.nothingYet, "");
  else for (const { e } of recent) out.push(`- ${e.id} ${titleOf(plan, e.id)} — ${verifySummary(plan, e)}`);
  const others = plan.milestones.filter((x) => x !== m);
  if (others.length) {
    out.push("", t.others, "");
    for (const x of others) out.push(`- ${x.id} ${x.title} — ${x.status}`);
  }
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** `.saf/plan.md` — compact mirror of the active milestone (Goal · Scope · Done When · Task List · Risks). */
export function renderMirror(plan) {
  const t = T(plan);
  const c = cmdOf(plan);
  const m = activeMilestone(plan);
  const head = [t.mirrorHead(c("task:state"))];
  if (!m) return `${[...head, t.mirrorIdle, ""].join("\n")}`;
  const out = [...head, `# Plan: ${plan.config.project.name} — ${m.id} ${m.title}`, `Status: ${m.status}`, t.mirrorSource(m.file, c("task:verify", "<id>")), ""];
  const sec = (title, key) => {
    const body = [...m.sections].find(([k]) => MILESTONE_HEADINGS[key].some((h) => k.toLowerCase().startsWith(h.toLowerCase())))?.[1];
    if (body) out.push(`## ${title}`, body, "");
  };
  sec("Goal", "goal");
  sec("Scope", "scope");
  out.push("## Done When");
  const results = gateResults(plan.gateEvidence.get(m.id));
  const line = (g, r) => `- [${gateWord(t, g, r) === "✓" ? "x" : " "}] ${g.id} ${g.text}${g.run.length ? "" : t.manualSuffix}`;
  for (const g of m.gates) out.push(line(g, results.find((x) => x.id === g.id)));
  for (const g of undeclaredGates(plan, m)) out.push(line(g, g.result));
  const tasks = (x, ids) => {
    for (const id of ids) {
      const s = cardStatus(plan, id);
      const note =
        s === "legacy"
          ? t.doneBefore((x.legacy[id]?.commits ?? []).map((y) => `\`${y}\``).join(" · "))
          : s === "todo"
            ? ""
            : ` — ${verifySummary(plan, plan.evidence.get(id))}${laneTag(plan, id)}`;
      out.push(`- [${isDone(s) ? "x" : " "}] ${id} ${titleOf(plan, id)}${note}`);
    }
    out.push("");
  };
  out.push("", "## Task List");
  tasks(m, m.cards);
  for (const tr of sideTracks(plan)) {
    out.push(t.mirrorSide(tr.m.id));
    tasks(tr.m, tr.cards);
  }
  sec("Risks", "risks");
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** Session lines for one card in progress: a lane card → where it lives · a main-folder card → criteria + touch. */
function doingLines(plan, card, laneStatus) {
  const t = T(plan);
  const ev = plan.evidence.get(card.id);
  if (ev?.lane) return [t.sessionLaneCard(card.id, card.title, ev.lane, ev.worktree ?? "-", ev.branch ?? "-", laneStatus(ev), ev.started?.effort?.agent)];
  return [t.sessionCard(card.id, card.title, card.file, verifySummary(plan, ev), ev?.started?.effort?.agent), t.sessionCriteria(card.criteria.join(" · ")), t.sessionTouch(card.touch.join(" · "), card.dontTouch.join(" · "))];
}

/** Text the SessionStart hook injects into every new session (short — the full view is STATE.md). */
export function sessionContext(plan, laneStatus = () => "-") {
  const t = T(plan);
  const c = cmdOf(plan);
  const out = [t.sessionHead(plan.config.project.name)];
  const m = activeMilestone(plan);
  if (!m) {
    out.push(t.sessionNoActive(plan.config.people.ownerTitle));
  } else {
    out.push(t.sessionMilestone(m.id, m.title, doneCount(plan, m), m.cards.length));
    const act = activeCards(plan).filter((x) => x.milestone === m.id);
    if (!act.length) out.push(t.sessionNoCard);
    for (const card of act) out.push(...doingLines(plan, card, laneStatus));
    out.push(t.sessionNext(nextLine(plan, m)));
  }
  for (const tr of sideTracks(plan)) {
    const sm = { ...tr.m, cards: tr.cards };
    const act = activeCards(plan).filter((x) => tr.cards.includes(x.id));
    out.push(t.sessionSide(tr.m.id, doneCount(plan, sm), tr.cards.length, act.length ? act.map((x) => x.id).join(", ") : t.none, nextLine(plan, sm, true)));
    for (const card of act) out.push(...doingLines(plan, card, laneStatus));
  }
  const recent = [...plan.evidence.values()]
    .filter((e) => e.verified)
    .sort((a, b) => (b.verified?.at ?? "").localeCompare(a.verified?.at ?? ""))
    .slice(0, 5);
  if (recent.length) out.push(t.sessionRecent(recent.map((e) => `${e.id} ${e.verified?.pass ? "✓" : "✗"} ${timeOf(plan, e.verified?.at)}`).join(" · ")));
  out.push(t.sessionHow(c("task:start", "<id>"), c("task:verify", "<id>")));
  if (plan.issues.length) out.push(t.sessionIssues(plan.issues.length, c("task:state", "--check")));
  const n = countByStatus(plan.friction?.entries ?? []);
  if (n.open || n.carded) out.push(t.sessionFriction(n.open, n.carded, c("task:friction")));
  return `${out.join("\n")}\n`;
}

export function laneSessionContext(plan, lane) {
  const t = T(plan);
  const card = plan.cards.get(lane.card);
  const out = [t.laneHead(plan.config.project.name, lane.lane, lane.card, card?.title ?? "", lane.branch), t.laneStatus(verifySummary(plan, plan.evidence.get(lane.card)))];
  if (card) {
    out.push(t.laneCardFile(card.file));
    out.push(t.sessionCriteria(card.criteria.join(" · ")).trim());
    out.push(t.sessionTouch(card.touch.join(" · "), card.dontTouch.join(" · ")).trim());
  }
  out.push(t.laneHow(cmdOf(plan)("task:verify", lane.card)));
  if (plan.issues.length) out.push(t.sessionIssues(plan.issues.length, cmdOf(plan)("task:state", "--check")));
  return `${out.join("\n")}\n`;
}

/**
 * Stop hook: a started card has not passed → return text asking to continue.
 * Lets the session end when: nothing open · already reminded this round (stop_hook_active) · background tasks pending.
 */
export function stopGuidance(plan, input, only) {
  if (input.stop_hook_active === true) return null;
  if (Array.isArray(input.background_tasks) && input.background_tasks.length > 0) return null;
  const act = activeCards(plan).filter((c) => (only === undefined ? !plan.evidence.get(c.id)?.lane : c.id === only));
  if (!act.length) return null;
  const t = T(plan);
  return [
    t.stopHead,
    ...act.map((c) => `- ${c.id} ${c.title}: ${verifySummary(plan, plan.evidence.get(c.id))}`),
    t.stopDo(cmdOf(plan)("task:verify", act[0]?.id ?? "<id>")),
    t.stopEnd(plan.config.people.ownerTitle),
  ].join("\n");
}

export const sectionLines = sections;
export { scanLines };
