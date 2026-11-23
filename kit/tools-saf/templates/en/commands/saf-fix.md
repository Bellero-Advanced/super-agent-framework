---
description: Bug or error — find the root cause with evidence before touching code, then fix it with a test that proves it
argument-hint: <symptom, error text, or failing command>
---

# /saf-fix — evidence first, then the fix

Problem: $ARGUMENTS

Follow the `debug-protocol` skill:

1. **Reproduce** — the exact command or steps, and the real output. No reproduction → gather more evidence, do not guess.
2. **Evidence** — logs, failing test, smallest input. Write down what is known and what is assumed.
3. **Diagnose** — state the root cause in one sentence, with the evidence that proves it.
4. **Fix** — at the source, not the symptom. Add a test that fails before the fix and passes after.
5. **Prove** — run the failing command again plus the related tests; attach the real numbers.

Where it lands:

- inside a card in progress → part of that card (stay inside its `touch`)
- otherwise → the designer writes a small fix card (`/saf-plan`) and it runs through `{{cmd.taskStart}}` → `{{cmd.taskVerify}}`
- a flaky test is a bug — fix the flakiness, never retry until green

Report in {{chatLanguageName}}: cause · fix · proof. No stack-trace dumps.
