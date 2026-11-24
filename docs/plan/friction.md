# Friction log

Where the workflow got in the way of a card: a review bounced because of a gap in SAF, an engine command failed or misbehaved, a document contradicted the code, or the work needed a step the workflow does not support. Record one with `npm run task:friction -- add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…>` (what to write: docs/plan/README.md). Lines below the marker are append-only: never edit or remove one — a mistake is closed with a new line.

Earlier record, from before this log existed: [notes/M2-review-notes.md](notes/M2-review-notes.md).

<!-- entries: append only -->
- F-001 · 2026-11-24 · workaround · - · examples/todo-api · every kit card restores examples/todo-api/.claude and package.json by hand after the example upgrade · evidence: M2 cards What to do; docs/plan/notes/M2-review-notes.md T-M2-10 C and T-M2-12 8
- F-002 · 2026-11-24 · workaround · - · task:verify · after a spec review fails, verifying again needs task:start --restart, which resets the attempt history · evidence: kit/tools-saf/lib/task.mjs verifyCard refuses with "already passed"; the reviews of T-M2-10 and T-M2-12 through T-M2-15 failed
- F-003 · 2026-11-24 · workaround · - · docs/plan/notes · non-blocking review notes of T-M2-04 and T-M2-06 to T-M2-08 were never written down · evidence: docs/plan/notes/M2-review-notes.md section T-M2-04
- F-004 · 2026-11-24 · doc-drift · - · docs/plan/README.md · section 1 says the evidence reads "full suite deferred to gate", but the evidence JSON carries deferred and targeted fields · evidence: docs/plan/notes/M2-review-notes.md T-M2-10 D
- F-005 · 2026-11-24 · workaround · T-M3-01 · task:merge · an engine change that makes a file always allowed cannot merge with the file in the same card (bootstrap) · evidence: T-M3-01 merge refused: docs/plan/friction.md changed after verification; the lane engine drops it as always-allowed but the main engine predates that rule; fixed by adding it to this repo's alwaysAllowed
- F-006 · 2026-11-24 · workaround · T-M3-01 · .gitignore · a generated gitignore line needs the same line in this repo and in examples/todo-api, outside the card touch list · evidence: T-M3-01 report: gitignore files are outside the card touch list so the lock line was added by the main session
- F-002 → fixed · 2026-11-24 · T-M3-02
- F-007 · 2026-11-24 · workaround · T-M3-02 · saf:refresh · saf:refresh and the example upgrade rewrite two manifest files outside the card touch list and alwaysAllowed, reverted by hand · evidence: T-M3-02 first verify failed on .saf/manifest.json files rewritten by saf:refresh and the example upgrade
- F-008 · 2026-11-24 · command-failed · T-M3-28 · spec:matrix · spec:matrix --check in a lane fails while another lane's started card has not merged, so two parallel lane cards with spec scenarios cannot both verify · evidence: T-M3-28 verify failed 3 times in its lane: spec:matrix --check reports 8 gaps COPIES-AC-01..08 of the started card T-M3-27 whose tests live on another lane branch
