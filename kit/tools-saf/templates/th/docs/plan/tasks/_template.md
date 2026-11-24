---
id: T-M1-01
milestone: M1
title: หนึ่งบรรทัด — อะไรเปลี่ยนสำหรับผู้ใช้
spec:
  - docs/specs/example.md
depends: []
size: S
role: implementer
touch:
  - src/feature/**
  - test/feature/**
dont_touch: {{dontTouchYaml}}
scenarios:
  - FEAT-AC-01
---

# T-M1-01 — หนึ่งบรรทัด — อะไรเปลี่ยนสำหรับผู้ใช้

คัดลอกไฟล์นี้ไปที่ `docs/plan/tasks/M<n>/T-M<n>-<nn>.md` (ไฟล์ที่ขึ้นต้นด้วย `_` เครื่องมือข้าม)
ขนาด S ≤ {{sizeS}} บรรทัดโค้ดที่เปลี่ยน (test ≤ {{testS}}) · M ≤ {{sizeM}} (test ≤ {{testM}}) — ใหญ่กว่านี้แตก

## ทำไม

เหตุผลที่ผู้ใช้เห็นได้ หนึ่งถึงสองประโยค · ลิงก์หัวข้อในสเปก

## ทำอะไร

- ขั้นตอนที่จับต้องได้ ระบุไฟล์และฟังก์ชัน · ห้ามประมาณเวลา

## นอกขอบเขต

- สิ่งที่การ์ดนี้ห้ามทำ (การ์ดอื่นทำ)

## เกณฑ์ผ่าน

แต่ละคำสั่งต้องล้มก่อนทำการ์ด (ตรวจด้วย `{{cmd.taskPrerun}}`) หรือมี `— passes by design: <reason>` ต่อท้าย · คำสั่งยามเฝ้า (ชุดทดสอบเต็ม · ตัวตรวจของเครื่องมือ) ไม่ต้องมีเครื่องหมาย

- `{{cmd.specMatrixCheck}}`
{{#each projectChecks}}
- `{{this}}`
{{/each}}
