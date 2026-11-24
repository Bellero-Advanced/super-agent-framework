---
description: วางแผน milestone — designer แตกเป็นการ์ดงานและสเปก ให้{{owner}}เห็นก่อน แล้วหยุดรอ Go
argument-hint: <รหัส milestone หรือเป้าหมาย>
---

# /saf-plan — วางแผน milestone

เป้า: $ARGUMENTS

1. ส่งงานให้{{#if designerVariant}} agent designer: `designer` สำหรับงานออกแบบใหญ่ (แผนที่เพิ่มไฟล์สเปกใหม่ หรือแถวการตัดสินใจที่กระทบการ์ดมากกว่าหนึ่งใบ) · `{{designerVariant}}` สำหรับงานวางแผนอย่างอื่น{{else}} agent `designer`{{/if}} พร้อม: รหัส milestone (หรือเป้าหมาย) · `docs/plan/README.md` · ไฟล์ milestone เดิมถ้ามี ·
   สเปกใน `docs/specs/` ที่เกี่ยวข้อง
2. designer เขียนหรือแก้:
   - `docs/plan/milestones/M<n>.md` — เป้าหมาย · ขอบเขต · ความเสี่ยง · ประตูออก · ลำดับ `cards:` · `status: planned`
   - การ์ดทีละขั้นใน `docs/plan/tasks/M<n>/` (คัดลอก `docs/plan/tasks/_template.md`) — ขนาด M ≤ {{sizeM}} / L ≤ {{sizeL}}
     บรรทัดโค้ด (`task:verify` ล้มเมื่อเกิน {{hardStop}} เท่าของเพดาน — แตกการ์ด) · `touch` ชัด · "เกณฑ์ผ่าน" เป็นคำสั่ง · `scenarios` จากสเปก
   - สเปกพร้อมฉากยอมรับใน `docs/specs/` เมื่อเป็นระบบใหม่
3. รัน `{{cmd.taskStateCheck}}` และ `{{cmd.docsCheck}}` แก้ทุกข้อที่รายงาน แล้วรัน `{{cmd.taskPrerun}}` กับทุกการ์ดใหม่:
   คำสั่ง "เกณฑ์ผ่าน" ที่พิสูจน์การ์ดต้องล้มตอนนี้ หรือมี `— passes by design: <reason>`
4. สรุปสั้นให้{{owner}}: เป้าหมาย · รายการการ์ด (รหัส · ชื่อ · ขนาด · บทบาท) · คำถามที่ค้างพร้อมคำแนะนำ
5. **หยุด** ห้ามเริ่มการ์ดจนกว่า{{owner}}กด Go · มีแต่{{owner}}ที่ตั้ง `status: active`
