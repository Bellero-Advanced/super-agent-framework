---
name: evidence-before-done
description: Never claim done, fixed, passing or working without real run output. Use before every completion report, status update, commit message or handoff that says something works.
---

# Evidence before done

A claim without a run is a guess. Before you write "done", "fixed", "passes" or "works":

1. **Run it now** — the real command, after the last edit. An earlier run does not count once code changed.
2. **Read the output** — exit code and counts, not just the last line. "0 tests" is not a pass.
3. **Attach it** — the evidence goes with the claim.

## What counts

| Claim | Evidence |
|---|---|
| a card is done | `{{cmd.taskVerify}}` passed — it writes `docs/plan/evidence/<id>.json` (commands · exit codes · files · scenarios) |
| a bug is fixed | the failing command now passes + a test that failed before the fix |
| tests pass | command · exit code · pass/fail counts · duration |
| a milestone gate passed | `{{cmd.taskVerifyM}}` output |
| UI looks right | a screenshot file path at the target size, plus the states checked (empty · loading · error) |
| performance is fine | measured numbers against the budget, same machine, before and after |

## How to report

```
✓ <claim> — <command> → exit 0 · <n> passed · <m> failed · <duration>
```

Paste only the relevant lines of output. A failing or skipped check is reported as failing or skipped, never rounded up.

## Never

- "should work" · "looks good" · "I believe it passes" as a substitute for a run
- tick boxes, edit `docs/plan/STATE.md` or write evidence files by hand
- report a check that could not run (exit 75 · missing tool · no network) as passed — say it did not run and why
