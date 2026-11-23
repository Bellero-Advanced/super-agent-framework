# M2 — non-blocking review notes (batched for the designer at milestone end)

One line per note. At M2 end the designer turns the ones worth doing into cards of the next milestone and marks each
line with the card id or "dropped (reason)". Blocking findings never wait here — they become cards at once.

## T-M2-04 (card size check)

- notes 1–2 (lane guard refuses a SAF project in a subfolder / on Windows; prove the top-level check for real) → done as T-M2-11
- other T-M2-04, T-M2-06, T-M2-07 and T-M2-08 notes were not recorded in a file; the T-M2-08 gate gaps became T-M2-16 and T-M2-17

## T-M2-09 (`task:culprit`)

1. Ctrl-C during a run leaves the temporary culprit worktree behind (no signal handler; `finally` does not run)
2. `upgrade` does not add new engine scripts to `package.json` → carded now as T-M2-18
3. the test for the second half of rule 21 (hint only when `deferredCards` is not empty) is weak
4. `FAIL_TAIL = 20` (lines of the failing run shown) is a number outside the `RUN_LIMITS` table
5. `findCulprit` neither checks the milestone id with `requireValid` nor escapes card ids before building a RegExp
6. wording "already fails before the first card" differs from rule 25's message
7. the oldest base is chosen by first-parent commit count — the rule says "oldest ancestor of HEAD"; confirm they agree
8. no `onOutput` streaming — a long run shows nothing until it ends
9. tie order when a commit matches several cards (subject id vs. file overlap) is not specified or tested
