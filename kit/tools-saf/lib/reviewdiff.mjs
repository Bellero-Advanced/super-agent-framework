import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { scriptCommand } from "./config.mjs";
import { isDir, resolveCommit } from "./git.mjs";
import { CARD_ID, ROOT_REPO, loadPlan } from "./plan.mjs";
import { TaskError, cardFiles, cardSize, laneFilesBase, laneFolder, requireCard, requireValid } from "./task.mjs";

/**
 * `task:diff <id>` — docs/specs/review-diff.md. Writes the diff file the read-only reviewer reads: exactly the files
 * `task:verify` counts as the card's (`cardFiles` against the same base), never a hand-made pathspec.
 *
 * Writes one file, `.saf/memory/review/<id>.diff`, in the folder that holds the card's files (built completely in memory
 * first, then moved into place, so a failed git call leaves the older file as it was). The text is not redacted: the
 * folder is git-ignored and local, and the command prints only the path and counts, never file content.
 */

/** Where the file goes — one constant (data, not logic). */
export const REVIEW_DIR = ".saf/memory/review";
export const reviewDiffPath = (id) => `${REVIEW_DIR}/${id}.diff`;
/** Biggest git output taken in one piece (bytes). A larger diff is not cut: the git call fails and the message says so. */
export const DIFF_LIMITS = { maxBuffer: 512 * 1024 * 1024 };

/** A git call or the write failed → exit 1 (a refusal is a TaskError → exit 2). */
export class DiffError extends Error {}

const cmd = (config, script, args) => scriptCommand(config.stack.packageManager, script, args);
/** `#` header lines must stay one line each: control characters in a title or file name become "?". */
const oneLine = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, "?");

/** Runs git with an argument array (no shell). Paths are literal (no globs or `:` magic) and never decided by the user's git config. */
function runGit(cwd, args, okStatus = [0]) {
  const full = ["-c", "core.quotePath=false", "--literal-pathspecs", ...args];
  const r = spawnSync("git", full, { cwd, maxBuffer: DIFF_LIMITS.maxBuffer, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (r.error || !okStatus.includes(r.status)) {
    const why = r.error ? (r.error.code === "ENOBUFS" ? `the output is larger than ${DIFF_LIMITS.maxBuffer} bytes` : r.error.message) : r.stderr.toString("utf8").trim().split("\n")[0];
    throw new DiffError(`git ${args[0]} failed (${oneLine(args.at(-1))}): ${why}`);
  }
  return r.stdout;
}

const splitZ = (buf) => buf.toString("utf8").split("\0").filter(Boolean);
/** Diff options: no colour, no external tool, no text filters, fixed a/ b/ prefixes (set per call) — whatever the user's git config says. */
const DIFF_OPTS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=all"];

/** One file against `base`, including uncommitted work. `prefix` puts a submodule's files under its folder name. */
function fileDiff(dir, base, file, untracked, prefix = "") {
  if (untracked.has(file)) {
    // a new file git does not know yet: compared with nothing — git exits 1 when the sides differ
    return runGit(dir, [...DIFF_OPTS, `--src-prefix=a/${prefix}`, `--dst-prefix=b/${prefix}`, "--no-index", "--", "/dev/null", file], [0, 1]);
  }
  return runGit(dir, [...DIFF_OPTS, `--src-prefix=a/${prefix}`, `--dst-prefix=b/${prefix}`, base, "--", file]);
}

const untrackedIn = (dir) => new Set(splitZ(runGit(dir, ["ls-files", "-z", "--others", "--exclude-standard"])));

const countLines = (buf) => {
  let n = 0;
  for (let i = buf.indexOf(10); i >= 0; i = buf.indexOf(10, i + 1)) n++;
  return buf.length && buf.at(-1) !== 10 ? n + 1 : n;
};

/**
 * Where this card is read: its folder, its plan and the base files are counted from — the rules of spec section 2, rule 3.
 * @throws {TaskError} not started · another lane's card · the lane's worktree is missing
 */
function whereIs(ctx, id) {
  const plan = loadPlan(ctx.root, ctx.config);
  const lane = laneFolder(ctx.root, plan);
  if (lane && id !== lane.card) throw new TaskError(`this folder is the worktree of lane ${lane.lane}, card ${lane.card} — it only builds the diff of ${lane.card} (${cmd(ctx.config, "task:diff", lane.card)}) · run ${id} in the main folder`);
  requireValid(plan);
  requireCard(plan, id);
  const ev = plan.evidence.get(id);
  if (!ev) throw new TaskError(`${id} has not started — run ${cmd(ctx.config, "task:start", id)} first (the start commit is the base of the diff)`);
  if (lane || !ev.lane) return { root: ctx.root, plan, ev, lane: !!lane };
  const worktree = ev.worktree ? resolve(ctx.root, ev.worktree) : null;
  if (!worktree || !isDir(worktree)) throw new TaskError(`${id} is a lane ${ev.lane} card but its worktree ${ev.worktree ?? "-"} is missing — run ${cmd(ctx.config, "task:start", `${id} --worktree --resume`)}`);
  const lanePlan = loadPlan(worktree, ctx.config);
  const laneEv = lanePlan.evidence.get(id);
  if (!laneEv) throw new TaskError(`${id} has no evidence in its worktree ${ev.worktree} — run ${cmd(ctx.config, "task:start", `${id} --worktree --resume`)}`);
  return { root: worktree, plan: lanePlan, ev: laneEv, lane: true };
}

/**
 * Builds the diff and writes it. Nothing is written when a refusal or a git failure comes first.
 * @returns {{path:string, files:number, lines:number, size:object, lane:boolean}} `path` is absolute
 */
export function writeReviewDiff(ctx, id) {
  if (!CARD_ID.test(id)) throw new TaskError(`"${id}" is not a card id (T-M<n>-<nn>) — usage: ${cmd(ctx.config, "task:diff", "<id>")}`);
  const where = whereIs(ctx, id);
  const sub = { ...ctx, root: where.root };
  const card = where.plan.cards.get(id);
  const filesBase = where.lane ? laneFilesBase(where.root, where.ev) : where.ev.started.base;
  const files = cardFiles(sub, card, where.ev, filesBase);
  const size = cardSize(sub, card, files, filesBase);
  const inSub = (f) => card.repo !== ROOT_REPO && where.ev.started.repoBase && f.startsWith(`${card.repo}/`);
  const parts = [];
  if (files.changed.length) {
    const rootUntracked = untrackedIn(where.root);
    const subDir = card.repo !== ROOT_REPO ? join(where.root, card.repo) : null;
    const subUntracked = subDir && existsSync(join(subDir, ".git")) && files.changed.some(inSub) ? untrackedIn(subDir) : new Set();
    for (const f of files.changed) {
      const buf = inSub(f)
        ? fileDiff(subDir, where.ev.started.repoBase, f.slice(card.repo.length + 1), subUntracked, `${card.repo}/`)
        : fileDiff(where.root, filesBase, f, rootUntracked);
      parts.push(buf.length ? buf : Buffer.from(`# ${oneLine(f)}: no change against the base\n`));
    }
  }
  const capText = (k) => `${size[k].lines}${size[k].cap === null ? "" : `/${size[k].cap}`}`;
  const header = [
    `# ${id} ${oneLine(card.title ?? "")}`,
    `# base ${filesBase} · HEAD ${resolveCommit(where.root, "HEAD") ?? "-"}`,
    `# files ${files.changed.length}`,
    `# size ${size.size ?? "-"}: code ${capText("code")} · test ${capText("test")} changed lines${size.over.length ? ` — over the cap: ${size.over.join(", ")}` : ""}`,
    ...files.changed.map((f) => `#   ${oneLine(f)}`),
    ...(files.changed.length ? [] : ["no changed files"]),
    "",
    "",
  ].join("\n");
  const body = Buffer.concat([Buffer.from(header), ...parts]);
  const rel = reviewDiffPath(id);
  const abs = join(where.root, rel);
  const tmp = `${abs}.tmp`;
  mkdirSync(join(where.root, REVIEW_DIR), { recursive: true });
  try {
    writeFileSync(tmp, body);
    renameSync(tmp, abs);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new DiffError(`could not write ${rel}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { path: resolve(abs), files: files.changed.length, lines: countLines(body), size, lane: where.lane };
}
