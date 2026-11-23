import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * git helpers. Reads never change the repo. Writes go through `gitWrite` only, so every
 * state-changing git call the engine makes is in one place (and easy to audit).
 */

const MAX = 64 * 1024 * 1024;

export function git(cwd, args, opts = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX, stdio: ["ignore", "pipe", "pipe"], ...opts });
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/** The single writer. Throws with git's stderr on failure. */
export function gitWrite(cwd, args) {
  try {
    return git(cwd, args, { env: { ...process.env, GIT_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no" } });
  } catch (e) {
    const err = e?.stderr?.toString?.().trim() || e?.message || String(e);
    throw new Error(`git ${args.join(" ")}: ${err}`);
  }
}

export const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export function resolveCommit(cwd, rev) {
  const out = tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  return out ? out.trim() : null;
}

export function commitSubject(cwd, rev) {
  const out = tryGit(cwd, ["log", "-1", "--format=%s", `${rev}^{commit}`, "--"]);
  return out === null ? null : out.trim();
}

const splitZ = (s) => (s ?? "").split("\0").filter(Boolean);

/** Tracked files + untracked files that are not ignored. */
export function lsFiles(cwd) {
  return splitZ(git(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]));
}

/** Repo files that exist on disk (deleted-but-indexed files are dropped), sorted. */
export function listRepoFiles(root) {
  return [...new Set(lsFiles(root).filter((f) => existsSync(join(root, f))))].sort();
}

/** Files that differ from `rev` (committed after it · staged · unstaged · untracked). Submodule pointers are ignored. */
export function changedSince(cwd, rev) {
  const tracked = splitZ(git(cwd, ["diff", "--name-only", "--no-renames", "--ignore-submodules=all", "-z", rev, "--"]));
  const untracked = splitZ(git(cwd, ["ls-files", "-z", "--others", "--exclude-standard"]));
  return [...new Set([...tracked, ...untracked])].sort();
}

export function fileHash(cwd, rel) {
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return "deleted";
  try {
    return createHash("sha1").update(readFileSync(abs)).digest("hex");
  } catch {
    return "unreadable";
  }
}

/** Files that differ from HEAD with their content hash (used as "already dirty before the card started"). */
export function dirtySnapshot(cwd) {
  const out = {};
  for (const f of changedSince(cwd, "HEAD")) out[f] = fileHash(cwd, f);
  return out;
}

export function isAncestor(cwd, a, b) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", a, b]);
    return true;
  } catch {
    return false;
  }
}

export function currentBranch(cwd) {
  const out = tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return out ? out.trim() : null;
}

export function mergeBase(cwd, a, b) {
  const out = tryGit(cwd, ["merge-base", a, b]);
  return out ? out.trim() : null;
}

export function diffNames(cwd, a, b) {
  return splitZ(git(cwd, ["diff", "--name-only", "--no-renames", "--ignore-submodules=all", "-z", a, b, "--"]));
}

export function showFile(cwd, rev, rel) {
  return tryGit(cwd, ["show", `${rev}:${rel}`]);
}

export function revList(cwd, args) {
  const out = tryGit(cwd, ["rev-list", ...args]);
  return out ? out.split("\n").filter(Boolean) : [];
}

export function mergeInProgress(cwd) {
  return resolveCommit(cwd, "MERGE_HEAD") !== null;
}

export function conflictedFiles(cwd) {
  return splitZ(tryGit(cwd, ["diff", "--name-only", "--diff-filter=U", "-z"]));
}

export function lastCommitOf(cwd, rel) {
  const out = tryGit(cwd, ["log", "-1", "--format=%H", "--", rel]);
  return out ? out.trim() || null : null;
}

/** HEAD of the main working tree (first entry of `git worktree list`), readable from any linked worktree. */
export function mainWorktreeHead(cwd) {
  const out = tryGit(cwd, ["worktree", "list", "--porcelain"]);
  const m = out?.match(/^HEAD ([0-9a-f]+)/m);
  return m ? m[1] : null;
}

/** Folder is the main working tree (has a `.git` directory, not a `.git` file). */
export const isMainFolder = (root) => isDir(join(root, ".git"));

/** Shared git dir of all worktrees of this repo (lock files live here). */
export function commonGitDir(root) {
  const out = git(root, ["rev-parse", "--git-common-dir"]).trim();
  return out.startsWith("/") || /^[A-Za-z]:/.test(out) ? out : join(root, out);
}

/** Submodule paths from .gitmodules. */
export function submodulePaths(root) {
  const file = join(root, ".gitmodules");
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map((m) => m[1]).filter(Boolean).sort();
}

export const submoduleReady = (root, sub) => existsSync(join(root, sub, ".git"));
