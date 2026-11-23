---
name: security-review
description: Security review — secrets, authorization, injection, money/data integrity, configuration, dependencies. Quick pass for cards that touch input, auth, money or config; full audit before a gate or release. Changes nothing.
---

# Security review

Never print a secret value — name the file and the key only.

## Level 1 — quick (a card that touches input, auth, money or config)

- `npm run check-secrets` passes · `.env` · `.env.local` · `.env.*.local` stay untracked
- no shell execution with interpolated input · no `eval` / dynamic code · no unsafe deserialization
- no string-built SQL · no unescaped HTML output · no file paths from user input
- every new action checks authorization

## Level 2 — full audit (milestone gate or before release)

1. **Secrets** — tracked files, CI config, logs, error messages, client bundles
2. **Trust boundary** — the server decides values, ownership and permissions; client input is intent; every input validated
3. **AuthN / AuthZ** — sessions, cookies (HttpOnly · Secure · SameSite), password hashing (scrypt/argon2/bcrypt), per-action checks, IDOR
4. **Injection** — SQL · NoSQL · shell · HTML/XSS · path traversal · SSRF · template injection
5. **Integrity** — money and ownership changes go through a transaction with an audit record and an idempotency key; double-submit races
6. **Abuse** — rate limits, size limits, pagination caps
7. **Configuration** — CORS, security headers, debug flags, tracked agent settings without `env`
8. **Dependencies** — known advisories, unused packages, install scripts

## Report

By severity — critical · high · medium · low. Each: file:line · the risk in one sentence · the smallest fix · which card
should do it. Fixes go through cards.
