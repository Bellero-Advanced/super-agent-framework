# การตัดสินใจ

## 0. ลำดับความสำคัญ (กฎลำดับเดียวของ repo นี้)

แหล่งข้อมูลขัดกัน แหล่งที่อยู่สูงกว่าชนะ:

1. คำสั่งล่าสุดที่ชัดเจนของ{{owner}}ในบทสนทนา
2. ไฟล์นี้ — แถวที่สถานะ **ตัดสินแล้ว**
3. บ้านของเรื่องนั้น (ดู [INDEX.md](INDEX.md))

`docs/archive/` เป็นประวัติ ไม่ชนะอะไร · AI เพิ่มแถวใหม่เป็น **เสนอ** หรือ **รอ{{owner}}** — มีแต่{{owner}}ที่เปลี่ยนเป็น
**ตัดสินแล้ว** · รหัส `D-001`, `D-002`, … ไม่ใช้ซ้ำ

## 1. รายการ

| รหัส | วันที่ | การตัดสินใจ | สถานะ |
|---|---|---|---|
| D-001 | {{today}} | งานเดินผ่านระบบการ์ดของ SAF: milestone → การ์ด → หลักฐาน `task:verify` → ตรวจ → commit/รวม · {{owner}}กด Go ต่อ milestone | ตัดสินแล้ว (ตั้งค่า) |
| D-002 | {{today}} | ชุดโมเดล {{presetName}}: บทบาทวางแผน/ตรวจ `{{models.planner}}` · บทบาทลงมือ `{{models.builder}}` · effort ตายตัวต่อบทบาท | ตัดสินแล้ว (ตั้งค่า) |
| D-003 | {{today}} | ระดับความเข้ม **{{project.rigor}}**: การ์ด M ≤ {{sizeM}} / L ≤ {{sizeL}} บรรทัดโค้ด · ตรวจตอนรวม {{mergeChecksText}} | ตัดสินแล้ว (ตั้งค่า) |
| D-004 | {{today}} | git: {{#if pushOwner}}push เมื่อ{{owner}}สั่งเท่านั้น{{else}}push ได้{{/if}}{{#if policies.noForcePush}} · ห้าม force-push / rewrite history{{/if}} · deploy: {{#if deployNone}}ไม่มี{{else}}{{#if deployOwner}}เมื่อ{{owner}}สั่งเท่านั้น{{else}}ทำได้{{/if}}{{#if policies.deploy.target}} ({{policies.deploy.target}}){{/if}}{{/if}} | ตัดสินแล้ว (ตั้งค่า) |
| D-005 | {{today}} | เอกสารเป็น{{docLanguageName}} · คุยเป็น{{chatLanguageName}} · agent รายงานเป็น{{reportLanguageName}} · ภาษา UI {{uiLanguagesText}} | ตัดสินแล้ว (ตั้งค่า) |
| D-006 | {{today}} | ห้ามประมาณเวลาพัฒนา — วัดความคืบหน้าด้วยประตู ไม่ใช่วันที่ · "เสร็จ" ต้องมีผลรันจริง | ตัดสินแล้ว (ตั้งค่า) |
