import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize, sep } from "node:path";
import { CONFIG_FILE, LOCAL_CONFIG_FILE, scriptCommand } from "./config.mjs";
import {
  changedSince,
  commitSubject,
  conflictedFiles,
  currentBranch,
  diffNames,
  dirtySnapshot,
  fileHash,
  gitWrite,
  isAncestor,
  isDir,
  isMainFolder,
  lastCommitOf,
  lineStats,
  listRepoFiles,
  mainWorktreeHead,
  mergeBase,
  mergeInProgress,
  resolveCommit,
  revList,
  samePath,
  showFile,
  submoduleReady,
  topLevel,
} from "./git.mjs";
import { globToRegExp, toGlob } from "./glob.mjs";
import { laneOf, pickParallel } from "./parallel.mjs";
import {
  EVIDENCE_DIR,
  MILESTONE_DIR,
  MIRROR_FILE,
  PLAN_DIR,
  ROOT_REPO,
  STATE_FILE,
  TASK_DIR,
  activeCards,
  activeMilestone,
  activeSideCards,
  isSideCard,
  sideLaneMax,
  alwaysAllowed,
  cardStatus,
  doneCount,
  isDone,
  laneSessionContext,
  loadPlan,
  renderMirror,
  renderState,
  sessionContext,
  stopGuidance,
  verifySummary,
} from "./plan.mjs";
import { IS_WINDOWS, RUN_LIMITS, quoteWindowsArg } from "./run.mjs";
import { findScenarioTests, isTestFile } from "./scenarios.mjs";
import { defersAtVerify, gatesWithFullSuite, isFullSuite, mergeChecksFor, targetedCommand, targetedFiles } from "./testmode.mjs";
import { textFor } from "./text.mjs";

/**
 * The work behind `task:*`. Kept apart from the CLI so tests can call it on temporary repos.
 *
 * A card becomes "done" only when verifyCard passes all three: every criteria command exits 0 ·
 * every changed file is inside `touch` and none is in `dont_touch` · every scenario the card names has a test.
 */

export class TaskError extends Error {}
/** Lane card started (evidence committed) but steps 3–5 failed → exit 6 · continue with --resume. */
export class StartIncomplete extends TaskError {
  exitCode = 6;
}
/** task:merge: 3 refused before merging · 4 conflict · 5 merge checks failed. HEAD never moves on non-zero. */
export class MergeStop extends TaskError {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

export const LANE_FILE = ".saf-lane.json";
export const STOP_HOOK_ENV = "SAF_STOP_HOOK";
export const evidencePath = (id) => `${EVIDENCE_DIR}/${id}.json`;
export const isPlanFile = (f) => f.startsWith(`${MILESTONE_DIR}/`) || f.startsWith(`${TASK_DIR}/`) || f.startsWith(`${EVIDENCE_DIR}/`) || f === STATE_FILE || f === MIRROR_FILE;

const nowIso = (ctx) => (ctx.now?.() ?? new Date()).toISOString();
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const errText = (e) => (e instanceof Error ? e.message : String(e)).trim().split("\n")[0];
const cmd = (config, script, args) => scriptCommand(config.stack.packageManager, script, args);
const list = (xs) => (xs.length > 8 ? [...xs.slice(0, 8), `… ${xs.length - 8} more`] : xs).join(" · ");

export function writeJson(root, rel, data) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), `${JSON.stringify(data, null, 2)}\n`);
}

const readOrNull = (root, rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
/** Generated files compare equal across line-ending conversions (a CRLF checkout on Windows is not "stale"). */
const sameText = (a, b) => a !== null && b !== null && a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

// ── generated files ─────────────────────────────────────────────────────────

export const generatedFiles = (plan) => [
  [STATE_FILE, renderState(plan)],
  [MIRROR_FILE, renderMirror(plan)],
];

export const staleGenerated = (root, plan) =>
  generatedFiles(plan)
    .filter(([rel, content]) => !sameText(readOrNull(root, rel), content))
    .map(([rel]) => rel);

export function writeGenerated(root, plan) {
  const changed = [];
  for (const [rel, content] of generatedFiles(plan)) {
    if (sameText(readOrNull(root, rel), content)) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
    changed.push(rel);
  }
  return changed;
}

/** Cards done before SAF: every referenced commit exists and its subject contains the card id. */
export function legacyIssues(root, plan) {
  const issues = [];
  for (const m of plan.milestones) {
    for (const [id, done] of Object.entries(m.legacy)) {
      for (const c of done.commits) {
        const subject = commitSubject(root, c);
        if (subject === null) issues.push(`${m.file}: ${id} references commit ${c} which is not in the repo`);
        else if (!subject.includes(id)) issues.push(`${m.file}: ${id} references commit ${c} whose subject does not contain ${id} ("${subject}")`);
      }
    }
  }
  return issues;
}

export function stateCheck(ctx) {
  const plan = loadPlan(ctx.root, ctx.config);
  const stale = laneFolder(ctx.root, plan) ? [] : staleGenerated(ctx.root, plan);
  return { issues: [...plan.issues, ...legacyIssues(ctx.root, plan)], stale };
}

export function requireValid(plan) {
  if (plan.issues.length) throw new TaskError(["the plan has problems — fix them first:", ...plan.issues.map((i) => `  ✗ ${i}`)].join("\n"));
}

export function requireCard(plan, id) {
  const card = plan.cards.get(id);
  if (card) return card;
  if (cardStatus(plan, id) === "legacy") throw new TaskError(`${id} was done before cards existed (see done_before_cards in the milestone file)`);
  throw new TaskError(`no card ${id} in ${TASK_DIR}/`);
}

// ── lanes (separate worktrees) ──────────────────────────────────────────────

/**
 * The lane this folder belongs to, or null for the main folder. A lane folder has a lane label that matches
 * the evidence on its branch. A worktree that looks like a lane but lost its label is refused (never guessed as main).
 */
export function laneFolder(root, plan) {
  const wtDir = plan.config.workflow.worktreeDir;
  const prefix = plan.config.workflow.branchPrefix;
  const abs = join(root, LANE_FILE);
  if (!existsSync(abs)) {
    const open = (e) => !!e?.lane && e.status !== "done";
    const branch = currentBranch(root);
    const owner = [...plan.evidence.values()].find((e) => open(e) && e.branch === branch);
    const here = basename(root);
    const atPath = normalize(dirname(root)).endsWith(normalize(wtDir)) && open(plan.evidence.get(here)) ? here : undefined;
    // a lane is guessed from the branch name only for the top level of a linked worktree — a SAF project in a subfolder is not a lane
    const linked = !isMainFolder(root) && samePath(topLevel(root), root);
    const id = owner?.id ?? atPath ?? (linked && branch?.startsWith(prefix) ? branch.slice(prefix.length) : undefined);
    if (!id || (owner && !linked && !atPath)) return null;
    throw new TaskError(`no lane label ${LANE_FILE} but this is the worktree of lane card ${id} (branch ${branch ?? "detached"}) — every command is refused here · recover: in the main folder run ${cmd(plan.config, "task:start", `${id} --worktree --resume`)}`);
  }
  let tag = {};
  try {
    tag = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    // unreadable = mismatch
  }
  const card = typeof tag.card === "string" ? tag.card : "?";
  const ev = plan.evidence.get(card);
  const branch = currentBranch(root);
  const why = [
    isMainFolder(root) ? "the lane label is in the main folder" : "",
    !ev ? `no evidence for ${card} on this branch` : "",
    ev && ev.lane !== tag.lane ? `lane in label (${tag.lane}) ≠ evidence (${ev.lane ?? "-"})` : "",
    ev && ev.branch !== branch ? `checked-out branch (${branch ?? "detached"}) ≠ evidence (${ev.branch ?? "-"})` : "",
  ].filter(Boolean);
  if (why.length || !ev?.lane || !branch) throw new TaskError(`lane label ${LANE_FILE} does not match the evidence on this branch — every command is refused here: ${why.join(" · ")}`);
  return { card, lane: ev.lane, branch };
}

const laneLabel = (l) => `this folder is the worktree of lane ${l.lane}, card ${l.card}`;

export function refuseInLane(ctx, what) {
  const l = laneFolder(ctx.root, loadPlan(ctx.root, ctx.config));
  if (l) throw new TaskError(`${laneLabel(l)} — ${what} runs in the main folder · here only ${cmd(ctx.config, "task:verify", l.card)} works`);
}

function freeLane(ctx, plan) {
  const used = new Set(activeCards(plan).map((c) => plan.evidence.get(c.id)?.lane));
  const dir = join(ctx.root, ctx.config.workflow.worktreeDir);
  for (const d of isDir(dir) ? readdirSync(dir) : []) {
    try {
      used.add(JSON.parse(readFileSync(join(dir, d, LANE_FILE), "utf8")).lane);
    } catch {
      // no label = no reserved number
    }
  }
  for (let n = 1; n <= ctx.config.workflow.lanes.code; n++) if (!used.has(n)) return n;
  return null;
}

/** Parallel-set check for one card: touch overlap · lane caps · solo paths — ok = null. */
function parallelBlock(plan, id) {
  const card = plan.cards.get(id);
  const m = plan.milestones.find((x) => x.id === card?.milestone);
  if (!card || !m) return null;
  const evidence = new Map(plan.evidence);
  evidence.delete(id);
  // a side card starts only in capacity the active milestone leaves free: walk the active milestone's startable cards first
  const walk = isSideCard(plan, id) ? { id: "side", cards: [...(activeMilestone(plan)?.cards ?? []), id] } : { ...m, cards: [id] };
  const r = pickParallel({ ...plan, evidence }, walk);
  const all = [...r.parallel.code, ...r.parallel.main];
  return all.includes(id) ? null : (r.skipped[0]?.reason ?? r.blocked ?? "not allowed by the parallel rules");
}

/** Write evidence + regenerate state files, then commit just these files. On failure, restore every byte. */
function commitPlanFiles(ctx, id, message, write) {
  const root = ctx.root;
  const files = [evidencePath(id), STATE_FILE, MIRROR_FILE];
  const saved = files.map((f) => readOrNull(root, f));
  try {
    write();
    writeGenerated(root, loadPlan(root, ctx.config));
    gitWrite(root, ["add", "--", ...files.filter((f) => existsSync(join(root, f)) || showFile(root, "HEAD", f) !== null)]);
    gitWrite(root, ["commit", "--only", "-m", message, "--", ...files]);
  } catch (e) {
    files.forEach((f, i) => {
      if (saved[i] === null) rmSync(join(root, f), { force: true });
      else writeFileSync(join(root, f), saved[i]);
    });
    for (const f of files) {
      try {
        gitWrite(root, ["add", "--", f]);
      } catch {
        // never indexed
      }
    }
    throw e;
  }
}

function openLane(ctx, plan, card) {
  const root = ctx.root;
  const { worktreeDir, branchPrefix } = ctx.config.workflow;
  const id = card.id;
  if (!isMainFolder(root)) throw new TaskError("--worktree runs in the main folder only");
  const pending = changedSince(root, "HEAD").filter(isPlanFile);
  if (pending.length) throw new TaskError(`plan files are not committed — commit them before opening a lane: ${list(pending)}`);
  const branch = `${branchPrefix}${id}`;
  const worktree = `${worktreeDir}/${id}`;
  if (resolveCommit(root, `refs/heads/${branch}`)) throw new TaskError(`branch ${branch} already exists`);
  if (existsSync(join(root, worktree))) throw new TaskError(`folder ${worktree} already exists`);
  const lane = freeLane(ctx, plan);
  if (!lane) throw new TaskError(`no free lane number (1–${ctx.config.workflow.lanes.code}) — see the folders under ${worktreeDir}/`);
  const head = resolveCommit(root, "HEAD");
  if (!head) throw new TaskError("the repo has no commit yet");
  try {
    gitWrite(root, ["worktree", "add", "-b", branch, worktree, head]); // step 1
  } catch (e) {
    throw new TaskError(`step 1: creating the worktree failed (nothing changed): ${errText(e)}`);
  }
  const ev = { id, milestone: card.milestone, status: "in_progress", started: { at: nowIso(ctx), base: head, dirty: {} }, attempts: 0, lane, branch, worktree };
  try {
    commitPlanFiles(ctx, id, `chore(plan): start ${id} lane ${lane} (task:start --worktree)`, () => writeJson(root, evidencePath(id), ev)); // step 2
  } catch (e) {
    try {
      gitWrite(root, ["worktree", "remove", "--force", worktree]);
      gitWrite(root, ["branch", "-D", branch]);
    } catch (undo) {
      throw new TaskError(`step 2: committing evidence failed (${errText(e)}) and undo was incomplete: ${errText(undo)} — check ${worktree} and branch ${branch}`);
    }
    throw new TaskError(`step 2: committing evidence failed — undone (no branch · no worktree · no changed files): ${errText(e)}`);
  }
  finishLane(ctx, ev);
  return ev;
}

/** Steps 3–5 — repeatable, no extra commits, never overwrite work in the worktree. */
function finishLane(ctx, ev) {
  const root = ctx.root;
  const dir = join(root, ev.worktree);
  let step = 3;
  try {
    const commit = lastCommitOf(root, evidencePath(ev.id));
    if (!commit) throw new Error("no commit of the evidence in the main folder");
    if (!isAncestor(dir, commit, "HEAD")) gitWrite(dir, ["merge", "--ff-only", commit]);
    step = 4;
    if (!existsSync(join(dir, LANE_FILE))) writeFileSync(join(dir, LANE_FILE), `${JSON.stringify({ card: ev.id, lane: ev.lane })}\n`);
    step = 5;
    const install = ctx.install === undefined ? ctx.config.workflow.laneInstall : ctx.install;
    if (install) {
      const r = ctx.runSync ? ctx.runSync(install, dir) : null;
      if (r && r !== 0) throw new Error(`${install} exited ${r}`);
    }
  } catch (e) {
    throw new StartIncomplete(`${ev.id} started (evidence committed · lane ${ev.lane}) but step ${step} failed: ${errText(e)} — fix it, then run ${cmd(ctx.config, "task:start", `${ev.id} --worktree --resume`)}`);
  }
}

function resumeLane(ctx, id) {
  if (!isMainFolder(ctx.root)) throw new TaskError("--worktree runs in the main folder only");
  const plan = loadPlan(ctx.root, ctx.config);
  requireValid(plan);
  requireCard(plan, id);
  const ev = plan.evidence.get(id);
  if (!ev?.lane || !ev.branch || !ev.worktree || ev.status === "done") throw new TaskError(`${id} is not a started, unfinished lane card — --resume is for a --worktree start that failed at steps 3–5`);
  if (!existsSync(join(ctx.root, ev.worktree))) {
    if (resolveCommit(ctx.root, `refs/heads/${ev.branch}`)) {
      throw new TaskError(`branch ${ev.branch} exists but folder ${ev.worktree} does not — open it yourself (git worktree add ${ev.worktree} ${ev.branch}) and --resume again, or ${cmd(ctx.config, "task:abandon", id)}`);
    }
    gitWrite(ctx.root, ["worktree", "add", "-b", ev.branch, ev.worktree, ev.started.base]);
  }
  finishLane(ctx, ev);
  return ev;
}

// ── start / abandon ─────────────────────────────────────────────────────────

/**
 * @param {{base?:string, restart?:boolean, worktree?:boolean, resume?:boolean}} opts
 */
export function startCard(ctx, id, opts = {}) {
  refuseInLane(ctx, "task:start");
  if (opts.resume && !opts.worktree) throw new TaskError("--resume only works with --worktree");
  if (opts.worktree && opts.base) throw new TaskError("--worktree cannot be combined with --base (a lane starts at the main folder's HEAD)");
  if (opts.worktree && !ctx.config.workflow.worktrees) throw new TaskError("worktree lanes are turned off in saf.config.json (workflow.worktrees)");
  if (opts.resume) return resumeLane(ctx, id);
  const plan = loadPlan(ctx.root, ctx.config);
  requireValid(plan);
  const card = requireCard(plan, id);
  const m = plan.milestones.find((x) => x.id === card.milestone);
  const side = m?.status !== "active" && isSideCard(plan, id);
  if (m?.status !== "active" && !side) {
    const hint = m?.status === "planned" ? ` and ${id} is not in its side_cards` : "";
    throw new TaskError(`${id} belongs to ${card.milestone}, which is not status: active${hint} — only cards of the active milestone or side cards can start`);
  }
  if (side && !opts.restart) {
    const running = activeSideCards(plan).filter((c) => c.id !== id);
    if (running.length >= sideLaneMax(plan)) throw new TaskError(`side lanes are full (${sideLaneMax(plan)} at a time${ctx.config.workflow.localKeys?.includes("workflow.sideLanes.max") ? `, this machine: ${LOCAL_CONFIG_FILE}` : ""}): ${running.map((c) => c.id).join(", ")} in progress — pass or abandon it first`);
  }
  const status = cardStatus(plan, id);
  if (status !== "todo" && !opts.restart) {
    throw new TaskError(
      status === "done"
        ? `${id} already passed — use --restart to do it again`
        : `${id} already started (${verifySummary(plan, plan.evidence.get(id))}) — continue and run ${cmd(ctx.config, "task:verify", id)} · start counting again with --restart`,
    );
  }
  const prev = plan.evidence.get(id);
  if (prev?.lane && prev.status !== "done" && !opts.worktree) throw new TaskError(`${id} is a lane ${prev.lane} card (worktree ${prev.worktree ?? "-"}) — verify it in that worktree`);
  const unmet = card.depends.filter((d) => !isDone(cardStatus(plan, d)));
  if (unmet.length) throw new TaskError(`${id} waits for ${unmet.join(", ")} to pass`);
  const others = opts.worktree ? [] : activeCards(plan).filter((c) => c.id !== id && !plan.evidence.get(c.id)?.lane && c.repo === card.repo);
  if (others.length) {
    throw new TaskError(`card ${others.map((c) => c.id).join(", ")} started but has not passed — pass it or ${cmd(ctx.config, "task:abandon", "<id>")} first (one folder works one card at a time, otherwise files cannot be attributed)`);
  }
  if (opts.worktree && (laneOf(plan, card) !== "code" || card.repo !== ROOT_REPO)) throw new TaskError(`--worktree is for code-lane cards of the root repo only (${id} role: ${card.role || "-"}, repo: ${card.repo})`);
  const block = parallelBlock(plan, id);
  if (block) throw new TaskError(`${id} cannot start next to the cards in progress — ${block}`);
  if (opts.worktree) return openLane(ctx, plan, card);
  let base;
  let dirty;
  if (opts.base) {
    base = resolveCommit(ctx.root, opts.base);
    if (!base) throw new TaskError(`no commit "${opts.base}"`);
    dirty = {};
  } else {
    base = resolveCommit(ctx.root, "HEAD");
    if (!base) throw new TaskError("the repo has no commit yet — commit first (git add -A && git commit)");
    dirty = dirtySnapshot(ctx.root);
  }
  const ev = { id, milestone: card.milestone, status: "in_progress", started: { at: nowIso(ctx), base, dirty }, attempts: 0 };
  if (card.repo !== ROOT_REPO) {
    const sub = join(ctx.root, card.repo);
    if (!submoduleReady(ctx.root, card.repo)) throw new TaskError(`submodule ${card.repo} is not checked out (git submodule update --init ${card.repo})`);
    const repoBase = resolveCommit(sub, "HEAD");
    if (!repoBase) throw new TaskError(`submodule ${card.repo} has no commit`);
    ev.started.repoBase = repoBase;
    ev.started.repoDirty = dirtySnapshot(sub);
  }
  writeJson(ctx.root, evidencePath(id), ev);
  writeGenerated(ctx.root, loadPlan(ctx.root, ctx.config));
  return ev;
}

/** Give up an unfinished card (evidence removed → "not started"). Lane worktree and branch are kept for a human to decide. */
export function abandonCard(ctx, id) {
  refuseInLane(ctx, "task:abandon");
  const plan = loadPlan(ctx.root, ctx.config);
  requireCard(plan, id);
  const status = cardStatus(plan, id);
  if (status === "todo") throw new TaskError(`${id} has not started`);
  if (status === "done") throw new TaskError(`${id} already passed — cannot abandon (use ${cmd(ctx.config, "task:start", `${id} --restart`)} to redo it)`);
  const ev = plan.evidence.get(id);
  if (!ev?.lane) {
    rmSync(join(ctx.root, evidencePath(id)));
    writeGenerated(ctx.root, loadPlan(ctx.root, ctx.config));
    return null;
  }
  const pending = changedSince(ctx.root, "HEAD").filter(isPlanFile);
  if (pending.length) throw new TaskError(`plan files are not committed — commit before abandoning a lane: ${list(pending)}`);
  const branch = ev.branch ?? `${ctx.config.workflow.branchPrefix}${id}`;
  const worktree = ev.worktree ?? `${ctx.config.workflow.worktreeDir}/${id}`;
  try {
    commitPlanFiles(ctx, id, `chore(plan): abandon ${id} lane ${ev.lane} (task:abandon)`, () => rmSync(join(ctx.root, evidencePath(id))));
  } catch (e) {
    throw new TaskError(`committing the abandon failed — files restored: ${errText(e)}`);
  }
  const unmerged = resolveCommit(ctx.root, `refs/heads/${branch}`) ? revList(ctx.root, [`HEAD..refs/heads/${branch}`]).length : null;
  return { lane: ev.lane, worktree, branch, worktreeExists: existsSync(join(ctx.root, worktree)), unmerged };
}

// ── verify ──────────────────────────────────────────────────────────────────

/** Files the card really changed, compared with touch / dont_touch. */
export function cardFiles(ctx, card, ev, filesBase = ev.started.base) {
  const root = ctx.root;
  const allowed = [...alwaysAllowed(ctx.config), card.file].map((g) => globToRegExp(g));
  const touch = card.touch.map((g) => globToRegExp(toGlob(g)));
  const dont = card.dontTouch.map((g) => globToRegExp(toGlob(g)));
  const hashes = {};
  const changed = [];
  const consider = (f, hash, before) => {
    if (allowed.some((re) => re.test(f))) return;
    if (before === hash) return; // dirty before the card started and untouched since → not this card's
    changed.push(f);
    hashes[f] = hash;
  };
  for (const f of changedSince(root, filesBase)) consider(f, fileHash(root, f), ev.started.dirty[f]);
  if (card.repo !== ROOT_REPO && ev.started.repoBase && submoduleReady(root, card.repo)) {
    const sub = join(root, card.repo);
    for (const f of changedSince(sub, ev.started.repoBase)) consider(`${card.repo}/${f}`, fileHash(sub, f), ev.started.repoDirty?.[f]);
  }
  changed.sort();
  return {
    changed,
    outside: changed.filter((f) => !touch.some((re) => re.test(f))),
    forbidden: changed.filter((f) => dont.some((re) => re.test(f))),
    hashes,
  };
}

/** Paths that count as test files for the size cap, besides the test-file names scenarios.mjs knows (data, not logic). */
const TEST_DIR = /(?:^|\/)(?:tests?|__tests__)\//;
const isTestPath = (f) => isTestFile(f) || TEST_DIR.test(f);

/** Changed lines (added + removed) of the card's files, code and test apart, against the caps of its size in the config. */
export function cardSize(ctx, card, files, filesBase) {
  const stats = lineStats(ctx.root, filesBase, files.changed);
  let code = 0;
  let test = 0;
  for (const f of files.changed) {
    if (isTestPath(f)) test += stats[f] ?? 0;
    else code += stats[f] ?? 0;
  }
  const size = card.size ?? null;
  const cap = { code: ctx.config.workflow.sizes?.[size] ?? null, test: ctx.config.workflow.testCaps?.[size] ?? null };
  const over = ["code", "test"].filter((k) => cap[k] !== null && { code, test }[k] > cap[k]);
  return { size, code: { lines: code, cap: cap.code }, test: { lines: test, cap: cap.test }, over };
}

const sizeWarning = (id, s) => `  ⚠ ${id} is over the size cap (${s.size}): ${s.over.map((k) => `${k} ${s[k].lines} > ${s[k].cap}`).join(" · ")} changed lines — not a failure, the reviewer decides (or the designer splits the card)`;

export function cardScenarios(root, ids) {
  if (!ids.length) return { required: [], missing: [] };
  const files = listRepoFiles(root).filter(isTestFile);
  const hits = findScenarioTests(files, (f) => readFileSync(join(root, f), "utf8"), ids);
  return { required: ids, missing: ids.filter((id) => !hits.get(id)?.length) };
}

async function runAll(ctx, cmds) {
  const out = [];
  for (const c of cmds) {
    ctx.log?.(`▶ ${c}`);
    const r = await ctx.run(c);
    if (r.exit === 0) ctx.log?.(`  ✓ passed (${seconds(r.ms)})`);
    else ctx.log?.([`  ✗ exit ${r.exit} (${seconds(r.ms)})`, ...r.tail.map((l) => `    │ ${l}`)].join("\n"));
    out.push(r);
  }
  return out;
}

/** Base to count lane files from: started.base, or — after main was merged into the lane — the merge base with main. */
export function laneFilesBase(root, ev) {
  if (!isAncestor(root, ev.started.base, "HEAD")) throw new TaskError(`started.base is not an ancestor of the lane HEAD — abandon the lane and open a new one`);
  const main = mainWorktreeHead(root);
  if (!main) return ev.started.base;
  const mb = mergeBase(root, "HEAD", main);
  if (mb && mb !== ev.started.base && isAncestor(root, ev.started.base, mb)) return mb;
  return ev.started.base;
}

/**
 * Which commands verify runs (spec test-mode rules 9-14): full-suite criteria are replaced by one targeted run when the
 * mode defers them and a targeted run is possible; otherwise every criterion runs and `targeted.fallback` says why.
 */
function planVerifyRun(ctx, card, ev, filesBase, inLane) {
  const full = card.criteria.filter((c) => isFullSuite(ctx.config, c));
  if (!full.length || !defersAtVerify(ctx.config, inLane)) return { run: card.criteria, deferred: [], targeted: null };
  // files are listed before the run, so the selection uses the card's real changes
  const files = targetedFiles(ctx.root, card, cardFiles(ctx, card, ev, filesBase).changed);
  const command = targetedCommand(ctx.config, files);
  if (!command) return { run: card.criteria, deferred: [], targeted: { fallback: files.length ? "no stack.commands.testFiles command" : "no targeted test files" } };
  return { run: [...card.criteria.filter((c) => !full.includes(c)), command], deferred: full, targeted: { files } };
}

export async function verifyCard(ctx, id) {
  const plan = loadPlan(ctx.root, ctx.config);
  const lane = laneFolder(ctx.root, plan);
  if (lane && id !== lane.card) throw new TaskError(`${laneLabel(lane)} — verify ${id} in the main folder · here only ${cmd(ctx.config, "task:verify", lane.card)} works`);
  requireValid(plan);
  const card = requireCard(plan, id);
  const ev = plan.evidence.get(id);
  if (!ev) throw new TaskError(`${id} has not started — run ${cmd(ctx.config, "task:start", id)} first (the start commit is needed to compare files)`);
  if (!lane && ev.lane && ev.status !== "done") throw new TaskError(`${id} is a lane ${ev.lane} card — verify it in its worktree: cd ${ev.worktree ?? "-"} && ${cmd(ctx.config, "task:verify", id)}`);
  if (ev.status === "done" && !lane) throw new TaskError(`${id} already passed (${verifySummary(plan, ev)}) — to check again start counting anew: ${cmd(ctx.config, "task:start", `${id} --restart`)}`);
  const filesBase = lane ? laneFilesBase(ctx.root, ev) : ev.started.base;
  const head = resolveCommit(ctx.root, "HEAD") ?? "";
  const { run, deferred, targeted } = planVerifyRun(ctx, card, ev, filesBase, !!lane);
  const mode = { mode: ctx.config.workflow.testMode ?? null, source: ctx.config.workflow.testModeSource ?? null };
  if (deferred.length) ctx.log?.(`  ! full suite deferred to gate (test mode ${mode.mode} from ${mode.source}): ${deferred.join(" · ")}`);
  else if (targeted?.fallback) ctx.log?.(`  ! full suite runs at verify (test mode ${mode.mode} from ${mode.source}): ${targeted.fallback}`);
  const commands = await runAll(ctx, run);
  // compare files after running the commands — junk files left outside .gitignore are caught too
  const files = cardFiles(ctx, card, ev, filesBase);
  const scenarios = cardScenarios(ctx.root, card.scenarios);
  const size = cardSize(ctx, card, files, filesBase);
  const pass = commands.every((c) => c.exit === 0) && !files.outside.length && !files.forbidden.length && !scenarios.missing.length;
  const at = nowIso(ctx);
  const attempts = ev.attempts + 1;
  const failed = commands.filter((c) => c.exit !== 0);
  const failures = failed.length ? [...(ev.failures ?? []), { at, head, attempts, commands: failed }].slice(-RUN_LIMITS.failuresKept) : ev.failures;
  const { reviewFailed: _reopened, ...kept } = ev; // the marker only lasts until this verify
  const next = { ...kept, status: pass ? "done" : "failed", attempts, verified: { at, head, pass, commands, files, scenarios, size, testMode: mode, ...(deferred.length ? { deferred } : {}), ...(targeted ? { targeted } : {}) }, ...(failures ? { failures } : {}) };
  if (pass && failures?.length) {
    ctx.log?.(`  ! passed after failing ${failures.length} time(s) (attempt ${failures.map((f) => f.attempts).join(", ")}) — flaky? ${[...new Set(failures.flatMap((f) => f.commands.map((c) => c.cmd)))].join(" · ")}`);
  }
  if (size.over.length) ctx.log?.(sizeWarning(id, size));
  writeJson(ctx.root, evidencePath(id), next);
  if (!lane) writeGenerated(ctx.root, loadPlan(ctx.root, ctx.config));
  return next;
}

/** The evidence of a card as committed on its lane branch, or null when it is missing or broken (broken = not passed). */
export function branchEvidence(root, branch, id) {
  try {
    return JSON.parse(showFile(root, `refs/heads/${branch}`, evidencePath(id)) ?? "null");
  } catch {
    return null;
  }
}

/**
 * A failed spec review reopens a main-folder card (docs/specs/review-rounds.md rule 5): status "failed" + reviewFailed,
 * everything else kept — task:verify then runs again without --restart and continues the attempt count.
 */
export function reopenCard(ctx, id, round) {
  const ev = loadPlan(ctx.root, ctx.config).evidence.get(id);
  if (!ev || ev.lane) throw new TaskError(`${id} is not a main-folder card with evidence — nothing to reopen`);
  writeJson(ctx.root, evidencePath(id), { ...ev, status: "failed", reviewFailed: round });
  writeGenerated(ctx.root, loadPlan(ctx.root, ctx.config));
}

/** Exit gates: run every gate's commands (a gate without commands = manual) and write evidence/<M>.json. */
export async function verifyMilestone(ctx, mid) {
  refuseInLane(ctx, `task:verify ${mid}`);
  const plan = loadPlan(ctx.root, ctx.config);
  requireValid(plan);
  const legacy = legacyIssues(ctx.root, plan);
  if (legacy.length) throw new TaskError(["the plan has problems — fix them first:", ...legacy.map((i) => `  ✗ ${i}`)].join("\n"));
  const m = plan.milestones.find((x) => x.id === mid);
  if (!m) throw new TaskError(`no milestone ${mid} in ${MILESTONE_DIR}/`);
  const gates = [];
  for (const g of gatesWithFullSuite(ctx.config, m.gates)) {
    if (!g.run.length) {
      ctx.log?.(`■ gate ${g.id} ${g.text} — no command (manual check)`);
      gates.push({ id: g.id, pass: null, commands: [] });
      continue;
    }
    ctx.log?.(`■ gate ${g.id} ${g.text}`);
    const commands = await runAll(ctx, g.run);
    gates.push({ id: g.id, pass: commands.every((c) => c.exit === 0), commands });
  }
  const testMode = { mode: ctx.config.workflow.testMode ?? null, source: ctx.config.workflow.testModeSource ?? null };
  const deferredCards = m.cards.filter((id) => plan.evidence.get(id)?.verified?.deferred?.length);
  const evidence = { id: m.id, kind: "milestone", verified: { at: nowIso(ctx), head: resolveCommit(ctx.root, "HEAD") ?? "", testMode, deferredCards, gates } };
  writeJson(ctx.root, evidencePath(m.id), evidence);
  const after = loadPlan(ctx.root, ctx.config);
  writeGenerated(ctx.root, after);
  const openCards = m.cards.filter((id) => !isDone(cardStatus(after, id)));
  // rule 21: a failed gate that runs a full-suite command, with cards whose full suite was deferred → name the next step
  const suiteFailed = gates.some((g) => g.pass === false && g.commands.some((c) => isFullSuite(ctx.config, c.cmd)));
  const hint = suiteFailed && deferredCards.length ? `${cmd(ctx.config, "task:culprit", m.id)} — finds the card that broke the full suite (deferred from: ${deferredCards.join(", ")})` : null;
  if (hint) ctx.log?.(`  ! next step: ${hint}`);
  return { evidence, pass: gates.every((g) => g.pass !== false) && !openCards.length, openCards, hint };
}

// ── merge (lane → main branch, one at a time) ──────────────────────────────

/** workflow.alwaysAllowed of the saf.config.json committed on a branch; unreadable or malformed → none. */
function branchAllowed(root, branch) {
  try {
    const globs = JSON.parse(showFile(root, `refs/heads/${branch}`, CONFIG_FILE) ?? "null")?.workflow?.alwaysAllowed;
    return Array.isArray(globs) && globs.every((g) => typeof g === "string") ? globs : [];
  } catch {
    return [];
  }
}

function precheck(ctx, id) {
  const root = ctx.root;
  const refuse = (why) => {
    throw new MergeStop(`refused before merging — ${why}`, 3);
  };
  if (!isMainFolder(root)) refuse("task:merge runs in the main folder only");
  if (mergeInProgress(root)) refuse("a merge is already in progress in the main folder");
  const dirty = changedSince(root, "HEAD");
  if (dirty.length) refuse(`the main folder has uncommitted or new files (commit them first — merge checks must run on what will be committed): ${list(dirty)}`);
  const plan = loadPlan(root, ctx.config);
  if (plan.issues.length) refuse(`the plan has ${plan.issues.length} problem(s) (task:state --check)`);
  const card = plan.cards.get(id) ?? refuse(`no card ${id} in ${TASK_DIR}/`);
  const ev = plan.evidence.get(id);
  if (!ev?.lane || !ev.branch || !ev.worktree) refuse(`${id} is not an open lane card (never opened, or abandoned) — task:merge merges lane cards only`);
  if (ev.status === "done") refuse(`${id} is already recorded as passed in the main folder (merged already)`);
  const { branch, worktree } = ev;
  if (!resolveCommit(root, `refs/heads/${branch}`)) refuse(`no branch ${branch}`);
  const onBranch = branchEvidence(root, branch, id);
  const v = onBranch?.verified;
  if (onBranch?.lane !== ev.lane || onBranch?.status !== "done" || !v?.pass) {
    refuse(`the evidence on branch ${branch} has not "passed" — run ${cmd(ctx.config, "task:verify", id)} in ${worktree} and commit the evidence on the card branch`);
  }
  const dir = join(root, worktree);
  if (!existsSync(dir) || currentBranch(dir) !== branch) refuse(`no worktree ${worktree} with ${branch} checked out`);
  const laneDirty = changedSince(dir, "HEAD");
  if (laneDirty.length) refuse(`worktree ${worktree} has uncommitted files — commit work + evidence on ${branch} first: ${list(laneDirty)}`);
  const skip = [...alwaysAllowed(ctx.config), card.file].map((g) => globToRegExp(g));
  const base = mergeBase(root, "HEAD", `refs/heads/${branch}`) ?? refuse(`${branch} shares no history with HEAD`);
  const changedOnBranch = diffNames(root, base, `refs/heads/${branch}`);
  // the lane verified with its own always-allowed list: count the branch's globs only when its config is the verified one
  const verifiedConfig = !changedOnBranch.includes(CONFIG_FILE) || (v.files.changed.includes(CONFIG_FILE) && v.files.hashes[CONFIG_FILE] === fileHash(dir, CONFIG_FILE));
  const branchSkip = (verifiedConfig ? branchAllowed(root, branch) : []).map((g) => globToRegExp(g));
  const files = changedOnBranch.filter((f) => !skip.some((re) => re.test(f)) && (f === CONFIG_FILE || !branchSkip.some((re) => re.test(f))));
  const verified = [...v.files.changed].sort();
  const off = [...files.filter((f) => !verified.includes(f) || v.files.hashes[f] !== fileHash(dir, f)), ...verified.filter((f) => !files.includes(f))];
  if (off.length) refuse(`changed after verification (does not match verified.files): ${list([...new Set(off)])} — run ${cmd(ctx.config, "task:verify", id)} again in the lane, then commit`);
  return { plan, card, ev, branch, worktree };
}

/**
 * @param {{checks?:string[]}} opts checks default to workflow.mergeChecks, without the full-suite commands when the test mode defers them to the exit gate
 */
export async function mergeCard(ctx, id, opts = {}) {
  const root = ctx.root;
  const checks = opts.checks ?? mergeChecksFor(ctx.config);
  const skipped = opts.checks ? [] : (ctx.config.workflow.mergeChecks ?? []).filter((c) => !checks.includes(c));
  let pre;
  try {
    pre = precheck(ctx, id);
  } catch (e) {
    if (e instanceof MergeStop || !(e instanceof TaskError)) throw e;
    throw new MergeStop(`refused before merging — ${e.message}`, 3);
  }
  const { plan, card, ev, branch, worktree } = pre;
  const mains = activeCards(plan)
    .map((c) => ({ c, e: plan.evidence.get(c.id) }))
    .filter((x) => x.e && !x.e.lane)
    .map((x) => ({ ...x, own: new Set(cardFiles(ctx, x.c, x.e).changed) }));
  const ours = [STATE_FILE, MIRROR_FILE, ...mains.map((x) => evidencePath(x.e.id))];
  const saved = ours.map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f)) : null]);
  const rollback = () => {
    try {
      for (const [f, before] of saved) {
        if (before === null) rmSync(join(root, f), { force: true });
        else writeFileSync(join(root, f), before);
      }
      if (mergeInProgress(root)) gitWrite(root, ["merge", "--abort"]);
      return null;
    } catch (e) {
      return `undoing the merge failed (${errText(e)}) — a merge is left in the main folder: run git merge --abort by hand, then check git status`;
    }
  };
  let installed = false;
  const fail = async (why, code) => {
    const stuck = rollback();
    let warn = "";
    if (!stuck && installed) {
      const r = await ctx.run(ctx.config.workflow.mergeInstall.cmd).catch(() => ({ exit: -1 }));
      if (r.exit !== 0) warn = `\n  ⚠ restoring dependencies failed — run ${ctx.config.workflow.mergeInstall.cmd} by hand`;
    }
    throw new MergeStop(`${why}${stuck ? `\n  ✗ ${stuck}` : " — merge undone"}${warn}`, code);
  };
  try {
    gitWrite(root, ["merge", "--no-ff", "--no-commit", `refs/heads/${branch}`]);
  } catch (e) {
    if (!mergeInProgress(root)) throw new MergeStop(`refused before merging — git merge failed: ${errText(e)}`, 3);
    const clash = conflictedFiles(root);
    await fail(`conflict in ${clash.length} file(s) (not resolved automatically): ${clash.join(" · ")}`, 4);
  }
  try {
    const merged = dirtySnapshot(root);
    const inst = ctx.config.workflow.mergeInstall;
    const lockish = inst?.cmd && Object.keys(merged).some((f) => inst.files.includes(f.split("/").pop()));
    const all = lockish ? [inst.cmd, ...checks] : checks;
    ctx.log?.(`merged ${branch} (not committed) → ${all.length} merge check(s)`);
    if (skipped.length) ctx.log?.(`  ! skipped (full suite deferred to gate): ${skipped.join(" · ")}`);
    for (const c of all) {
      ctx.log?.(`▶ ${c}`);
      if (lockish && c === inst.cmd) installed = true;
      const r = await ctx.run(c);
      if (r.exit !== 0) await fail([`merge check failed: ${c} (exit ${r.exit})`, ...r.tail.slice(-12).map((l) => `  │ ${l}`)].join("\n"), 5);
    }
    const brought = Object.keys(merged);
    for (const { e, own } of mains) {
      const dirty = { ...e.started.dirty };
      for (const f of brought) if (!own.has(f)) dirty[f] = merged[f] ?? fileHash(root, f);
      writeJson(root, evidencePath(e.id), { ...e, started: { ...e.started, dirty } });
    }
    writeGenerated(root, loadPlan(root, ctx.config));
    const st = stateCheck(ctx);
    if (st.issues.length || st.stale.length) await fail(`merge check failed: task:state --check — ${list([...st.issues, ...st.stale])}`, 5);
    gitWrite(root, ["add", "-A", "--", ...ours.filter((f) => existsSync(join(root, f)))]);
    gitWrite(root, ["commit", "-m", `merge(${card.milestone}): ${id} ${card.title} (task:merge lane ${ev.lane})`]);
  } catch (e) {
    if (e instanceof MergeStop) throw e;
    await fail(`error after merging (before commit): ${errText(e)}`, 5);
  }
  const commit = resolveCommit(root, "HEAD") ?? "";
  const warnings = [];
  for (const args of [["worktree", "remove", worktree], ["branch", "-d", branch]]) {
    try {
      gitWrite(root, args);
    } catch (e) {
      warnings.push(`git ${args.join(" ")} failed (clean up by hand): ${errText(e)}`);
    }
  }
  const after = loadPlan(root, ctx.config);
  const m = activeMilestone(after);
  return { commit, checks, skipped, warnings, next: m ? pickParallel(after, m) : null };
}

// ── hooks ───────────────────────────────────────────────────────────────────

export function laneBranchStatus(ctx, ev) {
  const t = textFor(ctx.config.people.docLanguage).laneBranch;
  const branch = ev.branch ?? `${ctx.config.workflow.branchPrefix}${ev.id}`;
  if (!resolveCommit(ctx.root, `refs/heads/${branch}`)) return t.missing(branch);
  let onBranch = null;
  try {
    onBranch = JSON.parse(showFile(ctx.root, `refs/heads/${branch}`, evidencePath(ev.id)) ?? "null");
  } catch {
    // broken
  }
  if (!onBranch || typeof onBranch !== "object") return t.broken(evidencePath(ev.id));
  if (onBranch.status === "done") return t.done;
  if (onBranch.status === "failed") return t.failed(onBranch.attempts ?? "?");
  return t.doing;
}

export function sessionStartText(ctx) {
  try {
    const plan = loadPlan(ctx.root, ctx.config);
    const lane = laneFolder(ctx.root, plan);
    return lane ? laneSessionContext(plan, lane) : sessionContext(plan, (ev) => laneBranchStatus(ctx, ev));
  } catch (e) {
    return `[SAF] reading docs/plan/ failed (${errText(e)}) — open docs/plan/STATE.md yourself\n`;
  }
}

/** Stop hook — any internal error lets the session end (a broken tool must never trap the user). */
export function checkStop(ctx, input, env = process.env) {
  if (env[STOP_HOOK_ENV] === "off") return null;
  try {
    const plan = loadPlan(ctx.root, ctx.config);
    return stopGuidance(plan, input, laneFolder(ctx.root, plan)?.card);
  } catch {
    return null;
  }
}

// ── task:env ────────────────────────────────────────────────────────────────

/** `eval "$(… task:env)"` lines for servers a person starts by hand inside a lane. Main folder → comment only. */
/** POSIX shells (and Git Bash on Windows) get `export` lines; plain Windows shells get PowerShell `$env:` lines. */
export function laneEnvLines(config, lane, env = process.env, platform = process.platform) {
  const p = config.workflow.lanePorts;
  if (lane === null) return [`# main folder — default ports (base ${p.base}); nothing to export`];
  const port = p.base + p.step * lane;
  const set = platform === "win32" && !env.SHELL ? (k, v) => `$env:${k} = "${v}"` : (k, v) => `export ${k}=${v}`;
  const out = [set("SAF_LANE", lane), ...p.env.map((name) => set(name, port))];
  if (config.workflow.laneDb) out.push(set("SAF_LANE_DB", config.workflow.laneDb.replace(/\{n\}/g, String(lane)).replace(/\{name\}/g, config.project.name.replace(/[^\w]/g, "_").toLowerCase())));
  out.push(`# lane ${lane}: port ${port}`);
  return out;
}

// ── probe: does a fresh session know the current card? ─────────────────────

export const PROBE_QUESTION =
  "Answer only from information already in this session's context; do not guess or open files. Which milestone is active (its id), how many cards are done out of the total, and the ids of every card in progress? Reply on one line as: <milestone id> done <n>/<total> · <card id> <title> · … (if no card is in progress write the word none instead). If the context does not contain this information, reply with the single word unknown.";

export function probeTarget(plan) {
  const m = activeMilestone(plan);
  if (!m) return null;
  return { milestone: m.id, done: doneCount(plan, m), total: m.cards.length, cards: activeCards(plan).filter((x) => x.milestone === m.id || isSideCard(plan, x.id)).map((c) => ({ id: c.id, title: c.title })) };
}

export const describeProbeTarget = (t) => `${t.milestone} done ${t.done}/${t.total} · ${t.cards.length ? t.cards.map((c) => `${c.id} ${c.title}`).join(" · ") : "no card in progress"}`;

export function judgeProbe(t, answer) {
  const a = answer.toLowerCase();
  if (/\bunknown\b/.test(a) || !answer.includes(t.milestone)) return false;
  if (!new RegExp(`(?<!\\d)${t.done}\\s*(?:/|of|จาก)\\s*${t.total}(?!\\d)`).test(answer)) return false;
  return t.cards.length ? t.cards.every((c) => answer.includes(c.id)) : /\bnone\b|ไม่มี/.test(a);
}

export const NO_HOOKS = ["--settings", JSON.stringify({ disableAllHooks: true })];

function askClaude(root, bin, extra, timeoutMs) {
  const env = { ...process.env, [STOP_HOOK_ENV]: "off" };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const args = ["-p", PROBE_QUESTION, "--tools", "", "--no-session-persistence", "--output-format", "text", ...extra];
  return new Promise((resolve) => {
    const done = (err, stdout, stderr) => {
      const exit = err ? (typeof err.code === "number" ? err.code : 1) : 0;
      resolve({ exit, out: `${stdout}${exit ? `\n${stderr}` : ""}`.trim() });
    };
    const opts = { cwd: root, env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 };
    // Windows: `claude` is a .cmd shim, which only runs through the shell
    if (IS_WINDOWS) execFile([bin, ...args].map(quoteWindowsArg).join(" "), { ...opts, shell: true, windowsHide: true }, done);
    else execFile(bin, args, opts, done);
  });
}

/**
 * Opens two fresh `claude -p` sessions with no tools (cannot open files): with hooks it must answer correctly,
 * with every hook disabled it must not — proving the answer came from the SessionStart hook.
 */
export async function runProbe(ctx, opts = {}) {
  refuseInLane(ctx, "task:probe");
  const target = probeTarget(loadPlan(ctx.root, ctx.config));
  if (!target) throw new TaskError("no milestone is status: active — nothing to probe");
  const bin = opts.bin ?? "claude";
  const timeout = opts.timeoutMs ?? 180_000;
  const started = Date.now();
  // one after the other: accounts and gateways with a concurrency limit reject two parallel calls
  const main = await askClaude(ctx.root, bin, [], timeout);
  const control = await askClaude(ctx.root, bin, NO_HOOKS, timeout);
  const knows = main.exit === 0 && judgeProbe(target, main.out);
  const blind = control.exit === 0 && !judgeProbe(target, control.out);
  return { expected: describeProbeTarget(target), main: { ...main, knows }, control: { ...control, blind }, pass: knows && blind, ms: Date.now() - started };
}

export { PLAN_DIR };
