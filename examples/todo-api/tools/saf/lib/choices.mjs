import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, LOCAL_CONFIG_FILE, LOCAL_KEYS, ROLE_LIBRARY, SKILL_PACKS, TEST_MODE_ENV, findRoot, loadSchema } from "./config.mjs";
import { STOP_HOOK_ENV } from "./task.mjs";

/** Setup choices as data (spec docs/specs/setup-choices.md): the interview questions, the settings it does not ask, where to change them. */
export const LANGS = ["en", "th"];
export const DOCS_URL = "https://github.com/Bellero-Advanced/super-agent-framework/blob/main/docs/config-reference.md";
export const INTERNAL_KEYS = ["$schema", "version"];

const SCHEMA = loadSchema();
const enumOf = (path) => path.split(".").reduce((n, k) => n.properties[k], SCHEMA).enum;
const YN = ["yes", "no"];
// [id, group, keys (space separated), kind, options]; group = 1-8 as in questions.md or "flow"; kind = choice | value | identity
const ROWS = [
  ["chat-language", 1, "people.chatLanguage", "choice", enumOf("people.chatLanguage")],
  ["doc-language", 1, "people.docLanguage", "choice", enumOf("people.docLanguage")],
  ["owner-title", 1, "people.ownerTitle", "identity"],
  ["ui-languages", 1, "people.uiLanguages people.i18nRequired", "choice", ["one", "several", "none"]],
  ["time-zone", 1, "people.timeZone", "identity"],
  ["project-identity", 2, "project.name project.pitch project.users project.domain", "identity"],
  ["project-type", 2, "project.type", "choice", enumOf("project.type")],
  ["project-stage", 2, "project.stage", "choice", enumOf("project.stage")],
  ["project-rigor", 2, "project.rigor", "choice", enumOf("project.rigor")],
  ["package-manager", 3, "stack.packageManager", "choice", enumOf("stack.packageManager")],
  ["commands", 3, "stack.commands.typecheck stack.commands.lint stack.commands.test stack.commands.e2e stack.commands.build", "value"],
  ["database", 3, "stack.database", "choice", ["none", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Supabase", "other"]],
  ["monorepo", 3, "stack.monorepo", "choice", YN],
  ["submodules", 3, "stack.submodules", "choice", YN],
  ["stack-summary", 3, "stack.summary", "identity"],
  ["model-preset", 4, "models.preset", "choice", enumOf("models.preset")],
  ["custom-models", 4, "models.planner models.builder", "value"],
  ["session-default", 4, "models.sessionDefault", "choice", ["builder", "planner"]],
  ["extra-roles", 5, "roles.enabled", "choice", Object.keys(ROLE_LIBRARY).filter((r) => !ROLE_LIBRARY[r].core)],
  ["custom-role", 5, "roles.custom", "value"],
  ["report-language", 5, "roles.reportLanguage", "choice", enumOf("roles.reportLanguage")],
  ["skill-packs", 5, "skills.packs", "choice", SKILL_PACKS],
  ["lanes", 6, "workflow.worktrees workflow.lanes.code workflow.lanes.main", "choice", ["on", "on-custom", "off"]],
  ["side-lanes", 6, "workflow.sideLanes.enabled workflow.sideLanes.max", "choice", ["on", "on-more", "off"]],
  ["solo", 6, "workflow.solo", "value"],
  ["lane-ports", 6, "workflow.lanePorts.base workflow.lanePorts.step workflow.lanePorts.env", "value"],
  ["lane-db", 6, "workflow.laneDb", "value"],
  ["measure", 6, "workflow.measure.enabled", "choice", YN],
  ["perf-budgets", 6, "workflow.perfBudgets", "value"],
  ["size-caps", 6, "workflow.sizes workflow.testCaps", "value"],
  ["merge-checks", 6, "workflow.mergeChecks", "value"],
  ["test-mode", 6, "workflow.testMode", "choice", enumOf("workflow.testMode")],
  ["test-files", 6, "stack.commands.testFiles", "value"],
  ["push", 7, "policies.push", "choice", enumOf("policies.push")],
  ["deploy", 7, "policies.deploy.mode policies.deploy.target policies.deploy.exceptions", "choice", enumOf("policies.deploy.mode")],
  ["branches", 7, "policies.protectedBranches policies.autoDeployBranches", "value"],
  ["no-force-push", 7, "policies.noForcePush", "choice", YN],
  ["secret-files", 7, "policies.secrets.envFiles", "value"],
  ["guarded-paths", 7, "policies.forbiddenPaths policies.ownerOnlyPaths", "value"],
  ["external-services", 7, "policies.externalServices", "value"],
  ["token-saving", 8, "tokenSaving.enabled tokenSaving.silentInterim tokenSaving.batchReviewerNotes tokenSaving.reviewerDiff tokenSaving.fixFlakyFirst", "choice", ["on", "choose", "off"]],
  ["first-goal", 8, "firstMilestone.goal", "identity"],
  ["adopt", "flow", "", "choice", YN],
  ["commit", "flow", "", "choice", YN],
];
export const QUESTIONS = ROWS.map(([id, group, keys, kind, options]) => ({ id, group, keys: keys.split(" ").filter(Boolean), kind, ...(options && { options }) }));

const ns = (en, th) => ({ en, th });
/** Settings no question sets: key → one-line summary. */
export const NOT_ASKED = {
  "models.overrides": ns('Change the model or effort of single roles, e.g. {"qa-runner": {"effort": "low"}}', 'เปลี่ยนโมเดลหรือ effort ของ role ใด role หนึ่ง เช่น {"qa-runner": {"effort": "low"}}'),
  "workflow.review": ns("Which cards get a spec review: m-cards (size M only), every-card, or every-card+security (plus a security audit per milestone); only the generated docs use it; default follows rigor", "การ์ดไหนได้รับการตรวจเทียบ spec: m-cards (เฉพาะขนาด M), every-card หรือ every-card+security (เพิ่มการตรวจความปลอดภัยทุก milestone) ใช้กับเอกสารที่สร้างเท่านั้น ค่าเริ่มต้นตาม rigor"),
  "workflow.worktreeDir": ns("Folder where lane worktrees are created", "โฟลเดอร์ที่สร้าง worktree ของแต่ละ lane"),
  "workflow.branchPrefix": ns("Prefix of lane branch names (ends with a slash)", "คำนำหน้าชื่อ branch ของแต่ละ lane (ลงท้ายด้วย /)"),
  "workflow.laneInstall": ns("Command that installs dependencies in a new lane (empty = none; default follows the package manager)", "คำสั่งติดตั้ง dependency ใน lane ใหม่ (ว่าง = ไม่ติดตั้ง; ค่าเริ่มต้นตาม package manager)"),
  "workflow.mergeInstall": ns("{cmd, files}: reinstall after a merge that changed one of these files (default follows the package manager)", "{cmd, files}: ติดตั้งใหม่หลัง merge ที่แก้ไฟล์เหล่านี้ (ค่าเริ่มต้นตาม package manager)"),
  "workflow.measure.waitMs": ns("How long (ms) a command waits for the measure lock or a quiet machine before it gives up (exit 75)", "ระยะเวลา (ms) ที่คำสั่งรอ measure lock หรือเครื่องที่ว่างก่อนยอมแพ้ (exit 75)"),
  "workflow.measure.maxLoadPerCore": ns("Machine load per core under which an idle-type command may start", "ค่าโหลดเครื่องต่อ core ที่ต่ำกว่านี้ คำสั่งชนิดรอเครื่องว่างจึงเริ่มได้"),
  "workflow.measure.names": ns("The command names the measure lock knows and whether each waits for a quiet machine (idle)", "ชื่อคำสั่งที่ measure lock รู้จัก และแต่ละชื่อรอให้เครื่องว่างหรือไม่ (idle)"),
  "workflow.alwaysAllowed": ns("Extra globs that never count as a card's changes", "glob เพิ่มเติมที่ไม่นับเป็นไฟล์ที่การ์ดแก้"),
  "workflow.commandTimeoutMs": ns("Time limit (ms) for each command of card verify, merge checks and culprit runs", "เวลาสูงสุด (ms) ของแต่ละคำสั่งตอน verify การ์ด, merge checks และการหา culprit"),
  "policies.secrets.extraPatterns": ns("Extra regular expressions that check-secrets treats as secrets", "regular expression เพิ่มเติมที่ check-secrets ถือว่าเป็นความลับ"),
  "policies.noTimeEstimates": ns("Records the rule 'no time estimates, use gates'; keep it true (the engine does not read it today)", "บันทึกกฎ 'ไม่ประเมินเวลา ใช้ gate แทน' ควรเป็น true (engine ยังไม่อ่านค่านี้)"),
  "policies.evidenceRequired": ns("Records the rule 'done needs a real run'; keep it true (the engine does not read it today)", "บันทึกกฎ 'ต้องมีผลรันจริงจึงถือว่าเสร็จ' ควรเป็น true (engine ยังไม่อ่านค่านี้)"),
};
/** Per-machine settings: the LOCAL_KEYS keys and the environment variables. */
export const MACHINE_SWITCHES = {
  "workflow.testMode": ns("How often the full test suite runs, for this machine only", "ความถี่ที่รันชุดทดสอบทั้งหมด เฉพาะเครื่องนี้"),
  [TEST_MODE_ENV]: ns("Environment variable: the test mode for this shell or run; it beats the local file and saf.config.json", "ตัวแปรสภาพแวดล้อม: โหมดทดสอบของ shell หรือการรันนี้ ชนะทั้งไฟล์ local และ saf.config.json"),
  [`${STOP_HOOK_ENV}=off`]: ns("Environment variable: turns off the Stop-hook reminder about a card that has not passed", "ตัวแปรสภาพแวดล้อม: ปิดการเตือนของ Stop hook เรื่องการ์ดที่ยังไม่ผ่าน"),
};
export const LABELS = {
  en: { head: "Settings the interview does not ask", where: `Change them in ${CONFIG_FILE} (check: node tools/saf/bin/saf.mjs config --check, or re-run /saf-setup).`, machine: `Per machine (${LOCAL_CONFIG_FILE}, not tracked by git, or an environment variable)` },
  th: { head: "การตั้งค่าที่ตอนสัมภาษณ์ไม่ได้ถาม", where: `แก้ได้ใน ${CONFIG_FILE} (ตรวจด้วย node tools/saf/bin/saf.mjs config --check หรือรัน /saf-setup ใหม่)`, machine: `ตั้งเฉพาะเครื่อง (${LOCAL_CONFIG_FILE} ไม่ถูกเก็บใน git หรือใช้ตัวแปรสภาพแวดล้อม)` },
};

/** Dotted path of every schema leaf: a property that is not an object with its own `properties`. */
export function schemaLeaves(schema, prefix = "") {
  return Object.entries(schema.properties ?? {}).flatMap(([k, n]) => (n.properties ? schemaLeaves(n, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

/** `--lang` wins; else people.chatLanguage of saf.config.json when valid; else en. Never throws, never writes. */
export function languageFor(cwd, lang) {
  if (lang) return lang;
  try {
    const file = join(findRoot(cwd), CONFIG_FILE);
    const chat = existsSync(file) ? JSON.parse(readFileSync(file, "utf8"))?.people?.chatLanguage : undefined;
    return LANGS.includes(chat) ? chat : "en";
  } catch {
    return "en";
  }
}

/** Output of `choices --not-asked`: every NOT_ASKED key with its summary and link, then the per-machine block. */
export function notAskedText(lang) {
  const L = LABELS[lang];
  const keys = Object.entries(NOT_ASKED).map(([k, v]) => `  ${k} — ${v[lang]} · ${DOCS_URL}#${k.split(".")[0]}`);
  const machine = Object.entries(MACHINE_SWITCHES).map(([k, v]) => `  ${k} — ${v[lang]}`);
  return [`${L.head}\n${L.where}`, ...keys, "", `${L.machine}:`, ...machine].join("\n");
}
