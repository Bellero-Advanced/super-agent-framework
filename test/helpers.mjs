import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LIB = join(REPO, "kit", "tools-saf", "lib");
export const lib = (name) => import(join(LIB, name));

// deterministic git for every test repo (no global config, no signing)
Object.assign(process.env, {
  GIT_AUTHOR_NAME: "SAF Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "SAF Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
  GIT_CONFIG_KEY_1: "init.defaultBranch",
  GIT_CONFIG_VALUE_1: "main",
});

const made = [];
export function tmp(prefix = "saf-test-") {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}
export function cleanup() {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function write(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

export const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function gitRepo(root = tmp()) {
  git(root, "init", "-q");
  return root;
}

export function commitAll(root, msg = "test commit") {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", msg);
  return git(root, "rev-parse", "HEAD");
}

/** Card markdown with frontmatter + criteria. */
export function card({ id, title = `card ${id}`, size = "S", role = "implementer", touch = ["src/**"], dontTouch = [], depends = [], scenarios = [], criteria = ["true"] }) {
  const m = id.split("-")[1];
  const list = (k, v) => (v.length ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join("\n")}\n` : `${k}: []\n`);
  return `---\nid: ${id}\nmilestone: ${m}\ntitle: ${title}\nsize: ${size}\nrole: ${role}\n${list("touch", touch)}${list("dont_touch", dontTouch)}${list("depends", depends)}${list("scenarios", scenarios)}---\n\n# ${id}\n\n## Done when\n\n${criteria.map((c) => `- \`${c}\``).join("\n")}\n`;
}

export function milestone({ id = "M1", status = "active", cards = [], gates = [], sideCards = null }) {
  const g = gates.length
    ? `gates:\n${gates.map((x) => `  - id: ${JSON.stringify(x.id)}\n    text: ${x.text}\n${x.run ? `    run:\n${x.run.map((r) => `      - ${JSON.stringify(r)}`).join("\n")}\n` : ""}`).join("")}`
    : "";
  const side = sideCards ? `side_cards:\n${sideCards.map((c) => `  - ${c}`).join("\n")}\n` : "";
  return `---\nid: ${id}\ntitle: milestone ${id}\nstatus: ${status}\ncards:\n${cards.map((c) => `  - ${c}`).join("\n")}\n${side}${g}---\n\n# ${id}\n\n## Goal\n\ntest\n`;
}

/** A git repo with saf.config.json, one milestone and the given cards — committed. */
export async function planRepo({ config = {}, cards = [], gates = [], files = {}, extra = [] } = {}) {
  const { resolveConfig } = await lib("config.mjs");
  const root = gitRepo();
  write(root, "saf.config.json", { version: 1, stack: { packageManager: "none" }, ...config });
  write(root, ".gitignore", ".saf-lane.json\n.claude/worktrees/\n");
  const inExtra = new Set(extra.flatMap((m) => m.cards));
  write(root, "docs/plan/milestones/M1.md", milestone({ cards: cards.map((c) => c.id).filter((id) => !inExtra.has(id)), gates }));
  for (const m of extra) write(root, `docs/plan/milestones/${m.id}.md`, milestone(m));
  for (const c of cards) write(root, `docs/plan/tasks/${c.id.split("-")[1]}/${c.id}.md`, card(c));
  for (const [f, v] of Object.entries(files)) write(root, f, v);
  const cfg = resolveConfig(JSON.parse(JSON.stringify({ version: 1, stack: { packageManager: "none" }, ...config })));
  const { loadPlan } = await lib("plan.mjs");
  const { writeGenerated } = await lib("task.mjs");
  writeGenerated(root, loadPlan(root, cfg));
  commitAll(root, "plan");
  return { root, config: cfg };
}

/** ctx with a fake runner: a command containing "FAIL" exits 1, everything else 0. */
export function fakeCtx(root, config, extra = {}) {
  const ran = [];
  return {
    root,
    config,
    install: null,
    log: () => {},
    run: async (cmd) => {
      ran.push(cmd);
      const exit = cmd.includes("FAIL") ? 1 : 0;
      return { cmd, exit, ms: 1, tail: exit ? ["boom"] : [] };
    },
    ran,
    ...extra,
  };
}
