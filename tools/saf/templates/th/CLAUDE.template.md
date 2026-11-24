# CLAUDE.md — {{project.name}}

{{#if project.pitch}}
{{project.pitch}}
{{/if}}
{{typeLabel}} · ระยะ: {{project.stage}}{{#if project.domain}} · โดเมน: {{project.domain}}{{/if}}{{#if project.users}} · ผู้ใช้: {{project.users}}{{/if}}

ไฟล์นี้ = กฎที่ห้ามละเมิด + คำสั่ง + จุดเริ่มอ่าน · เรื่องอื่นทั้งหมดอยู่ใน [docs/INDEX.md](docs/INDEX.md) (หนึ่งเรื่องมีบ้านเดียว)

## เริ่มงานทุกครั้ง

1. งานปัจจุบัน: hook SessionStart ฉีดสรุปให้ทุก session (milestone · การ์ดที่กำลังทำ · เกณฑ์ผ่าน · ไฟล์ที่แตะได้) · ตัวเต็ม `docs/plan/STATE.md` · วิธีทำงานด้วยการ์ด `docs/plan/README.md`
2. หาบ้านของเรื่องที่จะแตะใน `docs/INDEX.md` แล้วอ่านเฉพาะหัวข้อนั้น — ไม่ไล่อ่านทั้งชุด
3. ข้อมูลขัดกัน → ลำดับใน `docs/DECISIONS.md` §0: คำสั่งล่าสุดของ {{owner}} → DECISIONS → บ้านของเรื่อง · `docs/archive/` เป็นประวัติ ไม่ใช่ที่ตัดสิน
4. กฎตาม path อยู่ใน `.claude/rules/` โหลดเองเมื่อแตะไฟล์ที่ตรง

## เปิด session ตามบทบาท

agent อยู่ใน `.claude/agents/` (โมเดล + effort ตายตัวต่อบทบาท — `{{cmd.docsCheck}}` ตรวจ) · `/saf <อะไรก็ได้เป็นภาษาคน>` ส่งงานให้ถูกทาง (รอบการ์ด · วางแผน · บั๊ก · ทดสอบ · ความปลอดภัย · วิธีใช้) · skill ใน `.claude/skills/` โหลดเอง

| งาน | บทบาท | เปิด session หลักด้วย |
|---|---|---|
{{#each sessionRows}}
| {{.work}} | {{.roles}} | `claude --model {{.model}}` |
{{/each}}

`--model` ชนะ `ANTHROPIC_MODEL` และค่าที่บันทึกจาก `/model` · session ที่ไม่ใส่ `--model` ควรเริ่มด้วย `{{models.sessionDefault}}` (ตั้งใน .claude/settings.local.json ที่ git ไม่เก็บ) · `.claude/settings.json` ถูก track ห้ามมี `env`

## Stack

{{#if stack.summary}}
{{stack.summary}}

{{/if}}
| เรื่อง | ค่า |
|---|---|
| package manager | {{stack.packageManager}}{{#if stack.monorepo}} (monorepo){{/if}} |
| ฐานข้อมูล | {{stack.database}} |
| ภาษาของ UI | {{uiLanguagesText}}{{#if people.i18nRequired}} — ข้อความที่ผู้ใช้เห็นผ่าน i18n ทุกคำ{{/if}} |
| โมเดล | ชุด {{presetName}} · ผู้วางแผน `{{models.planner}}` · ผู้ลงมือ `{{models.builder}}` |

## คำสั่ง (รันที่ราก repo)

```bash
{{#each readyCommands}}
{{.cmd}}
{{/each}}
{{cmd.taskStart}}  # เริ่มการ์ด (บันทึกจุดเริ่มไว้เทียบไฟล์ที่แตะ)
{{cmd.taskVerify}}  # ทางเดียวที่การ์ดเป็น "เสร็จ" · task:verify <M> = ตรวจประตูออก milestone
{{cmd.taskAbandon}}  # เลิกการ์ดที่ยังไม่เสร็จ
{{cmd.taskReview}}  # บันทึกผลเทียบสเปกหนึ่งรอบ: pass หรือ fail พร้อม --kind (fail เปิดการ์ดให้ตรวจใหม่) — รันที่โฟลเดอร์หลักเท่านั้น
{{cmd.taskDiff}}  # เขียน diff สำหรับ reviewer ของการ์ดที่เริ่มแล้ว (เฉพาะไฟล์ที่ task:verify นับ) แล้วพิมพ์ path
{{#if lanesOn}}
{{cmd.taskStartLane}}  # เปิดสายในโฟลเดอร์งานแยก (การ์ดสายโค้ด)
{{cmd.taskMerge}}  # รวมการ์ดสายกลับทีละใบ (exit 3 ปฏิเสธ · 4 ชน · 5 ตรวจรวมล้ม)
{{cmd.taskNext}}  # อ่านอย่างเดียว: ชุดการ์ดที่เริ่มพร้อมกันได้
{{cmd.taskEnv}}  # บรรทัด export (พอร์ต) สำหรับ server ที่เปิดเองในสาย
{{/if}}
{{cmd.taskState}}  # สร้าง STATE.md + .saf/plan.md ใหม่ (--check = ตรวจอย่างเดียว)
{{cmd.taskProbe}}  # พิสูจน์ว่า session ใหม่รู้การ์ดปัจจุบันจาก hook จริง
{{cmd.taskReport}}  # รายงาน milestone จากหลักฐาน
{{cmd.taskCulprit}}  # ประตูออกรัน test ทั้งชุดแล้วล้ม: หาการ์ดที่ทำให้ล้ม (--cmd "<คำสั่ง>" เลือกคำสั่งเอง)
{{cmd.taskFriction}}  # workflow ขวางการทำการ์ด: จดลง docs/plan/friction.md (add · close · ไม่ใส่อาร์กิวเมนต์ = แสดงรายการที่ยังเปิดหรือออกการ์ดแล้ว) — add กับ close รันได้ที่โฟลเดอร์หลักเท่านั้น
{{cmd.docsCheck}}  # ลิงก์ · คำสั่ง · path ในเอกสาร agent · agent · settings
{{cmd.specMatrix}}  # ตารางฉากยอมรับ ↔ test (--check = การ์ดที่เริ่มแล้วต้องมี test)
{{cmd.checkSecrets}}  # ห้ามมีค่าลับในไฟล์ที่ track
{{#if measureOn}}
{{cmd.measure}}  # คำสั่งหนักต่อคิวทีละตัวทั้งเครื่อง (exit 75 = ยังไม่ได้วัด รันใหม่ภายหลัง)
{{/if}}
```

{{#if pendingCommands}}
ยังไม่ได้ตั้ง (เพิ่ม script แล้วรัน setup ใหม่): {{#each pendingCommands}}{{.key}} → {{.cmd}}{{#unless @last}} · {{/unless}}{{/each}}

{{/if}}
{{#if pmNpm}}
npm ส่งอาร์กิวเมนต์หลัง `--`: `npm run task:verify -- T-M1-01`

{{/if}}
## กฎที่ห้ามละเมิด

- **ค่าลับ:** ห้าม commit {{envFilesText}} หรือค่าลับใดๆ · ห้ามพิมพ์ค่าลงจอ/log · ตรวจไฟล์ env ด้วยการนับชื่อ key เท่านั้น
- **git:** commit ในเครื่องทีละ stage ได้ · {{#if pushOwner}}push เมื่อ{{owner}}สั่งเท่านั้น{{else}}push ได้{{#if policies.autoDeployBranches}} ยกเว้น {{policies.autoDeployBranches}} (deploy อัตโนมัติ นับเป็นการ release){{/if}}{{/if}}{{#if policies.noForcePush}} · ห้าม force-push / rewrite history{{/if}}{{#if policies.protectedBranches}} · branch ที่ป้องกัน: {{policies.protectedBranches}}{{/if}}{{#if pushOwner}}{{#if policies.autoDeployBranches}} · push {{policies.autoDeployBranches}} = deploy อัตโนมัติ{{/if}}{{/if}}
- **deploy:** {{#if deployNone}}โปรเจคนี้ไม่ deploy{{else}}{{#if deployOwner}}เมื่อ{{owner}}สั่งเท่านั้น{{else}}ทำได้{{/if}}{{#if policies.deploy.target}} · ปลายทาง: {{policies.deploy.target}}{{/if}}{{#if policies.deploy.exceptions}} · ข้อยกเว้น: {{policies.deploy.exceptions}}{{/if}}{{/if}}
- **การ์ด:** งานทำผ่านการ์ดใน `docs/plan/` · การ์ด "เสร็จ" เมื่อ `{{cmd.taskVerify}}` ผ่านเท่านั้น · ห้ามแก้ `docs/plan/STATE.md` · `.saf/plan.md` · `docs/plan/evidence/` ด้วยมือ
- **หลักฐาน:** "เสร็จ" ต้องมีผลรันจริงแนบ — ห้ามรายงานว่าเสร็จจากการติ๊กช่องหรือคาดเดา
- **ห้ามประมาณเวลาพัฒนา** — ใช้ประตู (gate) แทนวันที่
{{#if policies.forbiddenPaths}}
- **ห้ามแตะ:** {{policies.forbiddenPaths}}
{{/if}}
{{#if policies.ownerOnlyPaths}}
- **ของ{{owner}} (ห้ามแก้ ห้ามย้าย):** {{policies.ownerOnlyPaths}}
{{/if}}
{{#if policies.externalServices}}
- **บริการภายนอกที่แตะได้:** {{policies.externalServices}} — นอกนั้นห้ามแตะ
{{/if}}
{{#if people.i18nRequired}}
- **i18n:** ข้อความที่ผู้ใช้เห็นผ่าน i18n key ทุกคำ ({{uiLanguagesText}})
{{/if}}

## นิยามเสร็จ

- การ์ดผ่าน `{{cmd.taskVerify}}` — หลักฐานอยู่ใน `docs/plan/evidence/`
- ฉากยอมรับที่การ์ดระบุมี test ที่มีรหัสฉากในชื่อ และผ่าน
{{#if projectChecks}}
- ตรวจของโปรเจคผ่านและแนบผลรัน: {{#each projectChecks}}`{{this}}`{{#unless @last}} · {{/unless}}{{/each}}
{{/if}}
- `{{cmd.checkSecrets}}` · `{{cmd.docsCheck}}` ผ่าน
{{#if reviewEvery}}
- `spec-reviewer` เทียบงานกับสเปกแล้ว (ทุกการ์ด){{#if reviewSecurity}} · `security-auditor` ตรวจ milestone ก่อนประตูออก{{/if}}
{{else}}
- `spec-reviewer` เทียบการ์ดขนาด M กับสเปก · การ์ด S ตรวจรวมที่ประตูออก milestone
{{/if}}
- ขนาดการ์ด: S ≤ {{sizeS}} · M ≤ {{sizeM}} บรรทัดโค้ดที่เปลี่ยน (test: S ≤ {{testS}} · M ≤ {{testM}}) — ใหญ่กว่านี้ designer แตกการ์ด

## โครง repo

```
docs/        INDEX · DECISIONS · plan/ (milestone · การ์ด · หลักฐาน · STATE) · specs/ · archive/ (ประวัติ)
.claude/     agents/ · commands/ (/saf · /saf-plan) · rules/ · skills/ · settings.json (hook ไม่มี env)
.saf/        plan.md (กระจกแผน สร้างอัตโนมัติ) · manifest.json
tools/saf/   เครื่องมือรอบการ์ด (vendored ไม่มี dependency) · saf.config.json = ค่าตั้งของมัน
```

## ทำงานกับ{{owner}}

- ตอบเป็น{{chatLanguageName}}แบบคนทั่วไป ผลลัพธ์ก่อนรายละเอียด · ไม่ dump stack trace · ศัพท์เทคนิคแปลเป็นภาษาคน · เรียกผู้ใช้ว่า "คุณ" แทนตัวเองว่า "ผม"
- ทำตามแผน milestone — ไม่สร้างรายการงานเอง · {{owner}}กด Go ต่อ milestone · ระหว่าง milestone ไม่หยุดถามเรื่องที่มีค่าแนะนำแล้ว
- การตัดสินใหม่ของ{{owner}} → เพิ่มแถวใน `docs/DECISIONS.md` (AI ห้ามเปลี่ยนสถานะเป็น "ตัดสินแล้ว" เอง)
- คำถามที่ต้องให้{{owner}}ตัดสินจริงๆ ถามครั้งเดียวพร้อมตัวเลือกและคำแนะนำ แล้วทำส่วนที่ไม่ต้องรอคำตอบต่อ
{{#if tokenSaving.enabled}}
- ประหยัด token: {{#if tokenSaving.silentInterim}}เงียบตอนแจ้งเตือนระหว่างทางของ agent · {{/if}}{{#if tokenSaving.batchReviewerNotes}}ข้อสังเกตที่ไม่บล็อกของผู้ตรวจ เก็บรวมส่ง designer ท้าย milestone · {{/if}}{{#if tokenSaving.reviewerDiff}}ให้ผู้ตรวจอ่านไฟล์ diff · {{/if}}{{#if tokenSaving.fixFlakyFirst}}แก้ test ที่ผลไม่นิ่งก่อนงานใหม่ · {{/if}}agent รายงานเป็น{{reportLanguageName}}
{{/if}}
