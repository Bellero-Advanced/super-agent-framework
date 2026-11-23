# SAF — Super Agent Framework

ระบบทำงานแบบการ์ดและ milestone สำหรับ [Claude Code](https://claude.com/claude-code) ติดตั้งได้ทั้งโปรเจคใหม่และโปรเจคที่มีอยู่แล้ว
SAF ให้ทีม AI ของคุณมีบทบาทพร้อมโมเดลตายตัว แผนงานเป็นการ์ดเล็กๆ ที่ตรวจได้ ประตูออกของแต่ละ milestone และหลักฐานของทุกงานที่ "เสร็จ"
ตั้งค่าด้วยการสัมภาษณ์สั้นๆ

[English](README.md)

## ได้อะไร

- **การ์ดและ milestone** ใน `docs/plan/` — การ์ดแต่ละใบระบุไฟล์ที่แตะได้ และคำสั่งที่พิสูจน์ว่างานใช้ได้
- **`task:verify`** — ทางเดียวที่การ์ดจะ "เสร็จ": รันคำสั่งของการ์ด ตรวจว่าไฟล์ที่เปลี่ยนอยู่ใน `touch` และฉากยอมรับมี test แล้วเขียนหลักฐาน
- **สถานะที่สร้างอัตโนมัติ** — `STATE.md` และ hook SessionStart ที่บอก session ใหม่ทุกครั้งว่า milestone ไหน การ์ดไหนกำลังทำ เกณฑ์ผ่านคืออะไร
- **บทบาท agent** พร้อมรหัสโมเดลเต็มและ effort: designer · spec-reviewer (อ่านอย่างเดียว) · implementer · qa-runner
  และบทบาทเสริม (art-producer · db-guardian · release-operator · security-auditor · data-engineer · content-writer) หรือบทบาทของคุณเอง
- **สายขนาน** — การ์ดที่ไม่ทับกันทำพร้อมกันใน git worktree ของตัวเอง · `task:merge` รวมทีละใบ ตรวจ และย้อนเองเมื่อพัง
- **ตัวกัน** — `docs:check` ให้เอกสาร agent ตรงความจริง · `check-secrets` กันค่าลับ · `spec:matrix` จับคู่ฉากกับ test · กุญแจวัดผลต่อคิวคำสั่งหนัก
- **คำสั่ง `/saf`** — `/saf` · `/saf-plan` · `/saf-fix` · `/saf-test` · `/saf-protect` · `/saf-help` (+ ตัวย่อ)

ตัวเครื่องมือเป็น Node ล้วน (≥ 20) **ไม่มี dependency** คัดลอกไว้ใน repo ของคุณที่ `tools/saf/` ใช้ได้กับ pnpm · npm · yarn · bun หรือไม่มี package manager เลย

## ติดตั้ง

```bash
cd your-project
npx github:Bellero-Advanced/super-agent-framework init
claude
/saf-setup
```

`init` คัดลอกเครื่องมือและ skill ตั้งค่า · `/saf-setup` ถามคุณเป็นกลุ่ม (ทุกข้อมีค่าแนะนำ) สร้างทุกอย่าง รันการตรวจตัวเองและการ์ดแรก
แล้วให้ designer ร่าง milestone แรก และหยุดรอคุณกด Go

ไม่ต้องสัมภาษณ์: `npx github:Bellero-Advanced/super-agent-framework init --answers answers.json` — ดู [docs/install.md](docs/install.md)

## รอบการ์ด

```
คุณกด Go → designer เขียนการ์ด → task:start → implementer → task:verify → spec-reviewer → qa-runner → commit / task:merge
        → task:verify M<n> (ประตูออก) → รายงาน → คุณปิด milestone
```

รายละเอียด: [docs/card-lifecycle.md](docs/card-lifecycle.md) (ภาษาอังกฤษ) · เอกสารที่สร้างในโปรเจคของคุณเป็นภาษาไทยได้ทั้งหมด

## เอกสาร

ดูตารางใน [README.md](README.md#documentation) — เอกสารของตัว framework เป็นภาษาอังกฤษ ส่วนเอกสารที่ SAF สร้างในโปรเจคเป็นภาษาที่คุณเลือก

## สัญญาอนุญาต

ยังไม่กำหนด — จะตัดสินก่อนเปิดเป็น open source · ระหว่างนี้สงวนสิทธิ์ทั้งหมด
