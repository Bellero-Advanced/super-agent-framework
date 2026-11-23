---
name: debug-protocol
description: Bug, error, crash, regression or flaky test — reproduce, gather evidence, state the root cause, then fix at the source with a test that proves it. Never edit code before the cause is proven.
---

# Debug protocol

## 1. Reproduce

Write the exact command or steps and capture the real output. Cannot reproduce → do not change code; gather more evidence
(logs, environment, versions, inputs) until you can, or report what is missing.

## 2. Evidence

- the smallest input that fails, and one that passes
- what changed recently (`git log -p` on the area, dependency bumps, config)
- facts vs assumptions — label each

## 3. Diagnose

State the root cause in one sentence and the evidence that proves it. Two candidate causes → design a check that tells them
apart and run it. Never stack "maybe" fixes.

## 4. Fix

- fix at the source (the wrong assumption), not where the symptom shows
- write a test that fails before the fix and passes after
- where it lands: inside a card in progress → part of that card (stay inside its `touch`) · otherwise the designer writes a
  small fix card and it runs `{{cmd.taskStart}}` → `{{cmd.taskVerify}}`
- a flaky test is a bug — fix the flakiness, never retry until green

## 5. Prove

Run the original failing command, the new test and the related suite. Report the real numbers.
Flaky? Run it enough times to show the failure rate before and after.

## Dead end

Two hypotheses failed → stop guessing, widen the evidence (more logging, `git bisect`, a smaller input) and write down what
has been ruled out.

## Report

Cause · fix · proof (command + exit code + counts). No stack-trace dumps.
