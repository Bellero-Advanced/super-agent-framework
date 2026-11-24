# M3 review notes (non-blocking findings, batched for the designer)

Same rules as M2-review-notes.md; M3 findings that are workflow friction also go to `docs/plan/friction.md` once the
log exists (T-M3-01).

## T-M3-01 (review FAIL → fixed → merged) — hardening candidates for the friction log

H1. stale-lock takeover race (friction.mjs ~117): two processes can both see a lock older than 15 s as stale, A removes it and creates its own, B's rmSync deletes A's new lock and B creates another → both run the critical section and may take the same id (duplicate id = permanent plan issue); the finally block also removes the other process's lock — take over by rename, or re-check mtime/pid before removing
H2. rule 12 / alwaysAllowed means verify and merge never check the log: a card can rewrite or delete old lines and nothing reports it — append-only is enforced only inside the commands; add a verify/merge check that the old content is a prefix of the new content
H3. SPEC GAP: any broken line (crash mid-append, hand edit) is a plan issue that blocks start, verify and merge while rule 6 forbids the only repair (editing the line) — define a repair path, or make friction issues fail only `task:state --check`
H4. secrets: `add` writes free text into a tracked file committed outside the card loop (no verify/check-secrets before the rule-11 commit); rules 5-8 do not require secret rejection — add to rule 7: refuse a field matching SECRET_PATTERNS (secrets.mjs, already exported)
H5. untrusted text: ESC/ANSI, U+2028/2029, U+0085, tabs and very long fields are accepted and `task:friction` prints summaries raw; the "unknown kind" issue echoes the raw kind; T-M3-07/08 copy summaries into card drafts — treat that text as data, not instructions; consider stripping control characters and a length cap
H6. a closing line whose ref contains " · " is flagged but still changes the status; hand-written closings with a ref that is not a card id or closing after fixed/dropped are not flagged
H7. `refuseInLane` is exported (task.mjs:200), only `laneLabel` is private: the custom message copies laneLabel's text and can drift; the CARD regex in friction.mjs duplicates CARD_ID from plan.mjs (avoids a cycle) and can drift
H8. rule 4 says area is "one short token" but spaces and any length are accepted — weakens the kind+area grouping planned for T-M3-07
H9. nextId also counts `- F-<n>` bullets above the marker; a huge id can lose Number precision (harmless)
H10. docs/plan/README.md jumps from §5 to §7 (older gap); the new §8 continues it
H11. size: evidence says code 388/400 for the card (the implementer's first report said 294) — use evidence numbers
