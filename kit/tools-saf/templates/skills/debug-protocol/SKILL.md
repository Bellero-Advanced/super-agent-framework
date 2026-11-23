---
name: debug-protocol
description: Evidence-first debugging in five stages — reproduce, evidence, diagnose, fix, prove. Never touch code before the root cause is stated with evidence; fix the source, not the symptom. Use for any bug, error, crash, regression, flaky test or unexpected behaviour.
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
- keep the change inside the card's `touch`; a larger fix needs its own card

## 5. Prove

Run the original failing command, the new test and the related suite. Report the real numbers.
Flaky? Run it enough times to show the failure rate before and after.

## Dead end

Stuck after two hypotheses failed: stop guessing, widen the evidence (add logging, bisect with `git bisect`, minimise the
input), and write down what has been ruled out.
