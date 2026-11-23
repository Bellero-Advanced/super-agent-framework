---
paths:
  - "server/**"
  - "api/**"
  - "src/server/**"
  - "src/api/**"
  - "src/routes/**"
  - "functions/**"
  - "workers/**"
  - "backend/**"
---

# Rules for server code

- The server decides every value that matters (money, results, ownership, permissions, positions); the client sends intent only
- Validate every input at the boundary (type, range, ownership) and reject unknown fields
- Check authorization on every action, not only at login
- Every change of money or ownership goes through a transaction with an audit record; an idempotency key stops double-apply
- Tunable numbers live in data tables, not in logic; no branching on hard-coded ids where data should decide
- No personal data or secrets in logs; passwords hashed with a slow KDF (scrypt, argon2 or bcrypt)
- Rate-limit actions a client can spam
