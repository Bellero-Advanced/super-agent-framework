# Friction log

Where the workflow got in the way of a card: a review bounced because of a gap in SAF, an engine command failed or misbehaved, a document contradicted the code, or the work needed a step the workflow does not support. Record one with `npm run task:friction -- add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…>` (what to write: docs/plan/README.md). Lines below the marker are append-only: never edit or remove one — a mistake is closed with a new line.

Earlier record, from before this log existed: [notes/M2-review-notes.md](notes/M2-review-notes.md).

<!-- entries: append only -->
- F-001 · 2026-11-24 · workaround · - · examples/todo-api · every kit card restores examples/todo-api/.claude and package.json by hand after the example upgrade · evidence: M2 cards What to do; docs/plan/notes/M2-review-notes.md T-M2-10 C and T-M2-12 8
- F-002 · 2026-11-24 · workaround · - · task:verify · after a spec review fails, verifying again needs task:start --restart, which resets the attempt history · evidence: kit/tools-saf/lib/task.mjs verifyCard refuses with "already passed"; the reviews of T-M2-10 and T-M2-12 through T-M2-15 failed
- F-003 · 2026-11-24 · workaround · - · docs/plan/notes · non-blocking review notes of T-M2-04 and T-M2-06 to T-M2-08 were never written down · evidence: docs/plan/notes/M2-review-notes.md section T-M2-04
- F-004 · 2026-11-24 · doc-drift · - · docs/plan/README.md · section 1 says the evidence reads "full suite deferred to gate", but the evidence JSON carries deferred and targeted fields · evidence: docs/plan/notes/M2-review-notes.md T-M2-10 D
