import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, LOCAL_CONFIG_FILE, LOCAL_KEYS, MODEL_PRESETS, RIGOR, ROLE_LIBRARY, SKILL_PACKS, TEST_MODE_ENV, findRoot, loadSchema } from "./config.mjs";
import { STOP_HOOK_ENV } from "./task.mjs";

/** Setup choices as data (spec docs/specs/setup-choices.md): the interview questions, the settings it does not ask, where to change them. */
export const LANGS = ["en", "th"];
export const DOCS_URL = "https://github.com/Bellero-Advanced/super-agent-framework/blob/main/docs/config-reference.md";
export const INTERNAL_KEYS = ["$schema", "version"];
/** Interview groups `choices --group` accepts. */
export const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, "flow"];
/** Longest text of one explanation field (characters, per language): one short sentence. */
export const FIELD_MAX = 160;

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

const F = ([what, good, cost, when]) => ({ what, good, cost, when });
/** One explanation: question id, the option values it covers (empty for a `value` question), then [what, good for, cost, pick it when] in en and th. Numbers and model ids come from RIGOR / MODEL_PRESETS (groupText), never from the text. */
const E = (question, values, en, th) => ({ question, values: values.split(" ").filter(Boolean), en: F(en), th: F(th) });
/** Explanations for groups 1-4; every claim is what the option changes in SAF (generate.mjs rules and templates, config.mjs RIGOR / MODEL_PRESETS / scriptCommand). */
export const CHOICES = [
  E("chat-language", "en th", ["The language agents use when they talk to you; it is written into CLAUDE.md and the /saf command.", "Reading answers in the language you think in.", "Agent reports follow a separate report language, so reports can differ from the chat.", "you want to read replies in that language."],
    ["ภาษาที่ agent ใช้คุยกับคุณ เขียนไว้ใน CLAUDE.md และคำสั่ง /saf", "อ่านคำตอบเป็นภาษาที่คุณคิด", "รายงานของ agent ใช้ภาษารายงานที่ตั้งแยกไว้ จึงอาจต่างจากภาษาที่คุย", "อยากอ่านคำตอบเป็นภาษานั้น"]),
  E("doc-language", "en th", ["The language of the generated CLAUDE.md, plan files, status files and commands.", "Documents your team can read without translating.", "Documents exist in one language; switching later means re-running setup to regenerate them.", "your team writes and reads project documents in that language."],
    ["ภาษาของ CLAUDE.md แผนงาน ไฟล์สถานะ และคำสั่งที่สร้างขึ้น", "เอกสารที่ทีมอ่านได้โดยไม่ต้องแปล", "เอกสารมีภาษาเดียว ถ้าเปลี่ยนทีหลังต้องรัน setup ใหม่เพื่อสร้างเอกสารใหม่", "ทีมเขียนและอ่านเอกสารโปรเจกต์เป็นภาษานั้น"]),
  E("ui-languages", "one none", ["Records the one UI language (or none) and adds no translation rule or translation skill pack.", "Products shown in a single language, or with no screens.", "Strings are not forced through translation keys, so adding a language later means retrofitting them.", "the product has one UI language or no UI."],
    ["บันทึกภาษา UI ภาษาเดียว (หรือไม่มี UI) และไม่เพิ่มกฎการแปลหรือ skill pack การแปล", "ผลิตภัณฑ์ที่แสดงภาษาเดียว หรือไม่มีหน้าจอ", "ข้อความไม่ถูกบังคับให้ผ่าน key สำหรับแปล ถ้าจะเพิ่มภาษาทีหลังต้องไล่แก้ข้อความเดิม", "ผลิตภัณฑ์มี UI ภาษาเดียวหรือไม่มี UI"]),
  E("ui-languages", "several", ["Marks translation as required: the UI rule demands translation keys for every user-facing string and the translation skill pack is recommended.", "Products shipped in several languages from the start.", "Every user-facing string needs a key in each language, so each card that touches text does more work.", "the product ships in more than one language."],
    ["ตั้งให้ต้องรองรับหลายภาษา: กฎ UI บังคับให้ข้อความที่ผู้ใช้เห็นทุกคำผ่าน key สำหรับแปล และแนะนำ skill pack การแปล", "ผลิตภัณฑ์ที่ออกหลายภาษาตั้งแต่แรก", "ข้อความทุกคำต้องมี key ครบทุกภาษา การ์ดที่แตะข้อความจึงมีงานเพิ่ม", "ผลิตภัณฑ์ออกมากกว่าหนึ่งภาษา"]),
  E("project-type", "web-app erp", ["Adds the UI rule and the server rule for matching files and recommends the ui-frontend skill pack.", "Apps with screens and a back end, such as a web app, SaaS or business system.", "Both rules load on every matching file, which adds rules to follow even in a small project.", "it is a web app, SaaS or business system with screens and a server."],
    ["เพิ่มกฎ UI และกฎฝั่งเซิร์ฟเวอร์สำหรับไฟล์ที่ตรงกัน และแนะนำ skill pack ui-frontend", "แอปที่มีหน้าจอและ back end เช่น เว็บแอป SaaS หรือระบบธุรกิจ", "กฎทั้งสองโหลดกับทุกไฟล์ที่ตรงกัน จึงมีข้อต้องทำตามเพิ่มแม้ในโปรเจกต์เล็ก", "เป็นเว็บแอป SaaS หรือระบบธุรกิจที่มีหน้าจอและเซิร์ฟเวอร์"]),
  E("project-type", "mobile", ["Adds the UI and server rules and recommends the ui-frontend and mobile skill packs.", "Phone or tablet apps with a server behind them.", "Both rules load on every matching file, and the mobile pack adds device, offline and store checks to mobile cards.", "the app ships to phones or tablets."],
    ["เพิ่มกฎ UI และกฎฝั่งเซิร์ฟเวอร์ และแนะนำ skill pack ui-frontend กับ mobile", "แอปมือถือหรือแท็บเล็ตที่มีเซิร์ฟเวอร์อยู่เบื้องหลัง", "กฎทั้งสองโหลดกับทุกไฟล์ที่ตรงกัน และ pack mobile เพิ่มการเช็กเรื่องอุปกรณ์ ออฟไลน์ และ build ขึ้นสโตร์ให้การ์ดมือถือ", "แอปปล่อยบนมือถือหรือแท็บเล็ต"]),
  E("project-type", "game", ["Adds the UI and server rules, recommends the ui-frontend, performance and game skill packs and suggests the art-producer role.", "Games where the server decides results and speed and assets have budgets.", "The server rule makes the server the authority, which is extra work for a game with no server.", "it is a game, especially a multiplayer one."],
    ["เพิ่มกฎ UI และกฎฝั่งเซิร์ฟเวอร์ แนะนำ skill pack ui-frontend, performance และ game และเสนอ role art-producer", "เกมที่เซิร์ฟเวอร์ตัดสินผล และมีงบด้านความเร็วกับ asset", "กฎฝั่งเซิร์ฟเวอร์ให้เซิร์ฟเวอร์เป็นผู้ตัดสิน จึงเป็นงานเพิ่มสำหรับเกมที่ไม่มีเซิร์ฟเวอร์", "เป็นเกม โดยเฉพาะเกมหลายผู้เล่น"]),
  E("project-type", "api", ["Adds only the server rule: the server decides values, inputs are validated and every action is authorized.", "Back ends and APIs with no screens of their own.", "No UI rule or skill pack is added, so a UI added later gets no guidance until you change the type.", "it is a service or API that other programs call."],
    ["เพิ่มเฉพาะกฎฝั่งเซิร์ฟเวอร์: เซิร์ฟเวอร์ตัดสินค่าสำคัญ ตรวจ input ทุกครั้ง และเช็กสิทธิ์ทุกการกระทำ", "back end และ API ที่ไม่มีหน้าจอของตัวเอง", "ไม่เพิ่มกฎ UI หรือ skill pack ถ้ามี UI ทีหลังจะไม่มีแนวทางจนกว่าจะเปลี่ยนประเภท", "เป็นบริการหรือ API ที่โปรแกรมอื่นเรียกใช้"]),
  E("project-type", "data-ai", ["Adds no type-specific rule or skill pack and suggests the data-engineer role.", "Pipelines, analytics and model work measured against a fixed dataset.", "Nothing guides UI or server code, so those parts of the project get only the general rules.", "it is a data pipeline or an AI product."],
    ["ไม่เพิ่มกฎหรือ skill pack เฉพาะประเภท และเสนอ role data-engineer", "งาน pipeline วิเคราะห์ข้อมูล และโมเดลที่วัดผลกับชุดข้อมูลคงที่", "ไม่มีแนวทางสำหรับโค้ด UI หรือเซิร์ฟเวอร์ ส่วนนั้นของโปรเจกต์จึงได้เฉพาะกฎทั่วไป", "เป็น data pipeline หรือผลิตภัณฑ์ AI"]),
  E("project-type", "library-cli other", ["Adds no type-specific rule or skill pack; the type is only a label in CLAUDE.md.", "Libraries, command-line tools and anything the other types do not describe.", "Agents get only the general rules, with no UI or server guidance.", "it is a library, a command-line tool or fits no other type."],
    ["ไม่เพิ่มกฎหรือ skill pack เฉพาะประเภท ประเภทเป็นเพียงป้ายใน CLAUDE.md", "ไลบรารี เครื่องมือบรรทัดคำสั่ง และอย่างอื่นที่ประเภทอื่นไม่ครอบคลุม", "agent ได้เฉพาะกฎทั่วไป ไม่มีแนวทางเรื่อง UI หรือเซิร์ฟเวอร์", "เป็นไลบรารี เครื่องมือบรรทัดคำสั่ง หรือไม่เข้าประเภทอื่น"]),
  E("project-stage", "idea prototype mvp production", ["Records how far the project is; it only appears in the CLAUDE.md header and no rule reads it.", "Showing agents and newcomers the project's phase at a glance.", "It changes no rule or limit; rigor is the setting that tightens or loosens the workflow.", "it matches where the project really is; update it when the project moves on."],
    ["บันทึกว่าโปรเจกต์อยู่ระยะไหน แสดงเฉพาะส่วนหัวของ CLAUDE.md ไม่มีกฎใดอ่านค่านี้", "ให้ agent และคนใหม่เห็นระยะของโปรเจกต์ได้ทันที", "ไม่เปลี่ยนกฎหรือเพดานใด ๆ ส่วนที่ทำให้ขั้นตอนเข้มหรือหลวมคือ rigor", "ตรงกับระยะจริงของโปรเจกต์ และแก้เมื่อโปรเจกต์ขยับไปต่อ"]),
  E("project-rigor", "light", ["The loosest defaults: larger cards, a spec review only for size-M cards, and the test command as the only project check at merge.", "Prototypes and solo experiments where speed matters more than process.", "Fewer reviews and checks, so mistakes are found later and cost more to fix.", "it is a quick prototype or a throwaway experiment."],
    ["ค่าเริ่มต้นแบบหลวมที่สุด: การ์ดใหญ่ขึ้น ตรวจเทียบ spec เฉพาะการ์ดขนาด M และตอน merge รันคำสั่ง test เป็นเช็กเดียวของโปรเจกต์", "โปรโตไทป์และงานทดลองคนเดียวที่ความเร็วสำคัญกว่าขั้นตอน", "ตรวจและเช็กน้อยลง จึงเจอข้อผิดพลาดช้าและแก้แพงกว่า", "เป็นโปรโตไทป์เร็ว ๆ หรืองานทดลองที่ทิ้งได้"]),
  E("project-rigor", "standard", ["The middle defaults: every card gets a spec review, and merge runs the typecheck, lint and test commands the project has.", "Most projects that mean to keep their code.", "Every card waits for a review, which costs agent time and tokens.", "you have no strong reason for the other two."],
    ["ค่าเริ่มต้นระดับกลาง: ทุกการ์ดถูกตรวจเทียบ spec และตอน merge รัน typecheck, lint และ test เท่าที่โปรเจกต์มี", "โปรเจกต์ส่วนใหญ่ที่ตั้งใจเก็บโค้ดไว้ใช้ต่อ", "ทุกการ์ดต้องรอการตรวจ ซึ่งใช้เวลาและ token ของ agent", "ไม่มีเหตุผลชัดเจนให้ไปทางอื่น"]),
  E("project-rigor", "strict", ["The tightest defaults: smaller cards, a spec review on every card, a security audit per milestone, and build added to the merge checks.", "Production systems and products that handle money or personal data.", "More and smaller cards plus the extra audits cost the most time and tokens.", "a mistake would hurt users or money."],
    ["ค่าเริ่มต้นเข้มที่สุด: การ์ดเล็กลง ตรวจเทียบ spec ทุกการ์ด ตรวจความปลอดภัยทุก milestone และเพิ่ม build ในเช็กตอน merge", "ระบบจริงที่มีผู้ใช้ และผลิตภัณฑ์ที่จัดการเงินหรือข้อมูลส่วนบุคคล", "การ์ดมากและเล็กลงพร้อมการตรวจเพิ่ม ใช้เวลาและ token มากที่สุด", "ความผิดพลาดจะกระทบผู้ใช้หรือเงิน"]),
  E("package-manager", "pnpm npm yarn bun", ["Writes every SAF command in this manager's syntax, adds the saf scripts to package.json and sets the lane install command and lock files.", "Commands in docs and cards that you can copy and run as written.", "After switching, the generated docs keep the old syntax until you re-run setup.", "it is the manager your lock file already uses."],
    ["เขียนทุกคำสั่งของ SAF ตามไวยากรณ์ของตัวจัดการแพ็กเกจนี้ เพิ่มสคริปต์ saf ใน package.json และกำหนดคำสั่งติดตั้งของ lane กับไฟล์ lock", "คำสั่งในเอกสารและการ์ดที่คัดลอกไปรันได้ตามที่เขียน", "ถ้าเปลี่ยนทีหลัง เอกสารที่สร้างไว้ยังใช้ไวยากรณ์เก่าจนกว่าจะรัน setup ใหม่", "เป็นตัวที่ไฟล์ lock ของโปรเจกต์ใช้อยู่แล้ว"]),
  E("package-manager", "none", ["Assumes no Node tooling: SAF commands run as node tools/saf/bin/saf.mjs, no package.json is written and lanes run no install step.", "Projects in other languages that have no package.json.", "Commands are longer to type, and a new lane does not install dependencies for you.", "the project is not a Node project."],
    ["ถือว่าไม่มีเครื่องมือ Node: คำสั่ง SAF รันเป็น node tools/saf/bin/saf.mjs ไม่เขียน package.json และ lane ไม่มีขั้นติดตั้ง", "โปรเจกต์ภาษาอื่นที่ไม่มี package.json", "คำสั่งยาวขึ้น และ lane ใหม่ไม่ติดตั้ง dependency ให้", "โปรเจกต์ไม่ใช่โปรเจกต์ Node"]),
  E("commands", "", ["The project's own typecheck, lint, test, e2e and build commands, which SAF lists in the generated docs and runs as merge checks.", "Cards and merges that run the checks your project really has.", "A wrong command fails every merge that runs it; an empty one is skipped.", "you know the real command; leave one empty when the project has none."],
    ["คำสั่ง typecheck lint test e2e และ build ของโปรเจกต์เอง ซึ่ง SAF ใส่ในเอกสารที่สร้างและรันเป็นเช็กตอน merge", "การ์ดและ merge ที่รันเช็กที่โปรเจกต์มีอยู่จริง", "คำสั่งที่ผิดจะทำให้ทุก merge ที่รันมันไม่ผ่าน ส่วนคำสั่งที่ว่างจะถูกข้าม", "รู้คำสั่งจริง และเว้นว่างตัวที่โปรเจกต์ไม่มี"]),
  E("database", "none", ["Adds no database rule and no db-migrations skill recommendation.", "Projects that store nothing in a database.", "If a database appears later, the migration guidance is missing until you set it here and re-run setup.", "the project has no database."],
    ["ไม่เพิ่มกฎฐานข้อมูลและไม่แนะนำ skill pack db-migrations", "โปรเจกต์ที่ไม่เก็บอะไรในฐานข้อมูล", "ถ้ามีฐานข้อมูลทีหลัง จะไม่มีแนวทางเรื่อง migration จนกว่าจะตั้งค่าที่นี่แล้วรัน setup ใหม่", "โปรเจกต์ไม่มีฐานข้อมูล"]),
  E("database", "PostgreSQL MySQL SQLite MongoDB Supabase other", ["Adds the database rule for migration and schema files and recommends the db-migrations pack and the db-guardian role; every database is treated alike.", "Any project with a database, whichever product it uses.", "Migrations become forward-only and are rehearsed on a test database first, which slows schema changes.", "the project has a database, whichever one."],
    ["เพิ่มกฎฐานข้อมูลสำหรับไฟล์ migration และ schema แนะนำ pack db-migrations และ role db-guardian โดย SAF ถือว่าทุกฐานข้อมูลเหมือนกัน", "โปรเจกต์ที่มีฐานข้อมูล ไม่ว่าจะใช้ตัวไหน", "migration ต้องเดินหน้าอย่างเดียวและซ้อมบนฐานข้อมูลทดสอบก่อน ทำให้การเปลี่ยน schema ช้าลง", "โปรเจกต์มีฐานข้อมูล ไม่ว่าตัวไหน"]),
  E("monorepo", "yes no", ["Marks the package manager row of CLAUDE.md as a monorepo; nothing else in SAF changes.", "Showing readers that the repo holds several packages.", "SAF does not run commands per package, so the project commands you give must work from the repo root.", "one repo holds several packages or apps (answer yes)."],
    ["ใส่คำว่า monorepo ต่อท้ายแถว package manager ใน CLAUDE.md ส่วนอื่นของ SAF ไม่เปลี่ยน", "ให้ผู้อ่านรู้ว่า repo นี้มีหลายแพ็กเกจ", "SAF ไม่รันคำสั่งแยกตามแพ็กเกจ คำสั่งของโปรเจกต์ที่ใส่ไว้จึงต้องรันได้จาก root ของ repo", "repo เดียวมีหลายแพ็กเกจหรือหลายแอป (ตอบ yes)"]),
  E("submodules", "yes no", ["Only records that the repo uses git submodules; no SAF file or command reads it.", "Keeping the stack facts complete for people reading the config.", "SAF ignores changes inside submodules when it lists a card's files, whatever you answer.", "the repo has a .gitmodules file (answer yes)."],
    ["เพียงบันทึกว่า repo ใช้ git submodule ไม่มีไฟล์หรือคำสั่งของ SAF อ่านค่านี้", "ให้ข้อมูล stack ครบสำหรับคนที่อ่าน config", "SAF ไม่นับการเปลี่ยนแปลงใน submodule ตอนดูไฟล์ที่การ์ดแก้ ไม่ว่าตอบอะไร", "repo มีไฟล์ .gitmodules (ตอบ yes)"]),
  E("model-preset", "max", ["Planner roles use the top model and builder roles the next one down; the effort of each role stays the same.", "Hard design and review work where quality matters most.", "The highest spend per card of all presets.", "a design or review mistake costs more than the tokens."],
    ["role ฝั่งวางแผนใช้โมเดลสูงสุด role ฝั่งลงมือใช้โมเดลถัดลงมา ส่วน effort ของแต่ละ role เท่าเดิม", "งานออกแบบและตรวจที่ยากและต้องการคุณภาพสูงสุด", "ค่าใช้จ่ายต่อการ์ดสูงที่สุดในทุก preset", "ความผิดพลาดในการออกแบบหรือตรวจเสียหายมากกว่าค่า token"]),
  E("model-preset", "balanced", ["Planner roles use the strong model and builder roles a mid-size one.", "Most projects.", "Builders run a smaller model than under Max, so hard cards may need more review rounds.", "budget and the difficulty of the work do not point elsewhere."],
    ["role ฝั่งวางแผนใช้โมเดลแรง role ฝั่งลงมือใช้โมเดลขนาดกลาง", "โปรเจกต์ส่วนใหญ่", "role ฝั่งลงมือใช้โมเดลเล็กกว่า Max การ์ดยากอาจต้องตรวจซ้ำหลายรอบ", "งบและความยากของงานไม่ได้ชี้ไปทางอื่น"]),
  E("model-preset", "economy", ["Both tiers step down: planner roles use the mid-size model and builder roles the smallest one.", "Small projects and tight budgets.", "Weaker planning and review, so complex cards can need more rework.", "cost matters more than polish."],
    ["ทั้งสองฝั่งลดลงหนึ่งระดับ: role ฝั่งวางแผนใช้โมเดลขนาดกลาง role ฝั่งลงมือใช้โมเดลเล็กที่สุด", "โปรเจกต์เล็กและงบจำกัด", "การวางแผนและตรวจอ่อนลง การ์ดที่ซับซ้อนอาจต้องแก้ซ้ำมากขึ้น", "ค่าใช้จ่ายสำคัญกว่าความละเอียด"]),
  E("model-preset", "custom", ["You name the planner and builder models yourself; the roles use them instead of a preset pair.", "Models no preset lists, such as a newer release or one your account provides.", "SAF checks only that an id looks like a Claude model id, so a typo breaks every role that uses it.", "no preset fits your models or budget."],
    ["คุณระบุโมเดลฝั่งวางแผนและฝั่งลงมือเอง role ต่าง ๆ จะใช้โมเดลนั้นแทนคู่ของ preset", "โมเดลที่ไม่มีใน preset เช่นรุ่นใหม่กว่าหรือรุ่นที่บัญชีของคุณมี", "SAF ตรวจแค่ว่า id หน้าตาเหมือน id โมเดลของ Claude ถ้าพิมพ์ผิด role ที่ใช้โมเดลนั้นจะพังทุกตัว", "ไม่มี preset ไหนตรงกับโมเดลหรืองบของคุณ"]),
  E("custom-models", "", ["The planner and builder model ids used with the Custom preset; planner roles are the designer, spec-reviewer and security-auditor, builders are the rest.", "Putting your own models on each tier.", "An id left empty falls back to the Balanced model for that tier.", "the preset is Custom; the other presets already name both models."],
    ["id โมเดลฝั่งวางแผนและฝั่งลงมือที่ใช้กับ preset Custom ฝั่งวางแผนคือ designer, spec-reviewer และ security-auditor ที่เหลือเป็นฝั่งลงมือ", "ใส่โมเดลของคุณเองให้แต่ละฝั่ง", "ถ้าเว้น id ไว้ จะใช้โมเดลของ Balanced สำหรับฝั่งนั้นแทน", "เลือก preset Custom ส่วน preset อื่นระบุโมเดลทั้งสองฝั่งให้แล้ว"]),
  E("session-default", "builder", ["Makes CLAUDE.md advise opening sessions without --model on the builder model; SAF only writes the advice, you set it in .claude/settings.local.json.", "Everyday card work at the lower cost.", "Planning and review sessions need an explicit --model to use the planner model.", "most of your sessions build cards."],
    ["ให้ CLAUDE.md แนะนำให้เปิด session ที่ไม่ใส่ --model ด้วยโมเดลฝั่งลงมือ SAF เขียนแค่คำแนะนำ คุณต้องตั้งเองใน .claude/settings.local.json", "งานทำการ์ดประจำวันด้วยค่าใช้จ่ายที่ต่ำกว่า", "session วางแผนและตรวจต้องใส่ --model เองจึงจะใช้โมเดลฝั่งวางแผน", "session ส่วนใหญ่ของคุณทำการ์ด"]),
  E("session-default", "planner", ["Makes CLAUDE.md advise opening sessions without --model on the planner model; SAF only writes the advice, you set it in .claude/settings.local.json.", "Sessions that mostly plan, design and review.", "Quick card work in such a session also runs on the stronger, costlier model.", "most of your sessions plan and review."],
    ["ให้ CLAUDE.md แนะนำให้เปิด session ที่ไม่ใส่ --model ด้วยโมเดลฝั่งวางแผน SAF เขียนแค่คำแนะนำ คุณต้องตั้งเองใน .claude/settings.local.json", "session ที่ส่วนใหญ่วางแผน ออกแบบ และตรวจ", "งานการ์ดเล็ก ๆ ใน session แบบนี้ก็ใช้โมเดลที่แรงกว่าและแพงกว่าไปด้วย", "session ส่วนใหญ่ของคุณวางแผนและตรวจ"]),
];

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
  en: { head: "Settings the interview does not ask", where: `Change them in ${CONFIG_FILE} (check: node tools/saf/bin/saf.mjs config --check, or re-run /saf-setup).`, machine: `Per machine (${LOCAL_CONFIG_FILE}, not tracked by git, or an environment variable)`, setting: "Setting", fields: ["What it is", "Good for", "Cost", "Pick it when"], sizes: "Card size S / M", caps: "Test caps S / M", review: "Review", merge: "Merge checks", planner: "Planner model", builder: "Builder model" },
  th: { head: "การตั้งค่าที่ตอนสัมภาษณ์ไม่ได้ถาม", where: `แก้ได้ใน ${CONFIG_FILE} (ตรวจด้วย node tools/saf/bin/saf.mjs config --check หรือรัน /saf-setup ใหม่)`, machine: `ตั้งเฉพาะเครื่อง (${LOCAL_CONFIG_FILE} ไม่ถูกเก็บใน git หรือใช้ตัวแปรสภาพแวดล้อม)`, setting: "การตั้งค่า", fields: ["คืออะไร", "เหมาะกับ", "ราคาที่ต้องจ่าย", "เลือกเมื่อ"], sizes: "ขนาดการ์ด S / M", caps: "เพดานการทดสอบ S / M", review: "การตรวจ", merge: "เช็กตอน merge", planner: "โมเดลฝั่งวางแผน", builder: "โมเดลฝั่งลงมือ" },
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

/** Values an option derives, appended by the renderer so no number or model id lives in the text (rule 8). */
const derived = {
  "project-rigor": (v, L) => RIGOR[v] && `${L.sizes}: ${RIGOR[v].sizes.S} / ${RIGOR[v].sizes.M} · ${L.caps}: ${RIGOR[v].testCaps.S} / ${RIGOR[v].testCaps.M} · ${L.review}: ${RIGOR[v].review} · ${L.merge}: ${RIGOR[v].merge.join(" · ")}`,
  "model-preset": (v, L) => MODEL_PRESETS[v] && `${L.planner}: ${MODEL_PRESETS[v].planner} · ${L.builder}: ${MODEL_PRESETS[v].builder}`,
};

/** Output of `choices --group <g>`: per question of the group its keys, then each explanation (option values, four fields, derived values). Identity questions carry no explanation and are left out. */
export function groupText(group, lang) {
  const L = LABELS[lang];
  const blocks = QUESTIONS.filter((q) => String(q.group) === String(group)).flatMap((q) => {
    const entries = CHOICES.filter((e) => e.question === q.id);
    if (!entries.length) return [];
    const body = entries.flatMap((e) => {
      const extra = e.values.length === 1 ? derived[q.id]?.(e.values[0], L) : undefined;
      return [...(e.values.length ? [`- ${e.values.join(" · ")}`] : []), ...Object.values(e[lang]).map((text, i) => `    ${L.fields[i]}: ${text}`), ...(extra ? [`    ${extra}`] : [])];
    });
    return [`## ${q.keys.join(" · ")}`, ...body, ""];
  });
  return blocks.join("\n").trimEnd();
}
