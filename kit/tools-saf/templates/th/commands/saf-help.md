---
description: คำสั่ง /saf ทั้งหมด · บทบาท agent · วิธีเปิด session ตามบทบาท
---

# /saf-help

แสดงสิ่งนี้ให้{{owner}}เป็น{{chatLanguageName}}:

## คำสั่ง

| คำสั่ง | ย่อ | ทำอะไร |
|---|---|---|
| `/saf <คำขอ>` | — | คำขอภาษาคน → การ์ด → บทบาท → ตรวจ → รายงานสั้น |
| `/saf-plan <M หรือเป้าหมาย>` | `/saf-p` | designer เขียน milestone การ์ด สเปก แล้วรอ Go |
| `/saf-fix <ปัญหา>` | `/saf-f` | หาต้นเหตุพร้อมหลักฐาน แล้วแก้พร้อม test ที่พิสูจน์ |
| `/saf-test [ขอบเขต]` | `/saf-t` | รัน test จริง ตัวเลขจริง |
| `/saf-protect [ขอบเขต]` | `/saf-pt` · `/saf-audit` | ตรวจความปลอดภัยตามความรุนแรง |
| `/saf-help` | `/saf-h` | หน้านี้ |

## บทบาท

| บทบาท | โมเดล | effort | ทำอะไร |
|---|---|---|---|
{{#each roles}}
| `{{.name}}` | `{{.model}}` | {{.effort}} | {{.summary}} |
{{/each}}

## เปิด session ตามบทบาท

{{#each sessionRows}}
- {{.work}} ({{.roles}}): `claude --model {{.model}}`
{{/each}}

## คำสั่งการ์ด

`{{cmd.taskStart}}` → ทำงาน → `{{cmd.taskVerify}}` → ตรวจ → commit · สถานะ: `docs/plan/STATE.md` · วิธีทำงาน: `docs/plan/README.md`
