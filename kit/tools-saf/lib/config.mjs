import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./schema.mjs";

/**
 * saf.config.json — every project-specific value the engine and the generator use.
 * The same object shape is used for setup answers (partial) and for the stored config (complete).
 * `resolveConfig` fills defaults (rigor-, preset- and stack-derived) so a partial answers file and a
 * complete config file produce the same result.
 */

export const CONFIG_FILE = "saf.config.json";
export const LOCAL_CONFIG_FILE = "saf.config.local.json";
export const SAF_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCHEMA_FILE = join(SAF_DIR, "schema", "saf.config.schema.json");

export const MODELS = {
  fable: "claude-fable-5-2",
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};

/** Test mode: when the full test suite runs (docs/specs/test-mode.md). Keep TEST_MODES and the schema enum in step. */
export const TEST_MODES = ["every-card", "targeted", "milestone"];
export const DEFAULT_TEST_MODE = "milestone";
export const TEST_MODE_ENV = "SAF_TEST_MODE";
/** Keys saf.config.local.json (per machine, not tracked) may set — any other key is an error. */
export const LOCAL_KEYS = ["workflow.testMode", "workflow.lanes.code", "workflow.sideLanes.max", "models.effort"];
/** Typo guard for the lane caps (the schema maximum of workflow.lanes.code and workflow.sideLanes.max equals it). */
export const LANE_CEILING = 32;
/** The highest TCP port; the highest lane port must stay at or below it. */
export const MAX_PORT = 65535;
/** `stack.commands` keys whose command is "the full test suite". */
export const FULL_SUITE_KEYS = ["test", "e2e"];

/** Effort modes (docs/specs/effort-by-size.md): fixed = one effort per role · by-size = `EFFORT_BY_SIZE`. Keep in step with the schema enum. */
export const EFFORT_MODES = ["fixed", "by-size"];
export const DEFAULT_EFFORT_MODE = "fixed";
/** The efforts an agent file may carry (the schema `effort` enum). */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
/** Decision D-016: per role, the effort of size S and size M cards in by-size mode. Roles not listed keep their role effort. */
export const EFFORT_BY_SIZE = {
  implementer: { S: "medium", M: "high" },
  designer: { S: "medium", M: "medium" },
  "spec-reviewer": { S: "high", M: "high" },
  "qa-runner": { S: "medium", M: "medium" },
  "release-operator": { S: "medium", M: "medium" },
};

/** Planner/reviewer roles get `planner`; builder roles get `builder`. Effort is set per role, not per preset. */
export const MODEL_PRESETS = {
  max: { planner: MODELS.fable, builder: MODELS.opus },
  balanced: { planner: MODELS.opus, builder: MODELS.sonnet },
  economy: { planner: MODELS.sonnet, builder: MODELS.haiku },
};

/**
 * Role library. tier → model tier · lane → where cards of this role run in parallel mode
 * (code = own worktree lane · main = main folder, one at a time) · readOnly roles get a fixed tool list.
 * `roles.lanes` may move a role to the other lane unless `laneLocked` (docs/specs/role-lanes.md).
 */
export const ROLE_LIBRARY = {
  designer: { core: true, tier: "planner", lane: "main", laneLocked: true, effort: "high", tools: "Read, Grep, Glob, Write, Edit, Bash", summary: "Writes milestone plans, cards and specs. Never edits product code." },
  "spec-reviewer": { core: true, tier: "planner", lane: "main", laneLocked: true, effort: "high", tools: "Read, Grep, Glob", readOnly: true, summary: "Read-only. Compares a finished card with its spec and reports every mismatch." },
  implementer: { core: true, tier: "builder", lane: "code", effort: "high", tools: "", summary: "Takes one card, writes code and tests, runs task:verify until it passes." },
  "qa-runner": { core: true, tier: "builder", lane: "code", effort: "medium", tools: "Read, Grep, Glob, Bash", summary: "Runs real tests (e2e, load, perf, screenshots) and reports real numbers. Never fixes code to pass." },
  "art-producer": { core: false, tier: "builder", lane: "main", effort: "medium", tools: "Read, Grep, Glob, Write, Edit, Bash", summary: "Produces images and media from approved briefs; logs every asset." },
  "db-guardian": { core: false, tier: "builder", lane: "code", effort: "high", tools: "", summary: "Writes and rehearses schema migrations, access rules and data fixes. Never applies to production." },
  "release-operator": { core: false, tier: "builder", lane: "main", laneLocked: true, effort: "medium", tools: "Read, Grep, Glob, Write, Edit, Bash", summary: "The only role that touches live systems — only on an explicit owner order, dry run first, logged." },
  "security-auditor": { core: false, tier: "planner", lane: "main", effort: "high", tools: "Read, Grep, Glob, Bash", summary: "Audits code and config for security issues and reports by severity. Never fixes outside a card." },
  "data-engineer": { core: false, tier: "builder", lane: "code", effort: "high", tools: "", summary: "Builds data pipelines, evaluations and model integrations with measured results." },
  "content-writer": { core: false, tier: "builder", lane: "main", effort: "medium", tools: "Read, Grep, Glob, Write, Edit", summary: "Writes user-facing copy and translations through the project's i18n system." },
};
export const CORE_ROLES = Object.keys(ROLE_LIBRARY).filter((r) => ROLE_LIBRARY[r].core);

export const RIGOR = {
  light: { sizes: { S: 200, M: 500 }, testCaps: { S: 300, M: 800 }, review: "m-cards", merge: ["test"] },
  standard: { sizes: { S: 150, M: 400 }, testCaps: { S: 250, M: 600 }, review: "every-card", merge: ["typecheck", "lint", "test"] },
  strict: { sizes: { S: 100, M: 300 }, testCaps: { S: 200, M: 500 }, review: "every-card+security", merge: ["typecheck", "lint", "test", "build"] },
};

/** Skills every project gets. Optional packs add one skill each (same name as the pack). */
export const CORE_SKILLS = ["debug-protocol", "tdd", "code-review", "security-review", "writing-for-agents", "handoff", "evidence-before-done", "test-runner"];
export const SKILL_PACKS = ["ui-frontend", "db-migrations", "performance", "i18n", "mobile", "game"];

/** Packs recommended from the project's answers (used when skills.packs is not set). */
export function recommendPacks(c) {
  const t = c.project.type;
  const out = new Set();
  if (["web-app", "mobile", "game", "erp"].includes(t)) out.add("ui-frontend");
  if (c.stack.database && c.stack.database !== "none") out.add("db-migrations");
  if (t === "game") out.add("performance");
  if (c.people.i18nRequired || c.people.uiLanguages.length > 1) out.add("i18n");
  if (t === "mobile") out.add("mobile");
  if (t === "game") out.add("game");
  return SKILL_PACKS.filter((p) => out.has(p));
}

export const PROJECT_TYPES = ["web-app", "mobile", "game", "api", "erp", "data-ai", "library-cli", "other"];

const DEFAULTS = {
  version: 1,
  project: { name: "my-project", pitch: "", type: "web-app", domain: "", users: "", stage: "prototype", rigor: "standard" },
  people: { ownerTitle: "owner", docLanguage: "en", chatLanguage: "en", uiLanguages: ["en"], i18nRequired: false, timeZone: "UTC" },
  stack: {
    summary: "",
    packageManager: "npm",
    monorepo: false,
    commands: { typecheck: "", lint: "", test: "", e2e: "", build: "" },
    database: "none",
    submodules: false,
  },
  models: { preset: "balanced", planner: "", builder: "", sessionDefault: "", overrides: {}, effort: DEFAULT_EFFORT_MODE },
  roles: { enabled: [...CORE_ROLES], custom: [], reportLanguage: "en", lanes: {} },
  skills: { packs: null },
  workflow: {
    sizes: null,
    testCaps: null,
    review: null,
    lanes: { code: 3, main: 1 },
    sideLanes: { enabled: true, max: 1 },
    worktrees: true,
    worktreeDir: ".claude/worktrees",
    branchPrefix: "card/",
    solo: [],
    laneInstall: null,
    lanePorts: { base: 3000, step: 10, env: ["PORT"] },
    laneDb: "",
    mergeChecks: null,
    mergeInstall: null,
    measure: { enabled: true, waitMs: 20 * 60 * 1000, maxLoadPerCore: 0.5, names: { test: { idle: false }, e2e: { idle: false }, perf: { idle: true }, adhoc: { idle: true } } },
    perfBudgets: "",
    alwaysAllowed: [],
    commandTimeoutMs: 30 * 60 * 1000,
  },
  policies: {
    push: "owner-order",
    deploy: { mode: "owner-order", target: "", exceptions: "" },
    protectedBranches: ["main"],
    autoDeployBranches: [],
    noForcePush: true,
    secrets: { envFiles: [".env", ".env.local", ".env.*.local"], extraPatterns: [] },
    forbiddenPaths: [],
    ownerOnlyPaths: [],
    externalServices: [],
    noTimeEstimates: true,
    evidenceRequired: true,
  },
  tokenSaving: { enabled: true, silentInterim: true, batchReviewerNotes: true, reviewerDiff: true, fixFlakyFirst: true },
  firstMilestone: { goal: "" },
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Deep merge: objects merge, arrays and scalars replace. */
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = v === undefined ? base[k] : isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

/** Shell command for a project script with the chosen package manager (npm needs `--` before arguments). */
export function scriptCommand(pm, script, args = "") {
  const a = args ? ` ${args}` : "";
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}${a}`;
    case "yarn":
      return `yarn ${script}${a}`;
    case "bun":
      return `bun run ${script}${a}`;
    case "none":
      return `node tools/saf/bin/saf.mjs ${ENGINE_SCRIPTS[script] ?? script}${a}`;
    default:
      return `npm run ${script}${args ? ` -- ${args}` : ""}`;
  }
}

/** package.json script name → engine sub-command (also used for packageManager "none"). */
export const ENGINE_SCRIPTS = {
  "task:start": "task start",
  "task:verify": "task verify",
  "task:abandon": "task abandon",
  "task:merge": "task merge",
  "task:review": "task review",
  "task:state": "task state",
  "task:next": "task next",
  "task:probe": "task probe",
  "task:env": "task env",
  "task:report": "task report",
  "task:culprit": "task culprit",
  "task:friction": "task friction",
  "task:prerun": "task prerun",
  "task:diff": "task diff",
  "docs:check": "docs-check",
  "spec:matrix": "spec-matrix",
  "check-secrets": "check-secrets",
  measure: "measure adhoc --",
};

export function resolveConfig(raw = {}) {
  const c = deepMerge(structuredClone(DEFAULTS), structuredClone(raw ?? {}));
  const rigor = RIGOR[c.project.rigor] ?? RIGOR.standard;
  const pm = c.stack.packageManager;
  c.workflow.sizes ??= { ...rigor.sizes };
  c.workflow.testCaps ??= { ...rigor.testCaps };
  c.workflow.review ??= rigor.review;
  const preset = MODEL_PRESETS[c.models.preset];
  if (preset) {
    c.models.planner ||= preset.planner;
    c.models.builder ||= preset.builder;
  } else {
    c.models.planner ||= MODELS.opus;
    c.models.builder ||= MODELS.sonnet;
  }
  c.models.sessionDefault ||= c.models.builder;
  if (c.workflow.mergeChecks === null) {
    const project = rigor.merge.map((k) => c.stack.commands[k]).filter(Boolean);
    c.workflow.mergeChecks = [...project, scriptCommand(pm, "check-secrets"), scriptCommand(pm, "docs:check")];
  }
  if (c.workflow.laneInstall === null) {
    c.workflow.laneInstall = { pnpm: "pnpm install --frozen-lockfile", npm: "npm ci", yarn: "yarn install --frozen-lockfile", bun: "bun install --frozen-lockfile", none: "" }[pm] ?? "";
  }
  if (c.workflow.mergeInstall === null) {
    const lock = { pnpm: ["pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml"], npm: ["package-lock.json", "package.json"], yarn: ["yarn.lock", "package.json"], bun: ["bun.lockb", "bun.lock", "package.json"] }[pm];
    c.workflow.mergeInstall = lock && c.workflow.laneInstall ? { cmd: c.workflow.laneInstall, files: lock } : { cmd: "", files: [] };
  }
  c.skills.packs ??= recommendPacks(c);
  if (!c.roles.enabled.length) c.roles.enabled = [...CORE_ROLES];
  for (const r of [...CORE_ROLES].reverse()) if (!c.roles.enabled.includes(r)) c.roles.enabled.unshift(r);
  for (const r of c.roles.custom) if (!c.roles.enabled.includes(r.name)) c.roles.enabled.push(r.name);
  return c;
}

/**
 * Variant agent names `<role>-<effort>` of the library roles in `enabled`, by the table — whatever the mode.
 * A role with an effort override gets none (docs/specs/effort-by-size.md rule 6). `overrides` = `models.overrides`.
 */
export function variantNames(enabled, overrides = {}) {
  const out = [];
  for (const role of enabled) {
    if (!Object.hasOwn(ROLE_LIBRARY, role) || !Object.hasOwn(EFFORT_BY_SIZE, role) || overrides?.[role]?.effort) continue;
    for (const effort of new Set(Object.values(EFFORT_BY_SIZE[role])))
      if (effort !== ROLE_LIBRARY[role].effort) out.push({ role, effort, name: `${role}-${effort}` });
  }
  return out;
}

/** Every enabled role with its model, effort, lane and tools. */
export function roleTable(c) {
  const out = [];
  for (const name of c.roles.enabled) {
    const lib = Object.hasOwn(ROLE_LIBRARY, name) ? ROLE_LIBRARY[name] : undefined;
    const custom = c.roles.custom.find((r) => r.name === name);
    const base = lib ?? custom;
    if (!base) continue;
    const tier = base.tier ?? "builder";
    const o = c.models.overrides?.[name] ?? {};
    out.push({
      name,
      custom: !lib,
      tier,
      lane: (Object.hasOwn(c.roles.lanes ?? {}, name) ? c.roles.lanes[name] : undefined) ?? base.lane ?? (tier === "planner" ? "main" : "code"),
      effort: o.effort ?? base.effort ?? "medium",
      model: o.model ?? (tier === "planner" ? c.models.planner : c.models.builder),
      tools: base.tools ?? "",
      readOnly: !!base.readOnly,
      summary: base.summary ?? base.description ?? "",
      focus: custom?.focus ?? "",
    });
  }
  return out;
}

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
}

/** Validate a raw (possibly partial) config/answers object. @returns {string[]} */
export function validateConfig(raw) {
  return [...validate(loadSchema(), raw), ...laneKeyErrors(raw), ...variantNameErrors(raw)];
}

/** One error per custom role named like a variant agent of an enabled role (the file `.claude/agents/<name>.md` would clash). */
function variantNameErrors(raw) {
  const custom = raw?.roles?.custom;
  if (!Array.isArray(custom)) return [];
  const enabled = [...CORE_ROLES, ...(Array.isArray(raw.roles.enabled) ? raw.roles.enabled : [])];
  const overrides = isObj(raw.models?.overrides) ? raw.models.overrides : {};
  const taken = new Set(variantNames(enabled, overrides).map((v) => v.name));
  return custom.filter((r) => taken.has(r?.name)).map((r) => `$.roles.custom: "${r.name}" is the file name of a variant agent of ${r.name.slice(0, r.name.lastIndexOf("-"))} — pick another name`);
}

/** One error per key of `roles.lanes` that names no movable role (the values are checked by the schema). */
function laneKeyErrors(raw) {
  const lanes = raw?.roles?.lanes;
  if (!isObj(lanes)) return [];
  const customNames = Array.isArray(raw.roles.custom) ? raw.roles.custom.map((r) => r?.name) : [];
  return Object.keys(lanes).flatMap((name) => {
    const lib = Object.hasOwn(ROLE_LIBRARY, name) ? ROLE_LIBRARY[name] : undefined;
    if (lib?.laneLocked) return [`$.roles.lanes.${name}: the lane of ${name} is fixed (main folder) and cannot be moved`];
    if (lib) return [];
    if (customNames.includes(name)) return [`$.roles.lanes.${name}: ${name} is a custom role — set its lane in roles.custom[].lane`];
    return [`$.roles.lanes.${name}: ${name} is not a role of the library (movable: ${Object.keys(ROLE_LIBRARY).filter((r) => !ROLE_LIBRARY[r].laneLocked).join(", ")})`];
  });
}

export class ConfigError extends Error {}

/** Folder that holds saf.config.json, walking up from `start`. */
export function findRoot(start = process.cwd()) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new ConfigError(`no ${CONFIG_FILE} found from ${start} upwards — run the SAF installer first`);
    dir = up;
  }
}

function readJsonFile(root, name) {
  try {
    return JSON.parse(readFileSync(join(root, name), "utf8"));
  } catch (e) {
    throw new ConfigError(`${name}: cannot read JSON (${e instanceof Error ? e.message : e})`);
  }
}

/** Dotted paths in `obj` that are not in `allowed` (an allowed path may be a parent of nothing but itself). */
function disallowedPaths(obj, allowed, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (allowed.includes(path)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && allowed.some((a) => a.startsWith(`${path}.`))) out.push(...disallowedPaths(v, allowed, path));
    else out.push(path);
  }
  return out;
}

/** Engine runs only: the config plus the per-machine test mode (env > saf.config.local.json > saf.config.json > default). */
export function loadConfig(root, env = process.env) {
  const raw = readJsonFile(root, CONFIG_FILE);
  const errors = validateConfig(raw);
  if (errors.length) throw new ConfigError([`${CONFIG_FILE} is invalid:`, ...errors.map((e) => `  ✗ ${e}`)].join("\n"));
  const config = resolveConfig(raw);
  let mode = DEFAULT_TEST_MODE;
  let source = "default";
  const localKeys = [];
  let codeCapFile = CONFIG_FILE;
  if (raw.workflow?.testMode) [mode, source] = [raw.workflow.testMode, "repo"];
  if (existsSync(join(root, LOCAL_CONFIG_FILE))) {
    const local = readJsonFile(root, LOCAL_CONFIG_FILE);
    const bad = local !== null && typeof local === "object" && !Array.isArray(local) ? disallowedPaths(local, LOCAL_KEYS) : ["$"];
    const lerrors = [...bad.map((k) => `${k} is not allowed here (allowed: ${LOCAL_KEYS.join(", ")})`), ...validateConfig(local)];
    if (lerrors.length) throw new ConfigError([`${LOCAL_CONFIG_FILE} is invalid:`, ...lerrors.map((e) => `  ✗ ${e}`)].join("\n"));
    for (const key of LOCAL_KEYS) {
      const path = key.split(".");
      const value = path.reduce((o, k) => o?.[k], local);
      if (value === undefined) continue;
      localKeys.push(key);
      if (key === "workflow.testMode") [mode, source] = [value, "local"];
      else path.slice(0, -1).reduce((o, k) => o[k], config)[path.at(-1)] = value;
    }
    if (localKeys.includes("workflow.lanes.code")) codeCapFile = LOCAL_CONFIG_FILE;
  }
  const fromEnv = env[TEST_MODE_ENV];
  if (fromEnv) {
    if (!TEST_MODES.includes(fromEnv)) throw new ConfigError(`${TEST_MODE_ENV}=${fromEnv} is not a test mode — use one of: ${TEST_MODES.join(", ")}`);
    [mode, source] = [fromEnv, "env"];
  }
  config.models.effortTracked = raw.models?.effort ?? DEFAULT_EFFORT_MODE;
  config.models.effortSource = raw.models?.effort ? "repo" : "default";
  if (localKeys.includes("models.effort")) config.models.effortSource = "local";
  const w = config.workflow;
  const top = w.lanePorts.base + w.lanePorts.step * w.lanes.code;
  if (w.worktrees && w.lanes.code >= 1 && w.lanePorts.env.length && top > MAX_PORT)
    throw new ConfigError(`workflow.lanes.code (${w.lanes.code}, from ${codeCapFile}) with workflow.lanePorts.base (${w.lanePorts.base}) and workflow.lanePorts.step (${w.lanePorts.step}) needs port ${top}, above ${MAX_PORT} — lower the cap or the base/step`);
  config.workflow.localKeys = localKeys;
  config.workflow.testMode = mode;
  config.workflow.testModeSource = source;
  return config;
}
