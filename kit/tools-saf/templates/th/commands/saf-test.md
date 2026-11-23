---
description: ทดสอบของจริง แล้วรายงานตัวเลขจริง
argument-hint: <ไม่บังคับ — รหัสการ์ด ส่วนของระบบ หรือ "all">
---

# /saf-test — รันจริง ตัวเลขจริง

ขอบเขต: $ARGUMENTS

ส่งงานให้ agent `qa-runner` รันตามลำดับเท่าที่ใช้ได้:

{{#each readyCommands}}
- `{{.cmd}}` ({{.key}})
{{/each}}
- `{{cmd.specMatrixCheck}}` — ฉากของการ์ดที่เริ่มแล้วมี test ครบ
- `{{cmd.checkSecrets}}` · `{{cmd.docsCheck}}`
{{#if measureOn}}

คำสั่งหนัก (test ทั้งชุด · e2e · ประสิทธิภาพ) ผ่านกุญแจวัดผล: `{{cmd.measure}}` · exit 75 = ยังไม่ได้วัด
รันใหม่ภายหลัง — ห้ามรายงานว่าผ่าน
{{/if}}
{{#if pendingCommands}}

ยังไม่ได้ตั้ง (รายงานว่าขาด ห้ามสร้างเอง): {{#each pendingCommands}}{{.key}}{{#unless @last}} · {{/unless}}{{/each}}
{{/if}}

รายงาน: ทุกคำสั่ง · exit code · จำนวนผ่าน/ล้ม · เวลา · ข้อที่ล้มข้อแรกพร้อมข้อความจริง
ล้มก็รายงานตามจริง — qa-runner ไม่แก้โค้ดให้ test ผ่าน
