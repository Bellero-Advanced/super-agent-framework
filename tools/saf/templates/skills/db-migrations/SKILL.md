---
name: db-migrations
description: Changing a database schema, writing a migration, backfilling or fixing data. Forward-only migrations, rehearsed on a local test database, safe for running code, never applied to production without the owner's order.
---

# Database migrations

## Write

- **Forward-only** — a new migration for every change; never edit one that has run anywhere shared
- **Expand → migrate → contract** — add the new column/table first (nullable or with a default), deploy code that writes both, backfill, then remove the old one in a later migration. No step breaks the code that is running
- **Small and reversible in practice** — one concern per migration; destructive steps (drop, narrowing type, NOT NULL on existing data) get their own migration and a written rollback plan
- **Indexes** on large tables are created without locking writes (`CONCURRENTLY` or the engine's equivalent)
- **Constraints over code** — uniqueness, foreign keys and checks belong in the schema
- **Money and ownership** — every change runs in a transaction with an audit/ledger record and an idempotency key

## Rehearse

1. run every pending migration on a fresh local database whose name ends in `_test`
2. run it again on a copy with realistic data volume when the table is large
3. run the test suite against the migrated schema
4. for a backfill: dry run first, print counts (rows matched / changed), then run in batches

Never point a migration or test at a shared, staging or production database from a card.

## Ship

- production migrations run only on the owner's explicit order, after a backup, and are logged with the exact migration ids
- the card's evidence lists: migration ids · rehearsal command and result · row counts for backfills

## Never

- print connection strings or credentials · `DROP` without a backup and an order · data fixes by hand in a console
