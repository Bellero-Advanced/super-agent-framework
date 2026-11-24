import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Installer — copies the SAF kit into a project.
 *
 *   kit/tools-saf/              → <project>/tools/saf/                 (engine + templates, vendored, no dependencies)
 *   kit/claude/skills/saf-setup → <project>/.claude/skills/saf-setup/  (the setup interview skill)
 *   saf.config.json stub (only when missing) · .gitignore lines
 *
 * `init --answers` then runs the generator in-process from the copied engine, so the project is set up exactly as
 * `/saf-setup` would leave it. `upgrade` replaces only kit-owned files; project content stays, except that missing engine scripts are added to package.json.
 */

export const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "kit");
export const ENGINE_DEST = "tools/saf";
export const SKILL_DEST = ".claude/skills/saf-setup";
export const kitVersion = () => readFileSync(join(KIT, "tools-saf", "VERSION"), "utf8").trim();

const engineModule = (root, mod) => import(pathToFileURL(join(root, ENGINE_DEST, "lib", mod)).href);

function readVersion(root) {
  try {
    return readFileSync(join(root, ENGINE_DEST, "VERSION"), "utf8").trim();
  } catch {
    return null;
  }
}

function copyKit(root) {
  rmSync(join(root, ENGINE_DEST), { recursive: true, force: true });
  mkdirSync(dirname(join(root, ENGINE_DEST)), { recursive: true });
  cpSync(join(KIT, "tools-saf"), join(root, ENGINE_DEST), { recursive: true });
  rmSync(join(root, SKILL_DEST), { recursive: true, force: true });
  mkdirSync(dirname(join(root, SKILL_DEST)), { recursive: true });
  cpSync(join(KIT, "claude", "skills", "saf-setup"), join(root, SKILL_DEST), { recursive: true });
}

/**
 * @param {string} root project folder (created when missing)
 * @param {{answers?:object, adopt?:boolean, now?:Date, log?:(s:string)=>void}} opts
 */
export async function init(root, opts = {}) {
  const log = opts.log ?? (() => {});
  mkdirSync(root, { recursive: true });
  const before = readVersion(root);
  const { detectProject } = await import(pathToFileURL(join(KIT, "tools-saf", "lib", "detect.mjs")).href);
  const detected = detectProject(root);
  copyKit(root);
  log(`✓ SAF ${kitVersion()} engine → ${ENGINE_DEST}/${before ? ` (replaced ${before})` : ""}`);
  log(`✓ setup skill → ${SKILL_DEST}/`);

  const { CONFIG_FILE } = await engineModule(root, "config.mjs");
  if (!existsSync(join(root, CONFIG_FILE))) {
    const stub = { $schema: "tools/saf/schema/saf.config.schema.json", version: 1, project: { name: detected.name } };
    writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(stub, null, 2)}\n`);
    log(`✓ ${CONFIG_FILE} stub (setup fills it)`);
  }
  const { mergeGitignore, generate } = await engineModule(root, "generate.mjs");
  const { resolveConfig } = await engineModule(root, "config.mjs");
  mergeGitignore(root, resolveConfig({}), null);

  const existing = detected.existing.claudeMd || detected.existing.docsIndex || detected.existing.agents.length > 0 || detected.existing.plan;
  if (existing) log("• existing project detected — files setup replaces are moved to docs/archive/pre-saf/, never deleted");

  if (!opts.answers) {
    log("");
    log("Next: open Claude Code in this folder and run the setup interview:");
    log("    claude");
    log("    /saf-setup");
    return { detected, report: null };
  }
  const { report, config } = generate(root, opts.answers, { adopt: opts.adopt, now: opts.now });
  log(`✓ setup generated ${report.written.length} file(s)`);
  for (const a of report.archived) log(`  archived: ${a}`);
  for (const r of report.removed) log(`  removed (no longer shipped): ${r}`);
  for (const w of report.warnings) log(`  ⚠ ${w}`);
  return { detected, report, config };
}

/**
 * Add the engine's package.json scripts the project lacks (never change an existing one, never create the file).
 * Keeps the file's indentation, line endings and trailing newline; writes only when a script was added.
 */
async function mergeUpgradeScripts(root, log) {
  const result = { added: [], kept: [] };
  const { CONFIG_FILE, validateConfig, resolveConfig } = await engineModule(root, "config.mjs");
  const { PACKAGE_INVALID, engineScripts, mergeScriptsText } = await engineModule(root, "generate.mjs");
  let raw = null;
  try {
    raw = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
  } catch {}
  if (!raw || validateConfig(raw).length) {
    log(`  ⚠ ${CONFIG_FILE} is missing or invalid — package.json scripts were not checked`);
    return result;
  }
  const config = resolveConfig(raw);
  if (config.stack.packageManager === "none") return result;
  const file = join(root, "package.json");
  const hint = "run the engine as `node tools/saf/bin/saf.mjs <command>`";
  if (!existsSync(file)) {
    log(`  • no package.json — scripts were not added; ${hint}`);
    return result;
  }
  const want = engineScripts(config);
  const res = mergeScriptsText(readFileSync(file, "utf8"), want);
  if (res.invalid) {
    log(`  ⚠ ${PACKAGE_INVALID[res.reason]} — scripts were not added; ${hint}`);
    return result;
  }
  result.added = res.added;
  result.kept = res.kept;
  for (const name of res.kept) log(`  kept script: ${name} (SAF expects "${want[name]}")`);
  if (res.text !== null) writeFileSync(file, res.text);
  for (const name of result.added) log(`  added script: ${name}`);
  return result;
}

/**
 * Replace the vendored engine and the setup skill; refresh the `/saf` commands and skills SAF shipped (unless edited) and
 * remove ones it no longer ships; add the engine's missing package.json scripts. Project docs and plan files stay.
 */
export async function upgrade(root, opts = {}) {
  const log = opts.log ?? (() => {});
  const before = readVersion(root);
  if (!before) throw new Error(`no ${ENGINE_DEST}/ here — run init first`);
  const { CONFIG_FILE, validateConfig } = await import(pathToFileURL(join(KIT, "tools-saf", "lib", "config.mjs")).href);
  let config = null;
  if (existsSync(join(root, CONFIG_FILE))) {
    let why = null;
    try {
      config = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
      if (!config || typeof config !== "object" || Array.isArray(config)) why = "is not a JSON object";
    } catch {
      why = "is not valid JSON";
    }
    if (why) {
      const line = `✗ ${CONFIG_FILE} ${why} — upgrade changed nothing; fix it and run upgrade again`;
      log(line);
      return { before, after: before, report: null, errors: [line], scripts: null };
    }
  }
  copyKit(root);
  log(`✓ SAF ${before} → ${kitVersion()} (${ENGINE_DEST}/ and ${SKILL_DEST}/ replaced)`);
  const scripts = await mergeUpgradeScripts(root, log);
  const { refreshKitFiles } = await engineModule(root, "generate.mjs");
  const report = refreshKitFiles(root);
  for (const w of report.written) log(`  refreshed: ${w}`);
  for (const r of report.removed) log(`  removed (no longer shipped): ${r}`);
  for (const k of report.kept) log(`  kept: ${k}`);
  for (const w of report.warnings) log(`  ⚠ ${w}`);
  const errors = config ? validateConfig(config) : [];
  for (const e of errors) log(`  ✗ ${CONFIG_FILE}: ${e}`);
  log("Project docs were not changed. To regenerate them with the new templates, run /saf-setup again (edited files are archived first).");
  return { before, after: kitVersion(), report, errors, scripts };
}
