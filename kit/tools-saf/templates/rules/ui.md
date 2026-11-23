---
paths:
{{rulePathsYaml}}
---

# Rules for UI files

- Every screen has empty, loading and error states
{{#if people.i18nRequired}}
- Every user-facing string goes through i18n keys ({{uiLanguagesText}}) — no hard-coded text, no raw ids on screen
{{else}}
- No raw ids, keys or stack traces on screen; user-facing text stays in one place so it can be translated later
{{/if}}
- Colors, sizes, spacing and shadows come from design tokens, not literals
- Keyboard and pointer both work; focus is visible
- Check the longest language does not overflow at the smallest supported size; attach a screenshot to the card
- The UI never decides values the server owns (prices, results, permissions) — it shows what the server returned
