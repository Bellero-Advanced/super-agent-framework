# สารบัญ — หนึ่งเรื่องมีบ้านเดียว

แต่ละเรื่องมีบ้านเดียว ไฟล์อื่นลิงก์มาแทนการคัดลอก · ข้อมูลขัดกันให้ทำตาม [DECISIONS.md](DECISIONS.md) §0 ·
เรื่องใหม่ได้บ้านเมื่อไรให้เพิ่มแถวที่นี่

## 1. เริ่มที่นี่

| เรื่อง | บ้าน |
|---|---|
| กฎที่ห้ามละเมิด · คำสั่ง | [CLAUDE.md](../CLAUDE.md) |
| งานปัจจุบันและสถานะ (สร้างอัตโนมัติ) | [plan/STATE.md](plan/STATE.md) |
| การ์ด · milestone · สาย · หลักฐาน ทำงานอย่างไร | [plan/README.md](plan/README.md) |
| การตัดสินใจและลำดับความสำคัญ | [DECISIONS.md](DECISIONS.md) |

## 2. ตัวผลิตภัณฑ์

| เรื่อง | บ้าน |
|---|---|
| สร้างอะไร ให้ใคร | [CLAUDE.md](../CLAUDE.md) (ย่อหน้าแรก) — ยาวขึ้นเมื่อไรแยกเป็นเอกสารของตัวเอง |
| สเปกของระบบพร้อมฉากยอมรับ | `docs/specs/` (แม่แบบ [specs/_template.md](specs/_template.md)) |

## 3. ทีม AI ทำงานอย่างไร

| เรื่อง | บ้าน |
|---|---|
| บทบาท · โมเดล · effort | `.claude/agents/` |
| คำสั่ง: `/saf` (ทางเข้าเดียว — ตอบ "help" ด้วย) · `/saf-plan` · `/saf-setup` | `.claude/commands/` |
| กฎตาม path | `.claude/rules/` |
| skill — โหลดเองเมื่องานตรง: {{skillNamesText}} | `.claude/skills/` |
| ค่าตั้ง SAF (ตรวจด้วย schema) | [saf.config.json](../saf.config.json) · schema `tools/saf/schema/saf.config.schema.json` |
| แม่แบบการ์ด | [plan/tasks/_template.md](plan/tasks/_template.md) |

## 4. โค้ดคือความจริง

ตัวเลข ตารางข้อมูล และพฤติกรรมอยู่ในโค้ด · เอกสารชี้ไปที่โค้ด ไม่เก็บสำเนาที่สอง

## 5. ประวัติ

`docs/archive/` เป็นประวัติเท่านั้น ไม่ใช่ที่ตัดสิน · ไฟล์ที่ SAF แทนที่ตอนตั้งค่าเก็บไว้ที่นั่น
