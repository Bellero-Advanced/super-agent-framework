---
description: บอกสิ่งที่ต้องการเป็นภาษาคน — SAF ส่งงานให้ถูกทาง (สร้างผ่านรอบการ์ด · วางแผน · บั๊ก · ทดสอบ · ความปลอดภัย · คำถาม · วิธีใช้ SAF) พิสูจน์ด้วยผลรันจริง แล้วรายงานสั้นๆ
argument-hint: <สิ่งที่คุณต้องการ เป็นภาษาคน — หรือ "help">
---

# /saf — ทางเข้าเดียว

คำขอ: $ARGUMENTS

## 1. เลือกทาง

อ่านสรุปที่ hook ฉีดมา (หรือ `docs/plan/STATE.md`) ก่อน แล้วเลือกทาง **เดียว**:

| คำขอเป็น… | ทาง |
|---|---|
| ว่าง · "help" · "ใช้ยังไง" · "ทำอะไรได้บ้าง" | **วิธีใช้** (ข้อ 4) — ตอบเอง ไม่แก้อะไร |
| คำถามเรื่องโปรเจกต์ ("อยู่ตรงไหน" · "ทำไม…" · "สถานะเป็นยังไง") | ตอบจาก `docs/INDEX.md` → บ้านของเรื่อง และโค้ด · ไม่แก้อะไร |
| วางแผน milestone หรืองานใหม่ที่ยังไม่อยู่ใน milestone ไหน | `/saf-plan` — ห้ามสร้างงานเอง: ถาม{{owner}}ครั้งเดียวว่าจะเพิ่มไหม |
| บั๊ก · error · ล่ม · test ไม่นิ่ง | skill `debug-protocol` — หาต้นเหตุพร้อมหลักฐานก่อนแก้ |
| "รัน test" · "ใช้ได้ไหม" · ขอตัวเลข | skill `test-runner` (ส่งให้ `qa-runner`) |
| ความปลอดภัย · ค่าลับ · "ปลอดภัยไหม" | skill `security-review`{{#if hasRole.security_auditor}} (ส่งให้ `security-auditor`){{/if}} |
| สร้างหรือแก้อะไรสักอย่าง | รอบการ์ด (ข้อ 2) |

ไม่แน่ใจระหว่างสองทาง → ถามสั้นๆ หนึ่งคำถามพร้อมคำแนะนำ

## 2. รอบการ์ด (สร้างหรือแก้)

1. จับคู่คำขอกับการ์ดใน `docs/plan/tasks/` ของ milestone ที่ active · ยังไม่มีการ์ดแต่อยู่ใน milestone ที่ active →
   ให้ `designer` เขียนการ์ดก่อนแล้วทำต่อ · `depends` ที่ยังไม่ผ่านต้องทำก่อน
2. ทำการ์ด:

| ขั้น | ใคร | คำสั่ง |
|---|---|---|
| เริ่ม | session หลัก | `{{cmd.taskStart}}`{{#if lanesOn}} (บทบาทสายโค้ด → `{{cmd.taskStartLane}}`){{/if}} |
| ลงมือ | agent ที่ `{{cmd.taskStart}}` ระบุ | แตะเฉพาะไฟล์ใน `touch` |
| ตรวจ | agent เดิม | `{{cmd.taskVerify}}` จนผ่าน |
| เทียบสเปก | `spec-reviewer` (อ่านอย่างเดียว){{#unless reviewEvery}} — การ์ดขนาด M · การ์ด S ตรวจรวมที่ประตูออก{{/unless}} | {{#if tokenSaving.reviewerDiff}}`{{cmd.taskDiff}}` แล้วให้ {{/if}}รหัสการ์ด · ประเภทการรีวิว{{#if tokenSaving.reviewerDiff}} · path ของไฟล์ diff{{/if}} |
| ทดสอบจริง | `qa-runner` | เมื่อการ์ดแตะ UI · multiplayer · ประสิทธิภาพ |
| ลงงาน | session หลัก | commit{{#if lanesOn}} · การ์ดสาย → `{{cmd.taskMerge}}`{{/if}} |

ส่งให้ `spec-reviewer` รหัสการ์ด · ประเภทการรีวิวที่การ์ดต้องใช้ (รายการคั่นจุลภาคจาก `text` · `data` · `security` · `refactor` ตามที่ไฟล์ agent ของมันนิยาม · ไม่มีข้อไหนตรง → ไม่ระบุ){{#if tokenSaving.reviewerDiff}} และ path ที่ `{{cmd.taskDiff}}` พิมพ์ออกมา: ไฟล์นั้นมีเฉพาะไฟล์ที่ `{{cmd.taskVerify}}` นับเป็นของการ์ด — ห้ามทำ diff เอง{{/if}}

หลังเทียบสเปกทุกครั้ง session หลักบันทึกผลด้วย `{{cmd.taskReview}}` (`pass` หรือ `fail` พร้อม kind ที่ตรง) ถ้า `fail` การ์ดจะเปิดอีกครั้ง:
ผู้ลงมือแก้แล้วรัน `{{cmd.taskVerify}}` ใหม่ ไม่ต้อง restart · คำสั่งนี้ไม่ commit ให้
commit ไฟล์รอบรีวิว `docs/plan/evidence/reviews/<id>.json` ลำพัง{{#if lanesOn}} (ก่อน `{{cmd.taskMerge}}`){{/if}} ด้วย `git commit -m "chore(plan): review <id> round <n>" -- docs/plan/evidence/reviews/<id>.json`

การ์ดที่ไม่ขึ้นต่อกันทำขนานได้{{#if lanesOn}} — `{{cmd.taskNext}}` บอกชุดที่ปลอดภัย{{/if}}

## 3. รายงาน

ตอบเป็น{{chatLanguageName}} เรียกผู้ใช้ว่า "คุณ" แทนตัวเองว่า "ผม" · ผลลัพธ์ก่อน: อะไรเปลี่ยนสำหรับผู้ใช้ · การ์ดไหน ·
ผล verify พร้อมตัวเลขจริง · เรื่องที่{{owner}}ต้องตัดสิน (ถามครั้งเดียว พร้อมตัวเลือกและคำแนะนำ) · ไม่ dump stack trace
ห้ามบอกว่า "เสร็จ" ถ้าไม่มีผลรันจริง (skill `evidence-before-done`)

## 4. วิธีใช้ (ตอบเอง)

แสดงให้{{owner}}เป็น{{chatLanguageName}}:

- **คำสั่ง:** `/saf <อะไรก็ได้>` (คำสั่งนี้) · `/saf-plan <M หรือเป้าหมาย>` (designer เขียนการ์ดและสเปก แล้วรอ Go) ·
  `/saf-setup` (เปลี่ยนการตั้งค่า — สัมภาษณ์ใหม่)
- **skill โหลดเองเมื่องานตรง:** {{skillNamesText}}
- **บทบาท:**

| บทบาท | โมเดล | effort | ทำอะไร |
|---|---|---|---|
{{#each roles}}
| `{{.name}}` | `{{.model}}` | {{.effort}} | {{.summary}} |
{{/each}}

- **เปิด session ตามบทบาท:**
{{#each sessionRows}}
  - {{.work}} ({{.roles}}): `claude --model {{.model}}`
{{/each}}
- **คำสั่งการ์ด:** `{{cmd.taskStart}}` → ทำงาน → `{{cmd.taskVerify}}` → ตรวจ → commit · สถานะ `docs/plan/STATE.md` ·
  วิธีทำงาน `docs/plan/README.md`
- **ลองพิมพ์:** `/saf การ์ดถัดไปคืออะไร` · `/saf หน้า login ล่มตอนกดส่ง` · `/saf รัน test ให้หน่อย`
{{#if selfFixOn}}

## 5. แก้ตัวเอง (SAF แก้บั๊กของตัวเองที่พิสูจน์แล้ว)

`workflow.selfFix` เป็น `on`: รายการ friction ชนิด {{selfFixKinds}} ที่การ์ดขนาด S ใบเดียวพร้อม test แก้ได้ กลายเป็นการ์ด
ใน milestone ที่ **active** ได้โดยไม่ต้องรอ Go ของ{{owner}} — ไม่เกิน {{selfFixCap}} ใบต่อ milestone
(`SELF_FIX_LIMITS.perMilestone` ใน `tools/saf/lib/friction.mjs`) engine ตรวจทุกเงื่อนไข (`{{cmd.taskStateCheck}}`)

1. `{{cmd.taskFrictionDraft}}` พิมพ์ร่างที่มี `self_fix: <F-id>` แทน `T-M<n>-??` ด้วยรหัสการ์ดถัดไปที่ว่าง เติม `touch`
   (มีไฟล์ test) และ "Done when" (คำสั่งที่รันไฟล์ test นั้น) แล้วบันทึกเป็นไฟล์การ์ด
2. เพิ่มรหัสการ์ดต่อท้าย `cards:` ของ milestone ที่ active — แก้แค่บรรทัดเดียวนั้นในไฟล์ milestone
3. รัน `{{cmd.taskFrictionCarded}}`
4. ทำตาม card loop ปกติ โดยเขียน test ก่อนและต้องล้มก่อนแก้ (skill `tdd`) `spec-reviewer` ตรวจว่า test ครอบหลักฐานของ friction
   เมื่อการ์ดผ่าน `{{cmd.taskVerify}}`{{#if lanesOn}} (การ์ด lane: `{{cmd.taskMerge}}`){{/if}} engine ปิดรายการเป็น fixed ให้ใน
   `docs/plan/friction.md` ให้ commit ไฟล์นั้นลำพังทันที (โฟลเดอร์หลักที่ยังไม่ commit จะทำให้ merge ครั้งถัดไปถูกปฏิเสธ)

อย่างอื่น — ชนิดอื่น ขนาด M ไม่มี test เกินเพดาน — รอ `designer` และ Go ของ{{owner}} (`/saf-plan`)
{{/if}}
