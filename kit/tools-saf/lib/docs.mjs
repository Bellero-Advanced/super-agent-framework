import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { roleTable } from "./config.mjs";
import { globToRegExp } from "./glob.mjs";
import { codeSpans, extractLinks, frontmatter, localTarget, proseLines, shellCommands } from "./markdown.mjs";
import { parseYaml } from "./yaml.mjs";

/**
 * docs:check — the agent-facing documents stay true.
 *
 *   1. required files exist (CLAUDE.md · docs/INDEX.md · docs/DECISIONS.md · docs/plan/README.md · saf.config.json)
 *   2. markdown links resolve in SAF-owned docs (CLAUDE.md files · .claude/{agents,commands,rules} · docs/ except docs/archive/)
 *   3. agent-loaded files (CLAUDE.md · rules · agents · commands · INDEX): line caps · package scripts used in ```bash blocks
 *      exist · repo paths in backticks exist · no bare `@name` (Claude Code reads it as a file import)
 *   4. .claude/rules/*.md have a readable `paths:` list (matching no file yet = warning)
 *   5. agents: one per enabled role · name = file name · full model id equal to saf.config.json · valid effort ·
 *      read-only roles list only read tools
 *   6. tracked Claude Code settings: valid JSON · no `env` block · no ANTHROPIC_ values
 *   7. CLAUDE.md shows `claude --model <id>` for every model the agents use
 */

export const ARCHIVE_DIR = "docs/archive/";
export const REQUIRED_FILES = ["CLAUDE.md", "docs/INDEX.md", "docs/DECISIONS.md", "docs/plan/README.md", "saf.config.json"];
export const LINE_LIMITS = [
  [/^docs\/INDEX\.md$/, 150],
  [/(^|\/)CLAUDE\.md$/, 200],
];
const AGENT_DIRS = [".claude/rules/", ".claude/agents/", ".claude/commands/"];
const READ_TOOLS = new Set(["Read", "Grep", "Glob"]);
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const FULL_MODEL_ID = /^claude-[a-z]+(?:-\d+)+$/;
const SETTINGS_FILE = /(^|\/)\.claude\/settings(\.[\w-]+)?\.json$/;
const PM_BUILTINS = new Set(["install", "i", "ci", "add", "remove", "rm", "uninstall", "exec", "dlx", "create", "init", "update", "up", "upgrade", "outdated", "why", "list", "ls", "store", "publish", "pack", "link", "unlink", "rebuild", "audit", "config", "env", "help", "import", "prune", "patch", "setup", "x", "npx", "info", "view", "version", "-v", "--version", "set", "workspace", "workspaces"]);

const isVendor = (f) => f.includes("node_modules/") || f.startsWith(".claude/skills/") || f.startsWith(".claude/agent-memory/");

export function isAgentLoaded(f) {
  if (isVendor(f) || !f.endsWith(".md")) return false;
  return /(^|\/)CLAUDE\.md$/.test(f) || AGENT_DIRS.some((d) => f.startsWith(d)) || f === "docs/INDEX.md";
}

const inLinkScope = (f) => f.endsWith(".md") && !isVendor(f) && (/(^|\/)CLAUDE\.md$/.test(f) || AGENT_DIRS.some((d) => f.startsWith(d)) || (f.startsWith("docs/") && !f.startsWith(ARCHIVE_DIR)));

function buildIndex(files) {
  const set = new Set(files);
  const dirs = new Set([""]);
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return { files: set, dirs };
}

/** Script name a command line calls through the package manager, or null. */
export function scriptOf(line) {
  const words = line.trim().replace(/^[!(]+\s*/, "").split(/\s+/).filter((w) => !/^[A-Z_][A-Z0-9_]*=/.test(w));
  const [pm, ...rest] = words;
  if (!["pnpm", "npm", "yarn", "bun"].includes(pm ?? "")) return null;
  if (rest.some((w) => /^(-C|--dir|--prefix|--filter|-F|-w|--workspace|-r|--recursive)$/.test(w) || /^--(filter|dir|prefix|workspace)=/.test(w))) return null;
  const args = rest.filter((w) => !w.startsWith("-"));
  let name = args[0];
  if (name === "run" || name === "run-script") name = args[1];
  else if (pm === "npm" && !["test", "start", "stop", "restart", "t"].includes(name ?? "")) return null;
  else if (pm === "bun" && name !== "test") return null;
  if (!name || PM_BUILTINS.has(name)) return null;
  if (name === "t") name = "test";
  return name;
}

/**
 * @param {{files:string[], read:(rel:string)=>string, exists:(rel:string)=>boolean, scripts:Record<string,string>|null, config:object}} input
 */
export function runDocsCheck(input) {
  const issues = [];
  const warnings = [];
  const ix = buildIndex(input.files);
  const has = (rel) => ix.files.has(rel) || ix.dirs.has(rel) || input.exists(rel);
  for (const f of REQUIRED_FILES) if (!ix.files.has(f)) issues.push({ file: f, message: "missing (required by SAF)" });

  let links = 0;
  for (const file of input.files.filter(inLinkScope)) {
    for (const link of extractLinks(input.read(file))) {
      const target = localTarget(link.target);
      if (target === null) continue;
      links++;
      const resolved = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(file), target)).replace(/\/$/, "");
      if (resolved === ".." || resolved.startsWith("../")) issues.push({ file, line: link.line, message: `link leaves the repo: ${link.target}` });
      else if (!has(resolved === "." ? "" : resolved)) issues.push({ file, line: link.line, message: `broken link: ${link.target}` });
    }
  }

  let commands = 0;
  const allowMissing = [".claude/settings.local.json", ".saf/memory", ".saf-lane.json", input.config.workflow.worktreeDir, "docs/plan/evidence", "docs/archive"];
  const topLevel = new Set(input.files.map((f) => f.split("/")[0]));
  for (const file of input.files.filter(isAgentLoaded)) {
    const src = input.read(file);
    const lines = src.split(/\r?\n/).length;
    for (const [re, max] of LINE_LIMITS) if (re.test(file) && lines > max) issues.push({ file, message: `${lines} lines — limit ${max} (move detail to its topic home)` });
    const used = [...shellCommands(src).map((c) => ({ line: c.line, text: c.text }))];
    for (const { n, text } of src.split(/\r?\n/).map((t, i) => ({ n: i + 1, text: t }))) {
      for (const s of codeSpans(text)) used.push({ line: n, text: s.content });
    }
    for (const c of used) {
      for (const piece of c.text.split(/&&|\|\||;|\|/)) {
        const name = scriptOf(piece);
        if (!name) continue;
        commands++;
        if (input.scripts && !(name in input.scripts)) issues.push({ file, line: c.line, message: `script "${name}" does not exist in package.json` });
      }
    }
    src.split(/\r?\n/).forEach((text, i) => {
      for (const s of codeSpans(text)) {
        const p = s.content.trim();
        if (!/^\.?[\w-]+(?:\/[\w.@-]+)+\/?$/.test(p) || /[*{}<>]/.test(p)) continue;
        if (!topLevel.has(p.split("/")[0])) continue;
        const clean = p.replace(/\/$/, "");
        if (!has(clean) && !allowMissing.some((a) => clean === a || clean.startsWith(`${a}/`))) issues.push({ file, line: i + 1, message: `path in backticks does not exist: ${p}` });
      }
    });
    for (const { n, text } of proseLines(src)) {
      const m = text.match(/(^|[\s(])@[A-Za-z][\w./-]*/);
      if (m && !/[\w.-]@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), (m.index ?? 0) + 2))) issues.push({ file, line: n, message: `bare "${m[0].trim()}" outside backticks — Claude Code would import it as a file` });
    }
  }

  for (const file of input.files.filter((f) => f.startsWith(".claude/rules/") && f.endsWith(".md"))) {
    const fm = frontmatter(input.read(file));
    let paths = [];
    try {
      const data = fm ? parseYaml(fm.yaml) : {};
      paths = Array.isArray(data.paths) ? data.paths : typeof data.paths === "string" ? [data.paths] : [];
    } catch (e) {
      issues.push({ file, message: `frontmatter is not readable YAML (${e.message})` });
      continue;
    }
    if (!paths.length) {
      issues.push({ file, message: "needs a `paths:` list in frontmatter (path-scoped rule)" });
      continue;
    }
    const res = paths.map((p) => globToRegExp(p));
    if (!input.files.some((f) => res.some((re) => re.test(f)))) warnings.push({ file, message: `paths match no file yet (${paths.join(", ")})` });
  }

  const roles = roleTable(input.config);
  let agents = 0;
  const models = new Set();
  for (const r of roles) {
    const file = `.claude/agents/${r.name}.md`;
    if (!ix.files.has(file)) {
      issues.push({ file, message: `missing agent for enabled role "${r.name}"` });
      continue;
    }
    agents++;
    const fm = frontmatter(input.read(file));
    let data = {};
    try {
      data = fm ? parseYaml(fm.yaml) : {};
    } catch (e) {
      issues.push({ file, message: `frontmatter is not readable YAML (${e.message})` });
      continue;
    }
    if (data.name !== r.name) issues.push({ file, message: `name: must be "${r.name}" (the file name)` });
    if (typeof data.description !== "string" || !data.description.trim()) issues.push({ file, message: "description: is required (Claude routes work by it)" });
    if (typeof data.model !== "string" || !FULL_MODEL_ID.test(data.model)) issues.push({ file, message: `model: must be a full model id like ${r.model} (short names hide which model runs)` });
    else if (data.model !== r.model) issues.push({ file, message: `model: ${data.model} differs from saf.config.json (${r.model}) — re-run setup or set models.overrides` });
    else models.add(data.model);
    if (!EFFORTS.includes(data.effort)) issues.push({ file, message: `effort: must be one of ${EFFORTS.join("/")}` });
    if (r.readOnly) {
      const tools = typeof data.tools === "string" ? data.tools.split(",").map((t) => t.trim()).filter(Boolean) : [];
      if (!tools.length || tools.some((t) => !READ_TOOLS.has(t))) issues.push({ file, message: `read-only role must list only ${[...READ_TOOLS].join(", ")} in tools:` });
    }
  }

  for (const file of input.files.filter((f) => SETTINGS_FILE.test(f))) {
    const src = input.read(file);
    let json;
    try {
      json = JSON.parse(src);
    } catch {
      issues.push({ file, message: "not valid JSON" });
      continue;
    }
    if (json && typeof json === "object" && "env" in json) {
      const line = src.split(/\r?\n/).findIndex((l) => /"env"\s*:/.test(l)) + 1;
      issues.push({ file, line: line || undefined, message: "tracked settings must not have an env block — move it to .claude/settings.local.json (not tracked)" });
    }
    src.split(/\r?\n/).forEach((l, i) => {
      if (/ANTHROPIC_[A-Z_]+"\s*:/.test(l)) issues.push({ file, line: i + 1, message: "ANTHROPIC_ value in a tracked settings file (value not shown)" });
    });
  }

  if (ix.files.has("CLAUDE.md")) {
    const root = input.read("CLAUDE.md");
    for (const m of models) if (!root.includes(`claude --model ${m}`)) issues.push({ file: "CLAUDE.md", message: `no \`claude --model ${m}\` line (how to open a session per role)` });
  }
  return { issues, warnings, stats: { markdown: input.files.filter((f) => f.endsWith(".md") && !isVendor(f)).length, links, commands, agents } };
}

export function docsInputFor(root, files, config) {
  let scripts = null;
  if (existsSync(join(root, "package.json"))) {
    try {
      scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
    } catch {
      scripts = {};
    }
  }
  return { files, read: (rel) => readFileSync(join(root, rel), "utf8"), exists: (rel) => existsSync(join(root, rel)), scripts, config };
}
