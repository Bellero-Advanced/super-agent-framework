import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative } from "node:path";
import { CONFIG_FILE, CORE_SKILLS, ENGINE_SCRIPTS, LOCAL_CONFIG_FILE, MODEL_PRESETS, SAF_DIR, resolveConfig, roleTable, scriptCommand, validateConfig } from "./config.mjs";
import { detectProject } from "./detect.mjs";
import { unifiedDiff } from "./diff.mjs";
import { scriptOf } from "./docs.mjs";
import { FRICTION_FILE } from "./friction.mjs";
import { loadPlan } from "./plan.mjs";
import { generatedFiles } from "./task.mjs";
import { render } from "./template.mjs";
import { languageName, textFor } from "./text.mjs";

/**
 * Generator — turns setup answers into the full project system:
 * CLAUDE.md · docs/INDEX.md · docs/DECISIONS.md · docs/plan/ (README, M0 gate, first card, optional M1 draft) ·
 * .claude/agents · .claude/commands (/saf · /saf-plan) · .claude/rules · skills (core + chosen packs) · settings.json hooks · package scripts.
 *
 * Safety: a file that exists and was not written by SAF (or was edited since) is moved to docs/archive/ before
 * it is replaced. `.saf/manifest.json` records what SAF wrote. settings.json · .gitignore · package.json are merged, not replaced.
 */

export const TEMPLATES = join(SAF_DIR, "templates");
export const MANIFEST = ".saf/manifest.json";
export const ARCHIVE = "docs/archive/pre-saf";
export const SAF_VERSION = () => readFileSync(join(SAF_DIR, "VERSION"), "utf8").trim();

const sha = (s) => createHash("sha1").update(s).digest("hex");
/** Text as SAF wrote it: a checkout that converted line endings to CRLF is still "unchanged". */
const readText = (abs) => readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
/** Templates are stored with LF; a checkout with CRLF line endings must render the same bytes. */
const readTemplate = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
export const COMMANDS = ["saf", "saf-plan"];
/** Agent-facing folders SAF owns files in — a file SAF wrote there that is no longer planned is removed when unedited. */
/** Files the team keeps writing in after setup: a re-run keeps them when edited (a trailing "/" = everything under that folder). */
export const LIVING_FILES = ["docs/DECISIONS.md", "docs/INDEX.md", "docs/plan/milestones/", "docs/plan/tasks/"];
const isLiving = (rel) => LIVING_FILES.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p));

const OWNED_DIRS = [".claude/commands/", ".claude/skills/", ".claude/agents/", ".claude/rules/"];
/** Skills shipped in this project: core + chosen packs (one skill per pack). */
export const skillsFor = (config) => [...CORE_SKILLS, ...config.skills.packs];
const TYPE_LABEL = { "web-app": "web app / SaaS", mobile: "mobile app", game: "game", api: "API / backend", erp: "ERP / business system", "data-ai": "data / AI", "library-cli": "library / CLI", other: "other" };

function readJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Which rule templates apply, with their `paths:` globs. */
function ruleSet(config, detected) {
  const t = config.project.type;
  const lang = detected.languages;
  const testGlobs = ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.py", "**/*_test.go", "tests/**", "test/**", "e2e/**"];
  const rules = [
    { name: "tests", paths: testGlobs },
    { name: "plan-files", paths: ["docs/plan/**", "docs/specs/**"] },
    { name: "secrets-config", paths: [".claude/settings*.json", "**/*.env*", "**/config/**", ".github/workflows/**", "**/wrangler.*", "**/docker-compose*.yml"] },
  ];
  const ui = ["web-app", "mobile", "game", "erp"].includes(t) || config.people.i18nRequired;
  if (ui) rules.push({ name: "ui", paths: ["src/**/*.{tsx,jsx,vue,svelte,astro,html,css,scss}", "app/**/*.{tsx,jsx,vue,svelte}", "client/**", "web/**", "components/**", "pages/**"] });
  if (["web-app", "api", "game", "erp", "mobile"].includes(t)) rules.push({ name: "server-authority", paths: ["server/**", "api/**", "src/server/**", "src/api/**", "src/routes/**", "functions/**", "workers/**", "backend/**"] });
  if (config.stack.database && config.stack.database !== "none") rules.push({ name: "database", paths: ["**/migrations/**", "supabase/**", "prisma/**", "drizzle/**", "db/**", "src/db/**", "server/db/**"] });
  if (lang.includes("Python") && !rules.some((r) => r.name === "tests")) rules.push({ name: "tests", paths: testGlobs });
  return rules;
}

function sessionRows(roles, docLang) {
  const by = new Map();
  for (const r of roles) {
    const row = by.get(r.model) ?? { model: r.model, roles: [], tiers: new Set() };
    row.roles.push(r.name);
    row.tiers.add(r.tier);
    by.set(r.model, row);
  }
  const labels = textFor(docLang).sessionWork;
  const work = (tiers) => {
    const planner = tiers.has("planner");
    const builder = tiers.has("builder");
    return planner && builder ? labels.both : planner ? labels.planner : labels.builder;
  };
  return [...by.values()].map((r) => ({ model: r.model, roles: r.roles.map((n) => `\`${n}\``).join(" · "), work: work(r.tiers) }));
}

/** Align trailing `# comments` inside ```bash blocks so command lists read as a table. */
export function alignShellComments(md) {
  return md.replace(/(```(?:bash|sh)\n)([\s\S]*?)(```)/g, (_, open, body, close) => {
    const lines = body.split("\n");
    const split = lines.map((l) => l.match(/^(\S.*?)\s{2,}(# .*)$/));
    const width = Math.max(0, ...split.filter(Boolean).map((m) => m[1].length));
    return open + lines.map((l, i) => (split[i] ? `${split[i][1].padEnd(width + 2)}${split[i][2]}` : l)).join("\n") + close;
  });
}

export function templateData(config, detected, opts = {}) {
  const pm = config.stack.packageManager;
  const c = (s, a) => scriptCommand(pm, s, a);
  const roles = roleTable(config);
  const scripts = opts.scripts ?? null;
  const ready = (cmd) => {
    if (!cmd) return false;
    const name = scriptOf(cmd);
    return !name || !scripts || name in scripts || Object.keys(ENGINE_SCRIPTS).includes(name);
  };
  const projectCommands = ["typecheck", "lint", "test", "e2e", "build"]
    .map((key) => ({ key, cmd: config.stack.commands[key] }))
    .filter((x) => x.cmd)
    .map((x) => ({ ...x, ready: ready(x.cmd) }));
  const projectChecks = projectCommands.filter((x) => x.ready && x.key !== "e2e").map((x) => x.cmd);
  const dl = config.people.docLanguage;
  const goal = config.firstMilestone.goal.trim();
  // first sentence: a line break, "。", or a dot followed by a space or the end ("v0.1.0" stays whole)
  const firstLine = goal.split(/\n|。|\.(?=\s|$)/)[0].trim();
  // long goals are cut at a word boundary, never mid-word
  const m1Title = (firstLine.length > 80 ? `${firstLine.slice(0, 80).replace(/\s+\S*$/, "")}…` : firstLine) || "First milestone";
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const presetName = { max: "Max", balanced: "Balanced", economy: "Economy", custom: "Custom" }[config.models.preset];
  return {
    ...config,
    saf: { version: opts.version ?? "" },
    owner: config.people.ownerTitle,
    today,
    typeLabel: TYPE_LABEL[config.project.type],
    docLanguageName: languageName(dl, dl),
    chatLanguageName: languageName(config.people.chatLanguage, dl),
    reportLanguageName: languageName(config.roles.reportLanguage, dl),
    uiLanguagesText: config.people.uiLanguages.join(", "),
    presetName,
    presetIsStandard: !!MODEL_PRESETS[config.models.preset],
    roles,
    coreRoles: roles.filter((r) => ["designer", "spec-reviewer", "implementer", "qa-runner"].includes(r.name)),
    extraRoles: roles.filter((r) => !["designer", "spec-reviewer", "implementer", "qa-runner"].includes(r.name)),
    roleNames: roles.map((r) => r.name).join(", "),
    skillNamesText: skillsFor(config).map((n) => `\`${n}\``).join(" · "),
    hasRole: Object.fromEntries(roles.map((r) => [r.name.replace(/-/g, "_"), true])),
    sessionRows: sessionRows(roles, dl),
    projectCommands,
    readyCommands: projectCommands.filter((x) => x.ready),
    pendingCommands: projectCommands.filter((x) => !x.ready),
    projectChecks,
    projectChecksYaml: JSON.stringify(projectChecks),
    mergeChecksText: config.workflow.mergeChecks.map((x) => `\`${x}\``).join(" · "),
    envFilesText: config.policies.secrets.envFiles.map((x) => `\`${x}\``).join(" · "),
    dontTouchYaml: JSON.stringify([...new Set([...config.policies.forbiddenPaths, ...config.policies.ownerOnlyPaths])]),
    reviewEvery: config.workflow.review !== "m-cards",
    reviewSecurity: config.workflow.review === "every-card+security",
    lanesOn: config.workflow.worktrees && config.workflow.lanes.code > 0,
    sideOn: config.workflow.sideLanes.enabled,
    measureOn: config.workflow.measure.enabled,
    deployOwner: config.policies.deploy.mode === "owner-order",
    deployNone: config.policies.deploy.mode === "none",
    pushOwner: config.policies.push === "owner-order",
    m1: goal ? { goal, titleYaml: JSON.stringify(m1Title) } : null,
    sizeS: config.workflow.sizes.S,
    sizeM: config.workflow.sizes.M,
    testS: config.workflow.testCaps.S,
    testM: config.workflow.testCaps.M,
    pmNpm: pm === "npm",
    pmNone: pm === "none",
    detected,
    cmd: {
      taskStart: c("task:start", "<id>"),
      taskStartLane: c("task:start", "<id> --worktree"),
      taskVerify: c("task:verify", "<id>"),
      taskVerifyM: c("task:verify", "<M>"),
      taskAbandon: c("task:abandon", "<id>"),
      taskMerge: c("task:merge", "<id>"),
      taskReview: c("task:review", "<id> pass|fail [--kind <k>[,<k>…]] [--note <text>] [--area <area>]"),
      taskState: c("task:state"),
      taskStateCheck: c("task:state", "--check"),
      taskNext: c("task:next", "--parallel"),
      taskProbe: c("task:probe"),
      taskEnv: c("task:env"),
      taskReport: c("task:report", "<M>"),
      taskCulprit: c("task:culprit", "<M>"),
      taskPrerun: c("task:prerun", "<id>"),
      taskFriction: c("task:friction"),
      taskFrictionAdd: c("task:friction", "add --kind <kind> --area <area> --evidence <text> <summary>"),
      taskFrictionClose: c("task:friction", "close <F-id> carded|fixed|dropped <card id or reason>"),
      docsCheck: c("docs:check"),
      specMatrix: c("spec:matrix"),
      specMatrixCheck: c("spec:matrix", "--check"),
      checkSecrets: c("check-secrets"),
      measure: c("measure", "<command>"),
      measureStatus: c("measure", "--status"),
      startM0: c("task:start", "T-M0-01"),
      verifyM0card: c("task:verify", "T-M0-01"),
      verifyM0: c("task:verify", "M0"),
    },
  };
}

/** A document is read from templates/<lang>/, or from templates/en/ when that folder lacks it (`fallback` then names the missing path). */
function docTemplate(lang, p) {
  const own = join(TEMPLATES, lang, p);
  if (existsSync(own)) return { src: own };
  return { src: join(TEMPLATES, "en", p), fallback: `templates/${lang}/${p}` };
}

/** The warning of a document that fell back to English (setup report and dry run). */
const fallbackWarning = (f, lang) => `${f.fallback} is missing — the English template is used for document language "${lang}"`;

function plannedFiles(config, data, detected) {
  const lang = config.people.docLanguage;
  const L = (p) => docTemplate(lang, p);
  const files = [
    [L("CLAUDE.template.md"), "CLAUDE.md"],
    [L("docs/INDEX.md"), "docs/INDEX.md"],
    [L("docs/DECISIONS.md"), "docs/DECISIONS.md"],
    [L("docs/plan/README.md"), "docs/plan/README.md"],
    [L("docs/plan/milestones/M0.md"), "docs/plan/milestones/M0.md"],
    [L("docs/plan/tasks/T-M0-01.md"), "docs/plan/tasks/M0/T-M0-01.md"],
    [L("docs/plan/tasks/_template.md"), "docs/plan/tasks/_template.md"],
    [L("docs/specs/_template.md"), "docs/specs/_template.md"],
  ];
  if (data.m1) files.push([L("docs/plan/milestones/M1.md"), "docs/plan/milestones/M1.md"]);
  for (const name of COMMANDS) files.push([L(`commands/${name}.md`), `.claude/commands/${name}.md`]);
  const out = files.map(([tpl, dest]) => ({ dest, content: alignShellComments(render(readTemplate(tpl.src), data)), ...(tpl.fallback && { fallback: tpl.fallback }) }));
  for (const role of data.roles) {
    const src = role.custom ? join(TEMPLATES, "agents", "_custom.md") : join(TEMPLATES, "agents", `${role.name}.md`);
    out.push({ dest: `.claude/agents/${role.name}.md`, content: render(readTemplate(src), { ...data, role: { ...role, summaryYaml: JSON.stringify(role.summary || role.name) } }) });
  }
  for (const rule of ruleSet(config, detected)) {
    out.push({ dest: `.claude/rules/${rule.name}.md`, content: render(readTemplate(join(TEMPLATES, "rules", `${rule.name}.md`)), { ...data, rulePathsYaml: rule.paths.map((p) => `  - ${JSON.stringify(p)}`).join("\n") }) });
  }
  out.push(...skillFiles(config, data));
  return out;
}

/** Skill files rendered with the project's data (commands, languages) — core skills + chosen packs. */
function skillFiles(config, data) {
  const out = [];
  for (const skill of skillsFor(config)) {
    const dir = join(TEMPLATES, "skills", skill);
    for (const f of walk(dir)) {
      const rel = relative(dir, f).split("\\").join("/");
      const raw = readTemplate(f);
      out.push({ dest: `.claude/skills/${skill}/${rel}`, content: rel.endsWith(".md") ? render(raw, data) : raw, kit: true });
    }
  }
  return out;
}

/** The reasons shown next to each action (data, so the dry run and the report say the same words). */
const REASONS = {
  create: "missing",
  same: "already what SAF would write",
  update: "SAF wrote it, nobody edited it — new content",
  "replace-edited": `edited, or not written by SAF — moved to ${ARCHIVE}/ and replaced`,
  "keep-edited": "edited living file — kept, the new settings do not reach it",
  "keep-asked": "kept as you asked (--keep) — the new settings do not reach it",
  remove: "no longer shipped, unedited — removed",
  "keep-unplanned": "no longer shipped, but edited in this project — kept",
  adopt: "existing file SAF did not write — moved aside first",
};

/** Where a file would be archived: the first free name, counting the moves already planned in this plan. */
function archiveDest(root, rel, taken) {
  let dest = `${ARCHIVE}/${rel}`;
  for (let n = 1; existsSync(join(root, dest)) || taken.has(dest); n++) dest = `${ARCHIVE}/${rel}.${n}`;
  taken.add(dest);
  return dest;
}

function moveAside(root, rel, to) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  renameSync(join(root, rel), join(root, to));
}

/**
 * Files SAF wrote earlier under OWNED_DIRS that are no longer planned (a dropped command, role, rule or skill pack):
 * `remove` when nobody edited them since, `keep-unplanned` when edited, `forget` when the file is already gone (only the
 * manifest entry goes). Files SAF never wrote are never touched. Computes only.
 */
function planRetire(root, files, plannedDests) {
  const out = [];
  for (const [rel, hash] of Object.entries(files)) {
    if (plannedDests.has(rel) || !OWNED_DIRS.some((d) => rel.startsWith(d))) continue;
    const abs = join(root, rel);
    const action = !existsSync(abs) ? "forget" : sha(readText(abs)) !== hash ? "keep-unplanned" : "remove";
    out.push({ path: rel, action, reason: REASONS[action] ?? "recorded, but the file is gone" });
  }
  return out;
}

/** Performs a `planRetire` result: removes the files, drops their entries from `files`, reports kept ones. */
function applyRetire(root, entries, files, report) {
  for (const e of entries) {
    if (e.action === "keep-unplanned") {
      report.kept.push(keptLine(e));
      continue;
    }
    delete files[e.path];
    if (e.action !== "remove") continue;
    const abs = join(root, e.path);
    rmSync(abs);
    report.removed.push(e.path);
    const dir = dirname(abs);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
}

/** One shape for the plan (plain path + reason); the real report keeps its text: the reason in brackets after a no-longer-shipped file. */
const keptLine = (e) => (e.action === "keep-unplanned" ? `${e.path} (${e.reason})` : e.path);

const SETTINGS_HOOKS = {
  SessionStart: 'cd "$CLAUDE_PROJECT_DIR" && node tools/saf/bin/saf.mjs hook session-start',
  Stop: 'cd "$CLAUDE_PROJECT_DIR" && node tools/saf/bin/saf.mjs hook check-stop',
};
const SETTINGS = ".claude/settings.json";
const SETTINGS_LOCAL = ".claude/settings.local.json";

/** Unreadable: not valid JSON (`undefined` here) or valid JSON whose root is not an object. */
const unreadable = (json) => json === undefined || json === null || typeof json !== "object" || Array.isArray(json);
const NOT_READ = Symbol("not-read");
/** An `env` value setup can merge: a plain JSON object. */
const mergeable = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** `.claude/settings.json` merge as data: hooks to add, the env block that moves, the new texts. Computes only. */
function planSettings(root, taken, report) {
  const file = join(root, SETTINGS);
  const read = readJson(file, existsSync(file) ? NOT_READ : {});
  const cur = read === NOT_READ ? undefined : read;
  let archivedTo = null;
  if (existsSync(file) && unreadable(cur)) {
    report.warnings.push(`${SETTINGS} is not valid JSON — archived and replaced`);
    archivedTo = archiveDest(root, SETTINGS, taken);
  }
  const s = unreadable(cur) ? {} : cur;
  let localText = null;
  let localArchivedTo = null;
  let archivedWhy = archivedTo ? "not valid JSON" : null;
  let localArchivedWhy = null;
  if (Object.hasOwn(s, "env") && !mergeable(s.env)) {
    archivedTo ??= archiveDest(root, SETTINGS, taken);
    archivedWhy = "env is not a JSON object";
    delete s.env;
    report.warnings.push(`${SETTINGS} env is not a JSON object — archived to ${archivedTo}; nothing was moved to ${SETTINGS_LOCAL}`);
  } else if (Object.hasOwn(s, "env")) {
    const localFile = join(root, SETTINGS_LOCAL);
    let local = readJson(localFile, existsSync(localFile) ? NOT_READ : {});
    if (local === NOT_READ || unreadable(local)) {
      localArchivedTo = archiveDest(root, SETTINGS_LOCAL, taken);
      localArchivedWhy = "not valid JSON";
      report.warnings.push(`${SETTINGS_LOCAL} is not valid JSON — archived to ${localArchivedTo} and replaced by the moved env block`);
      local = {};
    } else if (Object.hasOwn(local, "env") && !mergeable(local.env)) {
      localArchivedTo = archiveDest(root, SETTINGS_LOCAL, taken);
      localArchivedWhy = "env is not a JSON object";
      report.warnings.push(`${SETTINGS_LOCAL} env is not a JSON object — archived to ${localArchivedTo}; its other keys stay, env is now the block moved from ${SETTINGS}`);
      delete local.env;
    }
    const mine = local.env ?? {};
    const clash = Object.keys(s.env).filter((k) => Object.hasOwn(mine, k) && JSON.stringify(mine[k]) !== JSON.stringify(s.env[k])).length;
    if (clash) {
      archivedTo ??= archiveDest(root, SETTINGS, taken);
      archivedWhy = "env values differ from .claude/settings.local.json";
      report.warnings.push(`${clash} env key(s) set in both files with different values — kept the values of ${SETTINGS_LOCAL}; the values of ${SETTINGS} are in ${archivedTo}`);
    }
    local.env = { ...s.env, ...mine };
    localText = `${JSON.stringify(local, null, 2)}\n`;
    delete s.env;
    report.warnings.push(`moved the env block of ${SETTINGS} into ${SETTINGS_LOCAL} (not tracked) — values were not printed`);
  }
  s.hooks ??= {};
  const hooks = [];
  for (const [event, command] of Object.entries(SETTINGS_HOOKS)) {
    const groups = (s.hooks[event] ??= []);
    if (groups.some((g) => (g.hooks ?? []).some((h) => h.command === command))) continue;
    groups.push({ hooks: [{ type: "command", command, timeout: 30 }] });
    hooks.push(event);
  }
  const text = `${JSON.stringify(s, null, 2)}\n`;
  const action = archivedTo ? "update" : actionFor(file, text);
  report.written.push(`${SETTINGS} (merged)`);
  return { action, hooks, envMoved: localText !== null, text, localText, archivedTo, archivedWhy, localArchivedTo, localArchivedWhy };
}

/** create / same / update for a whole-file write, compared as LF text. */
function actionFor(abs, text) {
  if (!existsSync(abs)) return "create";
  return readText(abs) === text.replace(/\r\n/g, "\n") ? "same" : "update";
}

export const GITIGNORE_LINES = [".claude/settings.local.json", `${ARCHIVE}/${SETTINGS_LOCAL}*`, `${ARCHIVE}/${SETTINGS}*`, ".saf-lane.json", LOCAL_CONFIG_FILE, ".saf/memory/", `${FRICTION_FILE}.lock`, ".env", ".env.local", ".env.*.local"];

/** The `.gitignore` merge as data: the lines to add and the new text (`text: null` when nothing is missing). */
function planGitignore(root, config) {
  const file = join(root, ".gitignore");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const want = [...GITIGNORE_LINES, `${config.workflow.worktreeDir.replace(/\/$/, "")}/`, ...config.policies.secrets.envFiles];
  const add = [...new Set(want)].filter((l) => !have.has(l));
  if (!add.length) return { add, text: null };
  return { add, text: `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${cur ? "\n" : ""}# SAF\n${add.join("\n")}\n` };
}

export function mergeGitignore(root, config, report) {
  const { text } = planGitignore(root, config);
  if (text === null) return;
  writeFileSync(join(root, ".gitignore"), text);
  report?.written.push(".gitignore (merged)");
}

/** The package.json scripts SAF wants for a resolved config — the one list setup and upgrade share. */
export function engineScripts(config) {
  const want = { saf: "node tools/saf/bin/saf.mjs" };
  for (const [script, sub] of Object.entries(ENGINE_SCRIPTS)) {
    if (script === "measure" && !config.workflow.measure.enabled) continue;
    want[script] = `node tools/saf/bin/saf.mjs ${sub}`;
  }
  return want;
}

/**
 * The one package.json script merge — setup and `saf upgrade` both call it. Adds the scripts in `want` that are missing,
 * never changes an existing one, and returns the new text only when something was added (`text: null` otherwise, so the
 * caller leaves the file byte-identical). Keeps the byte-order mark, indentation, line endings and trailing newline.
 * @returns {{text:string|null, added:string[], kept:string[], scripts:object|null, invalid:boolean}}
 */
export function mergeScriptsText(text, want) {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = text.slice(bom.length);
  let pkg = null;
  try {
    pkg = JSON.parse(body);
  } catch {}
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return { text: null, added: [], kept: [], scripts: null, invalid: true };
  if (!pkg.scripts || typeof pkg.scripts !== "object" || Array.isArray(pkg.scripts)) pkg.scripts = {};
  const added = [];
  const kept = [];
  for (const [name, value] of Object.entries(want)) {
    if (pkg.scripts[name] === undefined) {
      pkg.scripts[name] = value;
      added.push(name);
    } else if (pkg.scripts[name] !== value) kept.push(name);
  }
  if (!added.length) return { text: null, added, kept, scripts: pkg.scripts, invalid: false };
  const indent = body.match(/^([ \t]+)\S/m)?.[1] ?? 2;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const tail = /\r?\n$/.test(body) ? eol : "";
  return { text: `${bom}${JSON.stringify(pkg, null, indent).replace(/\n/g, eol)}${tail}`, added, kept, scripts: pkg.scripts, invalid: false };
}

/** Setup's package.json step as data: create the file when missing, otherwise write only when a script is added. */
function planPackageJson(root, config, report) {
  const none = { state: "none", added: [], kept: [], text: null, scripts: null };
  if (config.stack.packageManager === "none") return none;
  const file = join(root, "package.json");
  const name = config.project.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const exists = existsSync(file);
  const text = exists ? readFileSync(file, "utf8") : `${JSON.stringify({ name, private: true }, null, 2)}\n`;
  const want = engineScripts(config);
  const res = mergeScriptsText(text, want);
  if (res.invalid) {
    report.warnings.push("package.json is not valid JSON — scripts were not added (see docs/plan/README.md for the commands)");
    return { ...none, state: "invalid" };
  }
  for (const k of res.kept) report.warnings.push(`package.json already has a different "${k}" script — kept yours; SAF docs assume "${want[k]}"`);
  if (res.text !== null) report.written.push("package.json (scripts merged)");
  return { state: !exists ? "create" : res.text !== null ? "update" : "same", added: res.added, kept: res.kept, text: res.text, scripts: res.scripts };
}

/**
 * The status files as they will be once the plan is applied. loadPlan reads a folder, and the dry run may not write the
 * project — so the post-apply `docs/plan/` is mirrored in a scratch folder outside the project (removed at once).
 */
function planStatus(root, config, writes, moved) {
  const scratch = mkdtempSync(join(tmpdir(), "saf-plan-"));
  const put = (rel, bytes) => {
    mkdirSync(dirname(join(scratch, rel)), { recursive: true });
    writeFileSync(join(scratch, rel), bytes);
  };
  try {
    for (const abs of walk(join(root, "docs/plan"))) {
      const rel = relative(root, abs).split("\\").join("/");
      if (!moved.has(rel) && lstatSync(abs).isFile()) put(rel, readFileSync(abs)); // loadPlan ignores links, so the copy does too
    }
    for (const [rel, content] of writes) if (rel.startsWith("docs/plan/")) put(rel, content);
    if (existsSync(join(root, ".gitmodules"))) put(".gitmodules", readFileSync(join(root, ".gitmodules")));
    return loadPlan(scratch, config);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A path as `--keep` may give it: forward slashes, no "./" or "a/../", relative to the project root. */
export function keepPath(root, p) {
  const raw = String(p).trim();
  const rel = isAbsolute(raw) ? relative(root, raw) : raw;
  return posix.normalize(rel.split("\\").join("/"));
}

/**
 * Matches the `--keep` paths with the planned rendered files (exact, else the one file that differs only in letter case) and
 * returns the set of planned paths to keep. A path that is not planned, or whose file is missing, is an error naming it.
 */
function resolveKeep(root, keepAsked, files) {
  const planned = files.map((f) => f.dest);
  const found = new Set();
  const bad = [];
  for (const [norm, typed] of keepAsked) {
    const hits = planned.includes(norm) ? [norm] : planned.filter((d) => d.toLowerCase() === norm.toLowerCase());
    if (hits.length !== 1) bad.push(`--keep ${typed}: not a file setup plans to write`);
    else if (!existsSync(join(root, hits[0]))) bad.push(`--keep ${typed}: ${hits[0]} does not exist yet, so there is nothing to keep`);
    else found.add(hits[0]);
  }
  if (bad.length) throw Object.assign(new Error(bad.join("\n")), { code: "SETUP_KEEP" });
  return found;
}

/**
 * Computes everything a setup run would do and writes nothing (no file, folder, manifest or `.saf/`).
 * Returns the per-file `actions` (create · same · update · replace-edited · keep-edited · remove · keep-unplanned, each with
 * a reason), the `merges` as data, the `report` the real run returns, and the resolved `config`. `applySetup` performs it.
 * @param {string} root project folder
 * @param {object} answers partial or full config
 * @param {{now?:Date, adopt?:boolean, keep?:string[]}} opts `keep`: paths to keep as they are (a planned rendered file, not written, manifest entry unchanged)
 */
export function planSetup(root, answers, opts = {}) {
  const errors = validateConfig(answers);
  if (errors.length) throw new Error(["setup answers are invalid:", ...errors.map((e) => `  ✗ ${e}`)].join("\n"));
  const detected = detectProject(root);
  const report = { written: [], archived: [], kept: [], removed: [], warnings: [] };
  const manifest = readJson(join(root, MANIFEST), { files: {} });
  const ownedUnchanged = (rel) => {
    const abs = join(root, rel);
    return manifest.files[rel] && existsSync(abs) && sha(readText(abs)) === manifest.files[rel];
  };
  // a project SAF already set up (manifest present) is a re-run: never archive in bulk, only replace files one by one
  const rerun = existsSync(join(root, MANIFEST));
  const adopt = !rerun && (opts.adopt ?? detected.adopt);
  const keepAsked = new Map((opts.keep ?? []).map((p) => [keepPath(root, p), p])); // normalised path → as the person typed it
  const keptLower = new Set([...keepAsked.keys()].map((k) => k.toLowerCase())); // a kept file is not moved aside by adopt
  const taken = new Set();
  const archiveLine = (rel, to) => `${rel} → ${to}`;

  // 1. adopt: pre-existing agent docs and plan files that SAF did not write move into the archive
  const adoptMoves = [];
  if (adopt) {
    for (const dir of [".claude/agents", ".claude/commands", ".claude/rules", "docs/plan"]) {
      for (const abs of walk(join(root, dir))) {
        const rel = relative(root, abs).split("\\").join("/");
        if (manifest.files[rel] || keptLower.has(rel.toLowerCase())) continue;
        const to = archiveDest(root, rel, taken);
        adoptMoves.push({ path: rel, to, reason: REASONS.adopt });
        report.archived.push(archiveLine(rel, to));
      }
    }
  }
  const moved = new Set(adoptMoves.map((a) => a.path));

  // 2. config + package scripts first (templates need to know which scripts exist)
  let config = resolveConfig(answers);
  const gitignore = planGitignore(root, config);
  if (gitignore.text !== null) report.written.push(".gitignore (merged)");
  const packageJson = planPackageJson(root, config, report);
  const scripts = packageJson.scripts;
  if (answers.workflow?.mergeChecks === undefined || answers.workflow?.mergeChecks === null) {
    config.workflow.mergeChecks = config.workflow.mergeChecks.filter((cmd) => {
      const name = scriptOf(cmd);
      return !name || !scripts || name in scripts;
    });
  }
  const stored = JSON.parse(JSON.stringify(config));
  stored.$schema = "tools/saf/schema/saf.config.schema.json";
  const ordered = { $schema: stored.$schema, ...stored };
  const configText = `${JSON.stringify(ordered, null, 2)}\n`;
  config = resolveConfig(ordered);
  report.written.push(CONFIG_FILE);

  // 3. rendered files: one action each
  const data = templateData(config, detected, { now: opts.now, scripts, version: SAF_VERSION() });
  const files = plannedFiles(config, data, detected);
  for (const f of files) if (f.fallback) report.warnings.push(fallbackWarning(f, config.people.docLanguage));
  const asked = resolveKeep(root, keepAsked, files);
  const next = { version: SAF_VERSION(), files: {} };
  const actions = [];
  for (const f of files) {
    const abs = join(root, f.dest);
    const present = existsSync(abs) && !moved.has(f.dest);
    if (present && !statSync(abs).isFile()) throw new Error(`${f.dest} is a folder — SAF plans a file there`);
    let action = "create";
    let to;
    let current;
    if (moved.has(f.dest)) {
      action = "replace-edited"; // already moved aside by the adopt step
      current = readText(abs);
    } else if (present) {
      const cur = readText(abs);
      current = cur;
      const edited = cur !== f.content && !ownedUnchanged(f.dest);
      action = asked.has(f.dest) ? "keep-edited" : cur === f.content ? "same" : !edited ? "update" : rerun && isLiving(f.dest) ? "keep-edited" : "replace-edited";
      if (action === "replace-edited") {
        to = archiveDest(root, f.dest, taken);
        report.archived.push(archiveLine(f.dest, to));
      }
    }
    const reason = moved.has(f.dest) ? REASONS.adopt : asked.has(f.dest) ? REASONS["keep-asked"] : REASONS[action];
    const showsCurrent = current !== undefined && action !== "same";
    actions.push({ path: f.dest, action, reason, content: f.content, ...(showsCurrent ? { current } : {}), ...(to ? { to } : {}) });
    if (action === "keep-edited") {
      // the team's own working file: keep its old manifest entry so the next run still sees it as edited
      if (manifest.files[f.dest]) next.files[f.dest] = manifest.files[f.dest];
      report.kept.push(f.dest);
      report.warnings.push(asked.has(f.dest) ? `${f.dest} kept as you asked (--keep) — the new settings did not reach it` : `${f.dest} has your edits — kept, the new settings did not reach it`);
      continue;
    }
    next.files[f.dest] = sha(f.content);
    report.written.push(f.dest);
  }
  const retire = planRetire(root, manifest.files, new Set(files.map((f) => f.dest))).filter((e) => e.action !== "forget");
  actions.push(...retire);
  for (const e of retire) if (e.action === "keep-unplanned") report.kept.push(keptLine(e));
  for (const e of retire) if (e.action === "remove") report.removed.push(e.path);
  const settings = planSettings(root, taken, report);
  if (settings.archivedTo) report.archived.push(archiveLine(SETTINGS, settings.archivedTo));
  if (settings.localArchivedTo) report.archived.push(archiveLine(SETTINGS_LOCAL, settings.localArchivedTo));

  // 4. generated status files (and the evidence folder's .gitkeep), as they will be after the apply
  const writes = new Map(actions.filter((a) => a.content !== undefined && a.action !== "keep-edited").map((a) => [a.path, a.content]));
  const status = [];
  const keepFile = join(root, "docs/plan/evidence/.gitkeep");
  const keepThere = existsSync(keepFile) && !moved.has("docs/plan/evidence/.gitkeep");
  const keepText = keepThere ? readFileSync(keepFile, "utf8") : "";
  status.push({ path: "docs/plan/evidence/.gitkeep", action: keepThere ? "same" : "create", content: keepText });
  next.files["docs/plan/evidence/.gitkeep"] = sha(keepText);
  const plan = planStatus(root, config, writes, moved);
  for (const issue of plan.issues) report.warnings.push(`plan: ${issue}`);
  for (const [rel, content] of generatedFiles(plan)) {
    const abs = join(root, rel);
    const there = existsSync(abs) && !moved.has(rel);
    const same = there && readText(abs) === content.replace(/\r\n/g, "\n");
    status.push({ path: rel, action: !there ? "create" : same ? "same" : "update", content });
    if (rel === "docs/plan/STATE.md") next.files[rel] = sha(same ? readFileSync(abs, "utf8") : content);
  }
  const manifestText = `${JSON.stringify(next, null, 2)}\n`;
  const manifestAction = actionFor(join(root, MANIFEST), manifestText);
  return {
    config,
    detected,
    rerun,
    adopt,
    actions,
    report,
    merges: {
      adopt: adoptMoves,
      gitignore,
      packageJson,
      config: { action: actionFor(join(root, CONFIG_FILE), configText), text: configText, current: existsSync(join(root, CONFIG_FILE)) ? readText(join(root, CONFIG_FILE)) : undefined },
      settings,
      status,
      manifest: { action: manifestAction, text: manifestText },
    },
  };
}

const writeAt = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

/** Performs a `planSetup` result, in the order the old generate() did, and returns the report the plan announced. */
export function applySetup(root, plan) {
  const m = plan.merges;
  const report = JSON.parse(JSON.stringify(plan.report));
  for (const a of m.adopt) moveAside(root, a.path, a.to);
  if (m.gitignore.text !== null) writeFileSync(join(root, ".gitignore"), m.gitignore.text);
  if (m.packageJson.text !== null) writeFileSync(join(root, "package.json"), m.packageJson.text);
  writeFileSync(join(root, CONFIG_FILE), m.config.text);
  for (const a of plan.actions) {
    if (a.content === undefined || a.action === "keep-edited") continue;
    if (a.to) moveAside(root, a.path, a.to);
    writeAt(root, a.path, a.content);
  }
  applyRetire(root, plan.actions.filter((a) => a.content === undefined), {}, { kept: [], removed: [] });
  const s = m.settings;
  if (s.localArchivedTo) moveAside(root, SETTINGS_LOCAL, s.localArchivedTo);
  if (s.localText !== null) writeAt(root, SETTINGS_LOCAL, s.localText);
  if (s.archivedTo) moveAside(root, SETTINGS, s.archivedTo);
  writeAt(root, SETTINGS, s.text);
  for (const f of m.status) if (f.action !== "same") writeAt(root, f.path, f.content);
  writeAt(root, MANIFEST, m.manifest.text);
  return report;
}

/**
 * @param {string} root project folder
 * @param {object} answers partial or full config
 * @param {{now?:Date, adopt?:boolean}} opts
 */
export function generate(root, answers, opts = {}) {
  const plan = planSetup(root, answers, opts);
  const report = applySetup(root, plan);
  return { config: plan.config, report, detected: plan.detected };
}

const PAD = 15;
/** The dry run's text: one line per path (action · path · reason), then the merges. */
export function planLines(plan) {
  const m = plan.merges;
  const lines = plan.actions.map((a) => `${a.action.padEnd(PAD)} ${a.path}  ${a.reason}`);
  for (const a of m.adopt) lines.push(`${"adopt".padEnd(PAD)} ${a.path}  ${a.reason} → ${a.to}`);
  lines.push("", "merges:");
  lines.push(`  .gitignore: ${m.gitignore.add.length ? `add ${m.gitignore.add.join(" ")}` : "nothing to add"}`);
  const p = m.packageJson;
  lines.push(`  package.json: ${p.state}${p.added.length ? ` — add scripts ${p.added.join(", ")}` : ""}${p.kept.length ? ` — keep yours ${p.kept.join(", ")}` : ""}`);
  const s = m.settings;
  lines.push(`  ${SETTINGS}: ${s.action}${s.archivedTo ? ` — ${s.archivedWhy}, archived to ${s.archivedTo}` : ""}${s.hooks.length ? ` — add hooks ${s.hooks.join(", ")}` : ""}${s.envMoved ? ` — env block moves to ${SETTINGS_LOCAL}` : ""}${s.localArchivedTo ? ` — ${SETTINGS_LOCAL} ${s.localArchivedWhy}, archived to ${s.localArchivedTo}` : ""}`);
  lines.push(`  ${CONFIG_FILE}: ${m.config.action}`);
  for (const f of [...m.status, { path: MANIFEST, action: m.manifest.action }]) lines.push(`  ${f.path}: ${f.action}`);
  if (plan.report.warnings.length) lines.push("", "warnings:", ...plan.report.warnings.map((w) => `  ⚠ ${w}`));
  return lines;
}

/** What `--diff` shows, as lines: one unified diff (disk → new) per update · replace-edited · keep-edited file and for saf.config.json. */
export function planDiffs(plan) {
  const shown = new Set(["update", "replace-edited", "keep-edited"]);
  const pairs = plan.actions.filter((a) => shown.has(a.action) && a.current !== undefined).map((a) => [a.path, a.current, a.content]);
  if (plan.merges.config.action === "update") pairs.push([CONFIG_FILE, plan.merges.config.current, plan.merges.config.text]);
  const lines = [];
  for (const [path, a, b] of pairs) lines.push(...(unifiedDiff(path, a, b) || `${path}: no differences`).split("\n"));
  return lines.length ? lines : ["no file to show a diff for"];
}

/**
 * Upgrade step (the engine itself is copied by the installer): bring the kit-owned agent files up to date with the new
 * templates — `/saf` commands and skills (core + the packs in saf.config.json) — rendered with the project's settings.
 * A file is written when it is missing or unchanged since SAF wrote it; edited files are kept and listed.
 * Commands and skills an older SAF shipped that are no longer planned are removed when unedited (never files SAF did not write).
 * Project docs (CLAUDE.md, docs/, plan) are not touched — re-run setup for those.
 */
export function refreshKitFiles(root) {
  const report = { written: [], archived: [], kept: [], removed: [], warnings: [] };
  const manifest = readJson(join(root, MANIFEST), { files: {} });
  const raw = readJson(join(root, CONFIG_FILE), existsSync(join(root, CONFIG_FILE)) ? null : {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    report.warnings.push(`${CONFIG_FILE} is not valid JSON — commands and skills were not refreshed`);
    return report;
  }
  const errors = validateConfig(raw);
  if (errors.length) {
    report.warnings.push(`${CONFIG_FILE} is invalid — commands and skills were not refreshed`);
    return report;
  }
  const config = resolveConfig(raw);
  const detected = detectProject(root);
  const pkg = config.stack.packageManager === "none" ? null : readJson(join(root, "package.json"), null);
  const data = templateData(config, detected, { scripts: pkg?.scripts ?? null, version: SAF_VERSION() });
  const kitDirs = [".claude/commands/", ".claude/skills/"];
  const planned = plannedFiles(config, data, detected);
  for (const f of planned.filter((x) => kitDirs.some((d) => x.dest.startsWith(d)))) {
    if (f.fallback) report.warnings.push(fallbackWarning(f, config.people.docLanguage));
    const abs = join(root, f.dest);
    if (existsSync(abs)) {
      const cur = readText(abs);
      if (cur === f.content) {
        manifest.files[f.dest] = sha(f.content);
        continue;
      }
      if (!manifest.files[f.dest] || sha(cur) !== manifest.files[f.dest]) {
        report.kept.push(`${f.dest} (edited in this project — kept)`);
        continue;
      }
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    manifest.files[f.dest] = sha(f.content);
    report.written.push(f.dest);
  }
  const scoped = { files: Object.fromEntries(Object.entries(manifest.files).filter(([rel]) => kitDirs.some((d) => rel.startsWith(d)))) };
  const before = Object.keys(scoped.files);
  applyRetire(root, planRetire(root, scoped.files, new Set(planned.map((x) => x.dest))), scoped.files, report);
  for (const rel of before) if (!(rel in scoped.files)) delete manifest.files[rel];
  manifest.version = SAF_VERSION();
  mkdirSync(join(root, ".saf"), { recursive: true });
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return report;
}
