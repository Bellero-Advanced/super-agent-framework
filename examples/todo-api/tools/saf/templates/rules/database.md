---
paths:
{{rulePathsYaml}}
---

# Rules for database files ({{stack.database}})

- Schema changes go through migration files only — never edit a database by hand
- A migration that already ran is never edited; write a new one
- Rehearse on a local or `_test` database; production migrations only on the {{owner}}'s order
- Access rules deny by default; test allowed and denied paths
- Money and ownership: transactions, audit rows, idempotency keys
- Never print connection strings; count env keys only
