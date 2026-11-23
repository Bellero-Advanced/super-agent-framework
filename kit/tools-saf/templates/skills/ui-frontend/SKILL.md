---
name: ui-frontend
description: Building or changing a screen or component — states, keyboard and focus, design tokens, text overflow, responsive sizes and screenshot evidence. Use for any UI work.
---

# UI / frontend

## Every screen has all its states

| State | Must show |
|---|---|
| loading | a skeleton or spinner within 100 ms; layout does not jump when data arrives |
| empty | what this is, and the one action that fills it |
| error | what went wrong in plain words, and a retry or a way out — never a raw code or stack |
| success / partial | the data; long lists paginate or virtualise |
| disabled / pending | why it is disabled; double submit is impossible |

## Rules

- **Tokens, not values** — colours, spacing, radius, shadows and font sizes come from the design tokens or theme; no hex or px literals in components
- **Keyboard first** — every action reachable by Tab, visible focus ring, Enter/Space activate, Esc closes dialogs, focus returns where it came from
- **Accessible names** — buttons and inputs have labels; images have `alt`; contrast ≥ 4.5:1 for body text
- **Text** — user-facing strings go through i18n when the project has it; check the longest language at the smallest supported width; no truncation of meaning
- **Responsive** — check the smallest and largest supported widths; nothing overflows horizontally
- **Server decides** — the UI shows server results; it never computes prices, permissions or outcomes on its own
- **Components** — reuse the existing component before writing a new one; one component, one job

## Evidence

- screenshots of every state at the target sizes, saved under the card's evidence folder (paths in the report)
- the component or e2e test that covers the states (scenario ids in test names)
- keyboard path walked once by hand or by an e2e test: Tab order, Enter, Esc
