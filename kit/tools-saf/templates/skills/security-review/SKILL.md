---
name: security-review
description: Security review of code and configuration — quick checks while building a card (hardcoded secrets, dangerous execution, obvious injection) and a full audit before release (injection, authorization, data and money integrity, configuration, dependencies) with severity-ranked, actionable findings. Use for any security review.
---

# Security review

Never print a secret value. Name the file and the key only.

## Level 1 — quick (every card that touches input, auth, money or config)

- hard-coded secrets, tokens, connection strings · env files tracked by git
- shell execution with interpolated input · `eval` / dynamic code · unsafe deserialization
- string-built SQL · unescaped HTML output · file paths from user input
- missing authorization check on a new action

## Level 2 — full audit (milestone gate or before release)

1. **Secrets** — tracked files, CI config, logs, error messages, client bundles
2. **Trust boundary** — the server decides values, ownership and permissions; client input is intent; every input validated
3. **AuthN / AuthZ** — sessions, cookies (HttpOnly, Secure, SameSite), password hashing (scrypt/argon2/bcrypt), per-action checks, IDOR
4. **Injection** — SQL · NoSQL · shell · HTML/XSS · path traversal · SSRF · template injection
5. **Integrity** — transactions, audit records and idempotency for money and ownership; race conditions on double submit
6. **Abuse** — rate limits, size limits, pagination caps
7. **Configuration** — CORS, security headers, debug flags, tracked agent settings without `env`
8. **Dependencies** — known advisories, unused packages, install scripts

## Report

By severity — critical · high · medium · low. Each: file:line · risk in one sentence · smallest fix · which card should do it.
