---
name: i18n
description: Any user-facing text — every string through i18n keys in every UI language, no concatenation, plurals and formats by locale, checked for overflow. Use when adding or changing text, labels, messages or emails.
---

# Internationalisation

UI languages: {{uiLanguagesText}}.

## Rules

- **Keys, not strings** — every user-facing string (labels, buttons, errors, emails, notifications, alt text) is a key with a
  value in every UI language. No literal text in components or server responses shown to users
- **Whole sentences** — never build a sentence by concatenating pieces; use one key with named placeholders (`{name}`)
- **Plurals and gender** through the i18n library's plural rules, not `if (n === 1)`
- **Formats by locale** — numbers, currency, dates, times and time zones through `Intl` (or the library), never hand-formatted
- **Keys describe meaning** (`checkout.pay_button`), not position (`button3`) · no unused keys · no missing keys
- **Errors** shown to users map from a stable error code to a key — never show raw codes or server messages
- **Names of things** (places, products, categories) have a value in every UI language

## Check

- the longest language at the smallest supported width: nothing overflows or truncates meaning
- run the project's i18n lint or missing-key check when it has one; otherwise grep the changed files for literal user-facing text
- screenshots in each UI language for changed screens

## Adding a language

Add every key, then check overflow everywhere — a partial language is a bug, not a feature flag.
