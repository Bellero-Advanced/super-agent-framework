import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scriptCommand } from "./config.mjs";
import { changedSince, commitSubject, diffNames, gitWrite, isAncestor, resolveCommit, revList } from "./git.mjs";
import { loadPlan } from "./plan.mjs";
import { RUN_LIMITS, taskRunner } from "./run.mjs";
import { TaskError, refuseInLane, requireValid } from "./task.mjs";
import { fullSuiteCommands } from "./testmode.mjs";

/**
 * `task:culprit <M>` — which card broke the deferred full suite (docs/specs/test-mode.md rules 22-27).
 * Binary search over the first-parent commits of the milestone, every run in one temporary detached worktree.
 * Nothing here writes in the main folder or in docs/plan/.
 */

/** Result kinds → CLI exit codes (1 = error is thrown as TaskError). */
export const CULPRIT_EXIT = { found: 0, "base-fails": 2, "passes-at-head": 3 };
/** Signals that stop the search → the exit code of the interrupted command (128 + the signal number). */
const INTERRUPT_EXIT = { SIGINT: 130, SIGTERM: 143 };

/** Oldest `started.base` of the milestone's cards that is an ancestor of HEAD (the one with the most commits up to HEAD). */
function oldestBase(ctx, m, plan) {
  const bases = m.cards.map((id) => plan.evidence.get(id)?.started?.base).filter(Boolean);
  if (!bases.length) throw new TaskError(`no card of ${m.id} has started`);
  const reachable = bases.filter((b) => resolveCommit(ctx.root, b) && isAncestor(ctx.root, b, "HEAD"));
  if (!reachable.length) throw new TaskError(`no card of ${m.id} started from a commit in this branch's history — nothing to search`);
  const count = (b) => revList(ctx.root, ["--first-parent", `${b}..HEAD`]).length;
  return reachable.sort((a, b) => count(b) - count(a))[0];
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Card of the milestone that owns a commit: id in the subject (matched as literal text; several → the first in
 * milestone order), else the most overlap with evidence `files.changed` (equal → the earlier card), else null.
 */
export function cardOf(ctx, m, plan, sha) {
  const subject = commitSubject(ctx.root, sha) ?? "";
  const named = m.cards.find((id) => new RegExp(`(^|[^\\w-])${escapeRegExp(id)}(?![\\w-])`).test(subject));
  if (named) return { id: named, by: "subject" };
  const files = diffNames(ctx.root, `${sha}^`, sha); // a commit of the range always has a parent (the range starts after the base)
  let best = null;
  for (const id of m.cards) {
    const changed = new Set(plan.evidence.get(id)?.verified?.files?.changed ?? []);
    const overlap = files.filter((f) => changed.has(f)).length;
    if (overlap > (best?.overlap ?? 0)) best = { id, by: "files", overlap };
  }
  return best;
}

/** Let the event loop deliver a signal that arrived while a synchronous step (git, the install command) was blocking it. */
// two immediates: the second runs on a later loop turn, after a poll phase has read a signal that arrived while a synchronous step blocked the loop (one immediate or a 0 ms timer is not enough on Node 20)
const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

/** Thrown inside the search when a signal asked it to stop. */
class Interrupted extends Error {}

/** Remove the temporary worktree; never throws (the caller may already be handling an error). */
function removeWorktree(ctx, dir) {
  const attempt = (f) => {
    try {
      f();
    } catch {
      // best effort: the next step deletes and prunes whatever is left
    }
  };
  attempt(() => gitWrite(ctx.root, ["worktree", "remove", "--force", dir]));
  attempt(() => existsSync(dir) && rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  attempt(() => gitWrite(ctx.root, ["worktree", "prune"]));
}

/** ctx = engine context (root · config · install? · runSync? · log?) · `opts.cmd` overrides the first full-suite command. */
export async function findCulprit(ctx, mid, opts = {}) {
  refuseInLane(ctx, `task:culprit ${mid}`);
  const plan = loadPlan(ctx.root, ctx.config);
  requireValid(plan);
  const m = plan.milestones.find((x) => x.id === mid);
  if (!m) throw new TaskError(`no milestone ${mid}`);
  const command = (opts.cmd ?? "").trim() || fullSuiteCommands(ctx.config)[0];
  if (!command) throw new TaskError(`no full-suite command to run — set stack.commands.test or give one: ${scriptCommand(ctx.config.stack.packageManager, "task:culprit", `${mid} --cmd "<command>"`)}`);
  const base = oldestBase(ctx, m, plan);
  const commits = revList(ctx.root, ["--first-parent", "--reverse", `${base}..HEAD`]);
  const head = commits.at(-1) ?? base; // HEAD itself (the base when no commit follows it)
  const dirty = changedSince(ctx.root, "HEAD").length;
  if (dirty) ctx.log?.(`  ! ${dirty} uncommitted file(s) in the main folder are not tested — only committed history is searched`);

  const dir = join(ctx.root, ctx.config.workflow.worktreeDir, `culprit-${process.pid}-${Date.now().toString(36)}`);
  const run = taskRunner(dir, { onOutput: ctx.onOutput, timeoutMs: ctx.config.workflow.commandTimeoutMs });
  const install = ctx.install === undefined ? ctx.config.workflow.laneInstall : ctx.install;
  let runs = 0;
  let interrupted = null; // the signal that stopped the search, if any
  const stopRun = new AbortController();
  const onSignal = (name) => () => {
    interrupted ??= name;
    stopRun.abort(); // the runner stops the test command and everything it started
  };
  const handlers = Object.keys(INTERRUPT_EXIT).map((name) => [name, onSignal(name)]);
  let tail = []; // the tail of the latest failing run is the tail of the first failing commit (the search only moves down)
  /** One real run of the command at one commit; true = the suite passes. */
  const passesAt = async (sha) => {
    if (interrupted) throw new Interrupted();
    gitWrite(dir, ["checkout", "--detach", "--quiet", sha]);
    if (install) {
      const code = ctx.runSync ? ctx.runSync(install, dir) : 0;
      if (code !== 0) throw new TaskError(`${install} exited ${code} at ${sha.slice(0, 7)} — cannot judge this commit`);
    }
    await settle(); // a signal during checkout or install must stop the search before a run starts
    if (interrupted) throw new Interrupted();
    runs += 1;
    ctx.log?.(`▶ run ${runs}: ${command} @ ${sha.slice(0, 7)}`);
    const r = await run(command, { signal: stopRun.signal });
    if (interrupted) throw new Interrupted();
    ctx.log?.(r.exit === 0 ? "  ✓ passes" : `  ✗ fails (exit ${r.exit})`);
    if (r.exit !== 0) tail = r.tail.slice(-RUN_LIMITS.culpritTail);
    return r.exit === 0;
  };
  const result = (kind, extra = {}) => ({ kind, exit: CULPRIT_EXIT[kind], milestone: mid, command, runs, commits: commits.length, ...extra });

  try {
    for (const [name, h] of handlers) process.on(name, h);
    gitWrite(ctx.root, ["worktree", "add", "--detach", dir, head]);
    if (await passesAt(head)) return result("passes-at-head");
    // no commit between base and HEAD means HEAD is the base, which just failed
    if (!commits.length || !(await passesAt(base))) return result("base-fails");
    let good = -1; // index of the last commit known to pass (-1 = the base)
    let bad = commits.length - 1; // index of the first commit known to fail
    while (bad - good > 1) {
      const at = good + Math.floor((bad - good) / 2);
      if (await passesAt(commits[at])) good = at;
      else bad = at;
    }
    const sha = commits[bad];
    const owner = cardOf(ctx, m, plan, sha);
    return result("found", { sha, subject: commitSubject(ctx.root, sha) ?? "", card: owner?.id ?? null, cardTitle: plan.cards.get(owner?.id)?.title ?? "", by: owner?.by ?? null, tail });
  } catch (e) {
    await settle(); // Ctrl-C during install also kills it: the install error must not hide the signal
    if (e instanceof Interrupted || interrupted) return result("interrupted", { exit: INTERRUPT_EXIT[interrupted], signal: interrupted });
    throw e;
  } finally {
    for (const [name, h] of handlers) process.off(name, h);
    removeWorktree(ctx, dir);
  }
}

/** Plain lines for the CLI. */
export function culpritLines(r) {
  if (r.kind === "interrupted") return [`✗ ${r.milestone}: interrupted by ${r.signal} — the running command was stopped and the temporary worktree removed`];
  const used = `${r.runs} run(s) of \`${r.command}\` over ${r.commits} commit(s)`;
  if (r.kind === "passes-at-head") return [`✓ ${r.milestone}: the suite passes at HEAD — flaky or already fixed · no culprit to find (${used})`];
  if (r.kind === "base-fails") return [`✗ ${r.milestone}: the suite is already failing before the first card — not caused by a card (${used})`];
  return [
    `✗ ${r.milestone}: the suite first fails at commit ${r.sha.slice(0, 7)} ${r.subject}`,
    r.card ? `  card: ${r.card} ${r.cardTitle} (found by ${r.by === "subject" ? "the commit subject" : "the files it changed"})` : "  card: no card of this milestone matches this commit",
    ...(r.tail.length ? ["  last lines of the failing run:", ...r.tail.map((l) => `    │ ${l}`)] : []),
    `  ${used}`,
  ];
}
