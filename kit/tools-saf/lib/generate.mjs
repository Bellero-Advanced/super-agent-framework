import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CONFIG_FILE, ENGINE_SCRIPTS, MODEL_PRESETS, SAF_DIR, resolveConfig, roleTable, scriptCommand, validateConfig } from "./config.mjs";
import { detectProject } from "./detect.mjs";
import { scriptOf } from "./docs.mjs";
import { loadPlan } from "./plan.mjs";
import { writeGenerated } from "./task.mjs";
import { render } from "./template.mjs";

/**
 * Generator — turns setup answers into the full project system:
 * CLAUDE.md · docs/INDEX.md · docs/DECISIONS.md · docs/plan/ (README, M0 gate, first card, optional M1 draft) ·
 * .claude/agents · .claude/commands (/saf…) · .claude/rules · generic skills · settings.json hooks · package scripts.
 *
 * Safety: a file that exists and was not written by SAF (or was edited since) is moved to docs/archive/ before
 * it is replaced. `.saf/manifest.json` records what SAF wrote. settings.json · .gitignore · package.json are merged, not replaced.
 */

export const TEMPLATES = join(SAF_DIR, "templates");
export const MANIFEST = ".saf/manifest.json";
export const ARCHIVE = "docs/archive/pre-saf";
export const SAF_VERSION = () => readFileSync(join(SAF_DIR, "VERSION"), "utf8").trim();

const sha = (s) => createHash("sha1").update(s).digest("hex");
const ALIASES = { "saf-p": "saf-plan", "saf-f": "saf-fix", "saf-t": "saf-test", "saf-pt": "saf-protect", "saf-audit": "saf-protect", "saf-h": "saf-help" };
const SKILLS = ["code-review", "debug-protocol", "tdd", "security-review", "writing-for-agents", "handoff"];
const LANG_NAME = { th: { th: "ภาษาไทย", en: "Thai" }, en: { th: "ภาษาอังกฤษ", en: "English" } };
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
  const work = (tiers) => {
    const planner = tiers.has("planner");
    const builder = tiers.has("builder");
    if (docLang === "th") return planner && builder ? "ออกแบบ · ตรวจ · ลงมือ" : planner ? "ออกแบบ · เขียนการ์ด/สเปก · ตรวจงานกับสเปก" : "ลงมือทำการ์ด · ทดสอบ · งานเฉพาะทาง";
    return planner && builder ? "design · review · build" : planner ? "design · write cards/specs · review against specs" : "build cards · test · specialist work";
  };
  return [...by.values()].map((r) => ({ model: r.model, roles: r.roles.map((n) => `\`${n}\``).join(" · "), work: work(r.tiers) }));
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
  const isTh = config.people.docLanguage === "th";
  const dl = config.people.docLanguage;
  const goal = config.firstMilestone.goal.trim();
  const m1Title = goal.split(/[\n.。]/)[0].slice(0, 80) || "First milestone";
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const presetName = { max: "Max", balanced: "Balanced", economy: "Economy", custom: "Custom" }[config.models.preset];
  return {
    ...config,
    saf: { version: opts.version ?? "" },
    isTh,
    chatTh: config.people.chatLanguage === "th",
    owner: config.people.ownerTitle,
    today,
    typeLabel: TYPE_LABEL[config.project.type],
    docLanguageName: LANG_NAME[dl][dl],
    chatLanguageName: LANG_NAME[config.people.chatLanguage][dl],
    reportLanguageName: LANG_NAME[config.roles.reportLanguage][dl],
    uiLanguagesText: config.people.uiLanguages.join(", "),
    presetName,
    presetIsStandard: !!MODEL_PRESETS[config.models.preset],
    roles,
    coreRoles: roles.filter((r) => ["designer", "spec-reviewer", "implementer", "qa-runner"].includes(r.name)),
    extraRoles: roles.filter((r) => !["designer", "spec-reviewer", "implementer", "qa-runner"].includes(r.name)),
    roleNames: roles.map((r) => r.name).join(", "),
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
      taskState: c("task:state"),
      taskStateCheck: c("task:state", "--check"),
      taskNext: c("task:next", "--parallel"),
      taskProbe: c("task:probe"),
      taskEnv: c("task:env"),
      taskReport: c("task:report", "<M>"),
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

function plannedFiles(config, data, detected) {
  const lang = config.people.docLanguage;
  const L = (p) => join(TEMPLATES, lang, p);
  const files = [
    [L("CLAUDE.md"), "CLAUDE.md"],
    [L("docs/INDEX.md"), "docs/INDEX.md"],
    [L("docs/DECISIONS.md"), "docs/DECISIONS.md"],
    [L("docs/plan/README.md"), "docs/plan/README.md"],
    [L("docs/plan/milestones/M0.md"), "docs/plan/milestones/M0.md"],
    [L("docs/plan/tasks/T-M0-01.md"), "docs/plan/tasks/M0/T-M0-01.md"],
    [L("docs/plan/tasks/_template.md"), "docs/plan/tasks/_template.md"],
    [L("docs/specs/_template.md"), "docs/specs/_template.md"],
  ];
  if (data.m1) files.push([L("docs/plan/milestones/M1.md"), "docs/plan/milestones/M1.md"]);
  for (const name of ["saf", "saf-plan", "saf-fix", "saf-test", "saf-protect", "saf-help"]) files.push([L(`commands/${name}.md`), `.claude/commands/${name}.md`]);
  const out = files.map(([src, dest]) => ({ dest, content: render(readFileSync(src, "utf8"), data) }));
  const aliasT = readFileSync(L("commands/_alias.md"), "utf8");
  for (const [alias, target] of Object.entries(ALIASES)) out.push({ dest: `.claude/commands/${alias}.md`, content: render(aliasT, { ...data, alias, target }) });
  for (const role of data.roles) {
    const src = role.custom ? join(TEMPLATES, "agents", "_custom.md") : join(TEMPLATES, "agents", `${role.name}.md`);
    out.push({ dest: `.claude/agents/${role.name}.md`, content: render(readFileSync(src, "utf8"), { ...data, role }) });
  }
  for (const rule of ruleSet(config, detected)) {
    out.push({ dest: `.claude/rules/${rule.name}.md`, content: render(readFileSync(join(TEMPLATES, "rules", `${rule.name}.md`), "utf8"), { ...data, rulePathsYaml: rule.paths.map((p) => `  - ${JSON.stringify(p)}`).join("\n") }) });
  }
  for (const skill of SKILLS) {
    for (const f of walk(join(TEMPLATES, "skills", skill))) out.push({ dest: `.claude/skills/${skill}/${relative(join(TEMPLATES, "skills", skill), f).split("\\").join("/")}`, content: readFileSync(f, "utf8"), kit: true });
  }
  return out;
}

const SETTINGS_HOOKS = {
  SessionStart: 'cd "$CLAUDE_PROJECT_DIR" && node tools/saf/bin/saf.mjs hook session-start',
  Stop: 'cd "$CLAUDE_PROJECT_DIR" && node tools/saf/bin/saf.mjs hook check-stop',
};

function mergeSettings(root, report) {
  const file = join(root, ".claude/settings.json");
  const cur = readJson(file, existsSync(file) ? null : {});
  if (cur === null) {
    report.warnings.push(".claude/settings.json is not valid JSON — archived and replaced");
    archive(root, ".claude/settings.json", report);
  }
  const s = cur ?? {};
  if (s.env) {
    const localFile = join(root, ".claude/settings.local.json");
    const local = readJson(localFile, {});
    local.env = { ...(local.env ?? {}), ...s.env };
    writeFileSync(localFile, `${JSON.stringify(local, null, 2)}\n`);
    delete s.env;
    report.warnings.push("moved the env block of .claude/settings.json into .claude/settings.local.json (not tracked) — values were not printed");
  }
  s.hooks ??= {};
  for (const [event, command] of Object.entries(SETTINGS_HOOKS)) {
    const groups = (s.hooks[event] ??= []);
    const present = groups.some((g) => (g.hooks ?? []).some((h) => h.command === command));
    if (!present) groups.push({ hooks: [{ type: "command", command, timeout: 30 }] });
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
  report.written.push(".claude/settings.json (merged)");
}

export const GITIGNORE_LINES = [".claude/settings.local.json", ".saf-lane.json", ".saf/memory/", ".env", ".env.local", ".env.*.local"];

export function mergeGitignore(root, config, report) {
  const file = join(root, ".gitignore");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const want = [...GITIGNORE_LINES, `${config.workflow.worktreeDir.replace(/\/$/, "")}/`, ...config.policies.secrets.envFiles];
  const add = [...new Set(want)].filter((l) => !have.has(l));
  if (!add.length) return;
  writeFileSync(file, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${cur ? "\n" : ""}# SAF\n${add.join("\n")}\n`);
  report?.written.push(".gitignore (merged)");
}

function mergePackageJson(root, config, report) {
  if (config.stack.packageManager === "none") return null;
  const file = join(root, "package.json");
  const pkg = existsSync(file) ? readJson(file, null) : { name: config.project.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project", private: true };
  if (!pkg) {
    report.warnings.push("package.json is not valid JSON — scripts were not added (see docs/plan/README.md for the commands)");
    return null;
  }
  pkg.scripts ??= {};
  const want = { saf: "node tools/saf/bin/saf.mjs" };
  for (const [script, sub] of Object.entries(ENGINE_SCRIPTS)) {
    if (script === "measure" && !config.workflow.measure.enabled) continue;
    want[script] = `node tools/saf/bin/saf.mjs ${sub}`;
  }
  for (const [k, v] of Object.entries(want)) {
    if (pkg.scripts[k] === undefined) pkg.scripts[k] = v;
    else if (pkg.scripts[k] !== v) report.warnings.push(`package.json already has a different "${k}" script — kept yours; SAF docs assume "${v}"`);
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  report.written.push("package.json (scripts merged)");
  return pkg.scripts;
}

function archive(root, rel, report) {
  const src = join(root, rel);
  if (!existsSync(src)) return;
  let dest = join(root, ARCHIVE, rel);
  let n = 1;
  while (existsSync(dest)) dest = join(root, ARCHIVE, `${rel}.${n++}`);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
  report.archived.push(`${rel} → ${relative(root, dest).split("\\").join("/")}`);
}

/**
 * @param {string} root project folder
 * @param {object} answers partial or full config
 * @param {{now?:Date, adopt?:boolean}} opts
 */
export function generate(root, answers, opts = {}) {
  const errors = validateConfig(answers);
  if (errors.length) throw new Error(["setup answers are invalid:", ...errors.map((e) => `  ✗ ${e}`)].join("\n"));
  const detected = detectProject(root);
  const report = { written: [], archived: [], kept: [], warnings: [] };
  const manifest = readJson(join(root, MANIFEST), { files: {} });
  const ownedUnchanged = (rel) => {
    const abs = join(root, rel);
    return manifest.files[rel] && existsSync(abs) && sha(readFileSync(abs, "utf8")) === manifest.files[rel];
  };
  const adopt = opts.adopt ?? detected.adopt;

  // 1. adopt: move pre-existing agent docs and plan files that SAF did not write into the archive
  if (adopt) {
    for (const dir of [".claude/agents", ".claude/commands", ".claude/rules", "docs/plan"]) {
      for (const abs of walk(join(root, dir))) {
        const rel = relative(root, abs).split("\\").join("/");
        if (!manifest.files[rel]) archive(root, rel, report);
      }
    }
  }

  // 2. config + package scripts first (templates need to know which scripts exist)
  let config = resolveConfig(answers);
  mergeGitignore(root, config, report);
  const scripts = mergePackageJson(root, config, report);
  if (answers.workflow?.mergeChecks === undefined || answers.workflow?.mergeChecks === null) {
    config.workflow.mergeChecks = config.workflow.mergeChecks.filter((cmd) => {
      const name = scriptOf(cmd);
      return !name || !scripts || name in scripts;
    });
  }
  const stored = JSON.parse(JSON.stringify(config));
  stored.$schema = "tools/saf/schema/saf.config.schema.json";
  const ordered = { $schema: stored.$schema, ...stored };
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(ordered, null, 2)}\n`);
  config = resolveConfig(ordered);
  report.written.push(CONFIG_FILE);

  // 3. rendered files
  const data = templateData(config, detected, { now: opts.now, scripts, version: SAF_VERSION() });
  const files = plannedFiles(config, data, detected);
  const next = { version: SAF_VERSION(), files: {} };
  for (const f of files) {
    const abs = join(root, f.dest);
    if (existsSync(abs) && statSync(abs).isFile()) {
      const cur = readFileSync(abs, "utf8");
      if (cur !== f.content && !ownedUnchanged(f.dest)) archive(root, f.dest, report);
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    next.files[f.dest] = sha(f.content);
    report.written.push(f.dest);
  }
  mkdirSync(join(root, "docs/plan/evidence"), { recursive: true });
  if (!existsSync(join(root, "docs/plan/evidence/.gitkeep"))) writeFileSync(join(root, "docs/plan/evidence/.gitkeep"), "");
  mergeSettings(root, report);

  // 4. generated status files
  const plan = loadPlan(root, config);
  for (const issue of plan.issues) report.warnings.push(`plan: ${issue}`);
  writeGenerated(root, plan);
  next.files["docs/plan/STATE.md"] = sha(readFileSync(join(root, "docs/plan/STATE.md"), "utf8"));
  mkdirSync(join(root, ".saf"), { recursive: true });
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(next, null, 2)}\n`);
  return { config, report, detected };
}

/** Refresh kit-owned files only (engine is copied by the installer): skills SAF ships, when unchanged since SAF wrote them. */
export function refreshKitFiles(root) {
  const report = { written: [], archived: [], kept: [], warnings: [] };
  const manifest = readJson(join(root, MANIFEST), { files: {} });
  for (const skill of SKILLS) {
    for (const f of walk(join(TEMPLATES, "skills", skill))) {
      const rel = `.claude/skills/${skill}/${relative(join(TEMPLATES, "skills", skill), f).split("\\").join("/")}`;
      const abs = join(root, rel);
      const content = readFileSync(f, "utf8");
      if (existsSync(abs)) {
        const cur = readFileSync(abs, "utf8");
        if (cur === content) continue;
        if (manifest.files[rel] && sha(cur) !== manifest.files[rel]) {
          report.kept.push(`${rel} (edited in this project — kept)`);
          continue;
        }
      }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      manifest.files[rel] = sha(content);
      report.written.push(rel);
    }
  }
  manifest.version = SAF_VERSION();
  mkdirSync(join(root, ".saf"), { recursive: true });
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return report;
}

