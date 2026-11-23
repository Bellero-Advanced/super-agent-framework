import { posix } from "node:path";
import { SPEC_DIR } from "./plan.mjs";
import { findSection, sections } from "./markdown.mjs";
import { findScenarioTests } from "./scenarios.mjs";

/**
 * Scenario ↔ test matrix — spec:matrix.
 *
 * Scenario = a table row under the "Acceptance scenarios" heading of docs/specs/*.md whose first cell is an id
 * like AUTH-AC-03 (templates `_*.md` and README.md are not specs).
 * Test = a test whose name contains the id (same finder as task:verify).
 * A scenario without a test is a gap; gaps fail only in --check mode and only for scenarios a started card names.
 */

export const SCENARIO_ID = /^[A-Z][A-Z0-9]*-AC-\d{2,3}$/;
export const ACCEPTANCE_HEADINGS = ["Acceptance", "ฉากยอมรับ"];
const SEPARATOR_ROW = /^\|[\s:|-]+\|?\s*$/;

export function isSpecFile(f) {
  if (!f.startsWith(SPEC_DIR) || !f.endsWith(".md") || f.slice(SPEC_DIR.length).includes("/")) return false;
  const name = posix.basename(f);
  return !name.startsWith("_") && name !== "README.md";
}

const firstCell = (row) => (row.split("|")[1] ?? "").trim().replace(/^[`*]+|[`*]+$/g, "");

export function parseSpecScenarios(src, file) {
  const issues = [];
  const scenarios = [];
  const lines = findSection(sections(src), ACCEPTANCE_HEADINGS) ?? [...sections(src)].find(([t]) => ACCEPTANCE_HEADINGS.some((h) => t.includes(h)))?.[1];
  if (!lines) return { scenarios, issues: [{ file, message: `no "## Acceptance scenarios" heading (see docs/specs/_template.md)` }] };
  let inTable = false;
  for (const l of lines) {
    const row = !l.inFence && l.text.trimStart().startsWith("|") ? l.text.trim() : null;
    if (!row) {
      inTable = false;
      continue;
    }
    const header = !inTable;
    inTable = true;
    if (header || SEPARATOR_ROW.test(row)) continue;
    const c = firstCell(row);
    if (SCENARIO_ID.test(c)) scenarios.push({ id: c, spec: file, line: l.n });
    else issues.push({ file, line: l.n, message: `rows of the acceptance table must start with an id like <AREA>-AC-<nn> (got "${c}")` });
  }
  if (!scenarios.length && !issues.length) issues.push({ file, message: "the acceptance section has no scenario — use a table | id | when | given | then | test layer |" });
  return { scenarios, issues };
}

export function buildMatrix(input) {
  const issues = [];
  const specs = input.files.filter(isSpecFile).sort();
  const rows = [];
  const byId = new Map();
  for (const spec of specs) {
    const r = parseSpecScenarios(input.read(spec), spec);
    issues.push(...r.issues);
    for (const s of r.scenarios) {
      const first = byId.get(s.id);
      if (first) {
        issues.push({ file: s.spec, line: s.line, message: `id ${s.id} duplicates ${first.spec}:${first.line} — scenario ids are unique across the folder` });
        continue;
      }
      const row = { ...s, tests: [], cards: [] };
      byId.set(s.id, row);
      rows.push(row);
    }
  }
  const hits = findScenarioTests(input.files, input.read, [...byId.keys()]);
  for (const row of rows) row.tests = hits.get(row.id) ?? [];
  for (const card of [...input.cards].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const id of card.scenarios.filter((s) => SCENARIO_ID.test(s))) {
      const row = byId.get(id);
      if (row) row.cards.push({ id: card.id, status: input.status(card.id) });
      else issues.push({ file: card.file, message: `scenarios: names ${id} but no spec in ${SPEC_DIR} declares it` });
    }
  }
  return { specs, rows, issues };
}

export const gaps = (m) => m.rows.filter((r) => !r.tests.length);
export const blockingGaps = (m) => gaps(m).filter((r) => r.cards.some((c) => c.status !== "todo"));

export function completeGaps(m, names) {
  const specOf = (n) => `${SPEC_DIR}${n}.md`;
  const unknown = names.filter((n) => !m.specs.includes(specOf(n)));
  const wanted = new Set(names.map(specOf));
  return { unknown, missing: gaps(m).filter((r) => wanted.has(r.spec)) };
}

const STATUS_TEXT = { todo: "not started", in_progress: "in progress", failed: "failed", done: "done", legacy: "done" };
const cell = (s) => s.replace(/\|/g, "\\|");

export function renderMatrix(m) {
  const out = ["| Scenario | Spec | Cards | Test | Status |", "|---|---|---|---|---|"];
  const blocking = new Set(blockingGaps(m).map((r) => r.id));
  for (const r of m.rows) {
    const spec = `${posix.basename(r.spec, ".md")}:${r.line}`;
    const cards = r.cards.map((c) => `${c.id} (${STATUS_TEXT[c.status]})`).join(" · ") || "—";
    const test = r.tests.length ? `${r.tests[0].file}${r.tests.length > 1 ? ` +${r.tests.length - 1}` : ""}` : "—";
    const status = r.tests.length ? `✓ ${r.tests.length} test(s)` : blocking.has(r.id) ? "✗ gap (card started)" : "✗ gap";
    out.push(`| ${r.id} | ${cell(spec)} | ${cell(cards)} | ${cell(test)} | ${status} |`);
  }
  return out.join("\n");
}

export function summarize(m) {
  const g = gaps(m).length;
  return `${m.rows.length} scenario(s) in ${m.specs.length} spec(s) · with test ${m.rows.length - g} · gaps ${g} · gaps of started cards ${blockingGaps(m).length}`;
}
