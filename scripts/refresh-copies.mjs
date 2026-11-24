#!/usr/bin/env node
// One command refreshes every engine copy of this repository (spec docs/specs/refresh-copies.md). Repository-only: not shipped.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../kit/tools-saf/lib/config.mjs";
import { planSetup } from "../kit/tools-saf/lib/generate.mjs";
import { globToRegExp, toGlob } from "../kit/tools-saf/lib/glob.mjs";
import { activeCards, loadPlan } from "../kit/tools-saf/lib/plan.mjs";
import { laneFolder, stateCheck } from "../kit/tools-saf/lib/task.mjs";

/** Data, not logic: the example, what the restore never touches, the folder pairs `--check` compares. */
export const TABLE = {
  example: "examples/todo-api",
  // example files SAF owns (rule 12): never restored, and every entry is in saf.config.json workflow.alwaysAllowed
  ownedGlobs: ["examples/todo-api/tools/saf/**", "examples/todo-api/.claude/commands/**", "examples/todo-api/.claude/skills/**", "examples/todo-api/.claude/agents/**", "examples/todo-api/CLAUDE.md", "examples/todo-api/.saf/manifest.json"],
  rerender: { config: "saf.config.json", manifest: ".saf/manifest.json", only: (p) => p === "CLAUDE.md" || p.startsWith(".claude/agents/"), write: "update", kept: ["keep-edited", "replace-edited"] },
  skipDirs: ["node_modules"],
  pairs: [["kit/tools-saf", "tools/saf"], ["kit/claude/skills/saf-setup", ".claude/skills/saf-setup"], ["kit/tools-saf", "examples/todo-api/tools/saf"]],
  listMax: 20,
  fix: "npm run saf:refresh",
};

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const posix = (p) => p.split("\\").join("/");
const text = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every file under `dir` (posix paths relative to `dir`), skipping folders named in `skip`. */
export function listFiles(dir, skip = []) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) out.push(posix(relative(dir, join(d, e.name))));
      else if (!skip.includes(e.name)) walk(join(d, e.name));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/** The arguments of one upgrade step — run as `process.execPath <args>`, never through a shell. */
export const upgradeArgs = (root, dir) => [join(root, "bin", "cli.mjs"), "upgrade", "--dir", dir];
export const defaultSpawn = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", shell: false }).status ?? 1;

/** `--check`: same file list and same content (CRLF ignored) for every pair. Returns the problem lines. */
export function checkCopies(root) {
  const bad = [];
  for (const [kit, copy] of TABLE.pairs) {
    const [a, b] = [join(root, kit), join(root, copy)];
    const [fa, fb] = [listFiles(a), listFiles(b)];
    if (!existsSync(b)) bad.push(`${copy}/ is missing`);
    for (const f of fa) if (!fb.includes(f)) existsSync(b) && bad.push(`missing: ${copy}/${f}`);
    for (const f of fb) if (!fa.includes(f)) bad.push(`extra: ${copy}/${f}`);
    for (const f of fa) if (fb.includes(f) && text(join(a, f)) !== text(join(b, f))) bad.push(`differs: ${copy}/${f}`);
  }
  return bad;
}

function reportCheck(root, out, err) {
  const bad = checkCopies(root);
  if (!bad.length) return out(`check: ${TABLE.pairs.length} copies equal kit/`), 0;
  err([`check: copies differ from kit/ (${bad.length})`, ...bad.slice(0, TABLE.listMax).map((l) => `  ${l}`), ...(bad.length > TABLE.listMax ? [`  … and ${bad.length - TABLE.listMax} more`] : []), `fix: ${TABLE.fix}`].join("\n"));
  return 1;
}

/**
 * Rule 13: write the planned content of the example's own CLAUDE.md and agents when they are generated and unedited (`update`),
 * record the hash setup records (sha1 of the content), print the edited ones. Throws when `planSetup` does. Returns the lines to print.
 */
function rerenderExample(ex) {
  const R = TABLE.rerender;
  if (!existsSync(join(ex, R.config))) return [];
  const plan = planSetup(ex, JSON.parse(readFileSync(join(ex, R.config), "utf8")));
  const mine = plan.actions.filter((a) => R.only(a.path));
  const todo = mine.filter((a) => a.action === R.write);
  if (todo.length) {
    const manifestPath = join(ex, R.manifest);
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { files: {} };
    for (const a of todo) {
      mkdirSync(dirname(join(ex, a.path)), { recursive: true });
      writeFileSync(join(ex, a.path), a.content);
      manifest.files[a.path] = createHash("sha1").update(a.content).digest("hex");
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return [`example re-rendered: ${todo.length}`, ...mine.filter((a) => R.kept.includes(a.action)).map((a) => `kept (edited): ${a.path}`)];
}

const BY_HAND = () => ` · outside a card, refresh by hand: node bin/cli.mjs upgrade --dir .  then  node bin/cli.mjs upgrade --dir ${TABLE.example}`;

/** The card in progress here: the lane's card in a lane worktree, the one main-folder card in the main folder. Throws the refusal text. */
function cardHere(root) {
  const config = loadConfig(root, {});
  const { issues } = stateCheck({ root, config });
  if (issues.length) throw new Error(["the plan has problems — fix them first:", ...issues.map((i) => `  ✗ ${i}`)].join("\n"));
  const plan = loadPlan(root, config);
  const lane = laneFolder(root, plan);
  if (lane) return plan.cards.get(lane.card);
  const open = activeCards(plan);
  const mine = open.filter((c) => !plan.evidence.get(c.id)?.lane);
  if (mine.length === 1) return mine[0];
  if (mine.length) throw new Error(`more than one main-folder card in progress (${mine.map((c) => c.id).join(" · ")}) — cannot tell which files to keep${BY_HAND()}`);
  if (open.length) throw new Error(`only lane cards are in progress — run the refresh in their worktree: ${open.map((c) => `${c.id} (${plan.evidence.get(c.id)?.worktree ?? "-"})`).join(" · ")}${BY_HAND()}`);
  throw new Error(`no card in progress in this folder${BY_HAND()}`);
}

export async function refresh({ root = REPO, argv = [], spawn = defaultSpawn, out = console.log, err = console.error } = {}) {
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) return err(`unknown argument ${unknown.join(" ")} — the only one is --check`), 2;
  if (argv.length) return reportCheck(root, out, err);
  let card;
  try {
    card = cardHere(root);
  } catch (e) {
    return err(e.message), 2;
  }
  out(`card: ${card.id}`);
  const ex = join(root, TABLE.example);
  const keep = [...card.touch, ...TABLE.ownedGlobs].map((g) => globToRegExp(toGlob(g)));
  const before = new Map(listFiles(ex, TABLE.skipDirs).map((f) => [f, readFileSync(join(ex, f))]));
  let failed = null;
  for (const [step, dir] of [["a", root], ["b", ex]]) {
    const code = spawn(process.execPath, upgradeArgs(root, dir));
    out(`step ${step}: upgrade ${posix(relative(root, dir)) || "."} — ${code === 0 ? "ok" : `failed (exit ${code})`}`);
    if (code !== 0) {
      failed = step;
      break;
    }
  }
  if (failed === "a") return err("step a failed — stopped"), 1;
  if (!failed) {
    try {
      for (const l of rerenderExample(ex)) out(l);
    } catch (e) {
      failed = "re-render";
      err(`step re-render: ${e.message}`);
    }
  }
  const restored = [];
  for (const f of [...new Set([...before.keys(), ...listFiles(ex, TABLE.skipDirs)])].sort()) {
    const [abs, rel, was] = [join(ex, f), `${TABLE.example}/${f}`, before.get(f) ?? null];
    const now = existsSync(abs) ? readFileSync(abs) : null;
    if (keep.some((re) => re.test(rel)) || (was && now ? was.equals(now) : !was && !now)) continue;
    if (was) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, was);
    } else {
      rmSync(abs, { force: true });
      for (let d = dirname(abs); d !== ex && existsSync(d) && !readdirSync(d).length; d = dirname(d)) rmdirSync(d);
    }
    restored.push(rel);
  }
  for (const l of [restored.length ? `restored: ${restored.length}` : "nothing to restore", ...restored.map((r) => `  ${r}`)]) out(l);
  return failed ? (err(`step ${failed} failed — stopped`), 1) : reportCheck(root, out, err);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await refresh({ argv: process.argv.slice(2) });
