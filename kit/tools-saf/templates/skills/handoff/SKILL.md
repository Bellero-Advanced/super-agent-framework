---
name: handoff
description: Hand work to another agent or a later session without losing context — a short brief with the goal, the card, what was ruled out, the files that matter and the exact next step. Use before delegating, before a session ends mid-card, or when context is about to run out.
---

# Handoff

Write the brief so a fresh agent can continue with no other context. Keep it under 30 lines.

```
Goal:        one sentence — the user-visible outcome
Card:        T-M<n>-<nn> (docs/plan/tasks/…) · status from the injected summary
Done when:   the card's commands (unchanged)
State:       what is finished · what is in progress (file:function)
Ruled out:   hypotheses tested and why they failed — with the evidence
Files:       the 3–8 files that matter, with one line each
Next step:   the exact next command or edit
Questions:   anything waiting for the owner, with a recommendation
```

Rules:

- facts with evidence, not impressions; real command output trimmed to the relevant lines
- no secrets, no connection strings
- point to files instead of pasting them
- the receiver verifies — a handoff is never a reason to skip `task:verify`
