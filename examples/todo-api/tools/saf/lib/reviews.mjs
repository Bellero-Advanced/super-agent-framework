import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scriptCommand } from "./config.mjs";
import { FRICTION_MARKER, FrictionError, appendEntry } from "./friction.mjs";
import { EVIDENCE_DIR, formatTime, loadPlan } from "./plan.mjs";
import { resolveCommit } from "./git.mjs";
import { TaskError, branchEvidence, laneFolder, reopenCard, writeJson } from "./task.mjs";
import { textFor } from "./text.mjs";

/**
 * Review rounds — docs/specs/review-rounds.md. The spec review is an agent's judgment; the main session records each
 * result here (`task:review`). Rounds are only appended to docs/plan/evidence/reviews/<id>.json. Nothing here commits.
 */

/** Kinds of a failed review: id → what it means (data, shown in usage and errors). */
export const REVIEW_KINDS = {
  "spec-mismatch": "the work differs from the spec or card",
  "missing-test": "a scenario or rule has no real test",
  "out-of-scope": "changes outside the card's outcome",
  docs: "user docs or comments wrong or missing",
  framework: "the bounce comes from a gap in SAF itself",
};
export const REVIEW_LIMITS = { note: 200 };
/** The kind that also writes a friction entry. */
const FRICTION_KIND = "framework";
const RESULTS = ["pass", "fail"];

export const reviewsPath = (id) => `${EVIDENCE_DIR}/reviews/${id}.json`;

/**
 * Rounds from the text of a reviews file. → { ok: true, rounds } or { ok: false, file, why } for a file that cannot be read.
 */
export function parseReviews(text, id) {
  const file = reviewsPath(id);
  try {
    const data = JSON.parse(text);
    const good = data?.id === id && Array.isArray(data.rounds) && data.rounds.every((r, i) => r && r.round === i + 1 && RESULTS.includes(r.result) && Array.isArray(r.kinds));
    return good ? { ok: true, file, rounds: data.rounds } : { ok: false, file, why: "not a list of rounds for this card" };
  } catch {
    return { ok: false, file, why: "JSON is not readable" };
  }
}

/** Rounds of one card from the folder (no file = no rounds). */
export function readReviews(root, id) {
  const abs = join(root, reviewsPath(id));
  return existsSync(abs) ? parseReviews(readFileSync(abs, "utf8"), id) : { ok: true, file: reviewsPath(id), rounds: [] };
}

const kindList = Object.keys(REVIEW_KINDS).join(", ");
const FRICTION_ADD = "add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…>";

/** One line per round (task review <id> with no result). */
export function roundLines(rounds) {
  return rounds.map((r) => `round ${r.round} · ${r.result}${r.kinds.length ? ` (${r.kinds.join(", ")})` : ""} · ${r.at} · commit ${String(r.head).slice(0, 7)}${r.note ? ` · ${r.note}` : ""}`);
}

/** The plan, after the checks every form of the command shares: main folder only, the card exists. */
function mainFolderCard(ctx, id, usage) {
  const plan = loadPlan(ctx.root, ctx.config);
  const lane = laneFolder(ctx.root, plan);
  if (lane) throw new TaskError(`this folder is the worktree of lane ${lane.lane}, card ${lane.card} — task:review runs in the main folder: ${usage} there (the main session runs the reviews)`);
  if (!plan.cards.has(id)) throw new TaskError(`no card ${id} in docs/plan/tasks/`);
  return plan;
}

/** The rounds so far of one card, as printable lines (`task review <id>` without a result). */
export function listRounds(ctx, id) {
  mainFolderCard(ctx, id, scriptCommand(ctx.config.stack.packageManager, "task:review", id));
  const got = readReviews(ctx.root, id);
  if (!got.ok) throw new TaskError(`${got.file}: ${got.why}`);
  return got.rounds.length ? roundLines(got.rounds) : [`no review rounds for ${id} yet`];
}

/**
 * Record one round. `opts`: { kinds: string[], note?: string, area?: string }. Refuses with a TaskError (nothing written)
 * per rules 1-3 and 7 of the spec. Returns { round, friction, worktree } — `friction` is the new friction id or null, `worktree` the lane worktree of an unmerged lane card or null.
 */
export function recordReview(ctx, id, result, opts = {}) {
  const { root, config } = ctx;
  const c = (s, a) => scriptCommand(config.stack.packageManager, s, a);
  const plan = mainFolderCard(ctx, id, c("task:review", `${id} ${result}`));
  if (!RESULTS.includes(result)) throw new TaskError(`the result is pass or fail, not "${result}"`);
  const kinds = [...new Set(opts.kinds ?? [])];
  const note = (opts.note ?? "").trim();
  const area = (opts.area ?? "").trim();
  for (const k of kinds) if (!(k in REVIEW_KINDS)) throw new TaskError(`unknown kind "${k}" — one of ${kindList}`);
  if (result === "pass" && kinds.length) throw new TaskError("a pass takes no --kind");
  if (result === "fail" && !kinds.length) throw new TaskError(`a fail needs at least one --kind (${kindList})`);
  if (/[\r\n]/.test(note)) throw new TaskError("--note must be one line");
  if (note.length > REVIEW_LIMITS.note) throw new TaskError(`--note is ${note.length} characters — at most ${REVIEW_LIMITS.note}`);
  const framework = kinds.includes(FRICTION_KIND);
  if (framework && !area) throw new TaskError("--kind framework also logs a friction entry: --area <where in SAF> is required");
  if (!framework && area) throw new TaskError(`--area is only used with --kind ${FRICTION_KIND}`);

  const ev = plan.evidence.get(id);
  if (!ev) throw new TaskError(`${id} has not started — nothing to review`);
  // a lane card that is not merged yet: its passed verify is the evidence committed on the branch
  const merged = !!ev.lane && ev.status === "done";
  const branch = ev.lane && !merged ? (ev.branch ?? `${config.workflow.branchPrefix}${id}`) : null;
  const seen = branch ? branchEvidence(root, branch, id) : ev;
  const verifyCmd = c("task:verify", id);
  if (!(seen?.status === "done" && seen.verified?.pass)) {
    throw new TaskError(branch ? `the evidence on branch ${branch} has not "passed" — run ${verifyCmd} in ${ev.worktree ?? "its worktree"} and commit the evidence on the card branch first` : `${id} has not passed task:verify (status ${ev.status}) — run ${verifyCmd} first`);
  }
  if (merged && result === "fail") throw new TaskError(`${id} is already merged — a merged card is not reopened: start a follow-up card for what the review found`);
  const head = resolveCommit(root, branch ? `refs/heads/${branch}` : "HEAD");
  if (!head) throw new TaskError(`cannot read the commit that was reviewed (${branch ?? "HEAD"})`);
  const old = readReviews(root, id);
  if (!old.ok) throw new TaskError(`${old.file}: ${old.why} — fix or remove the file by hand, nothing written`);

  const now = (ctx.now?.() ?? new Date()).toISOString();
  const row = { round: old.rounds.length + 1, at: now, result, kinds, note, head, verifyAttempts: seen.attempts, verifyAt: seen.verified.at };
  let friction = null;
  if (framework) {
    // first: it is the only step that can refuse on the text of the fields
    const text = textFor(config.people.docLanguage);
    try {
      friction = appendEntry(
        root,
        { kind: "review-bounce", area, card: id, summary: `the spec review of ${id} bounced on a gap in SAF`, evidence: `review round ${row.round} of ${id}${note ? `: ${note}` : ""}` },
        { today: formatTime(now, config.people.timeZone).slice(0, 10), cards: (x) => plan.cards.has(x), header: text.frictionHeader(FRICTION_MARKER, c("task:friction", FRICTION_ADD)) },
      );
    } catch (e) {
      if (!(e instanceof FrictionError)) throw e;
      throw new TaskError(`${e.message} — nothing written`);
    }
  }
  writeJson(root, reviewsPath(id), { id, rounds: [...old.rounds, row] });
  if (result === "fail" && !ev.lane) reopenCard(ctx, id, row.round);
  return { round: row.round, friction, worktree: branch ? (ev.worktree ?? null) : null };
}
