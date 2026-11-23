---
description: ตรวจความปลอดภัย — ค่าลับ · สิทธิ์ · input ที่เชื่อไม่ได้ · การเปลี่ยนเงินและข้อมูล · การตั้งค่า
argument-hint: <ไม่บังคับ — ส่วนของระบบ รหัสการ์ด หรือ "all">
---

# /saf-protect — ตรวจความปลอดภัย

ขอบเขต: $ARGUMENTS

{{#if hasRole.security_auditor}}
ส่งงานให้ agent `security-auditor` พร้อม skill `security-review`
{{else}}
ใช้ skill `security-review` (อ่านอย่างเดียว · เปิดบทบาท `security-auditor` ใน `saf.config.json` ถ้าต้องการ agent เฉพาะ)
{{/if}}

1. `{{cmd.checkSecrets}}` — ไม่มีค่าลับในไฟล์ที่ track ({{envFilesText}} ต้องไม่ถูก track) · ห้ามพิมพ์ค่า นับชื่อ key เท่านั้น
2. เส้นแบ่งความเชื่อถือ — server ตัดสิน · input จาก client เป็นแค่เจตนา · ตรวจทุก input · ตรวจสิทธิ์ทุก action
3. injection — SQL · shell · HTML · path traversal · deserialization
4. ข้อมูลและเงิน — การเปลี่ยนค่าทุกครั้งผ่าน transaction มีบันทึกตรวจสอบ และ key กันทำซ้ำ
5. การตั้งค่า — header · CORS · cookie · rate limit · ความเสี่ยงของ dependency · settings ที่ track ไม่มี `env`
{{#if policies.externalServices}}
6. บริการภายนอก — แตะได้เฉพาะ {{policies.externalServices}}
{{/if}}

รายงานตามความรุนแรง (วิกฤต · สูง · กลาง · ต่ำ): ที่ไหน · ทำไมสำคัญ · วิธีแก้ที่เล็กที่สุด · การ์ดไหนควรทำ
การแก้ทำผ่านการ์ด — การตรวจไม่เปลี่ยนอะไรเอง
