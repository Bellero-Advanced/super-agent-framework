---
name: performance
description: Speed, memory, bundle size, frame rate or load work — measure first against a budget, change one thing, measure again on the same machine, report numbers. Use when something is slow or a card has a performance gate.
---

# Performance

## Measure before touching code

1. Name the metric and its budget (latency p95 · memory · bundle KB · FPS · draw calls · queries per request). The project's
   budget file wins over guesses.
2. Reproduce on a fixed setup: same machine, same data size, warm-up run discarded, at least 3 runs — report the median and
   the spread.
3. Heavy runs go through the measure lock{{#if measureOn}} (`{{cmd.measure}}`){{/if}} so parallel work does not skew the numbers.

## Find the cause

- profile (CPU profile, heap snapshot, flame graph, query log) — do not guess from code reading
- common causes: N+1 queries · work inside loops or render paths · missing index · unbounded lists · large images ·
  synchronous I/O · re-renders from unstable props · allocations in hot paths

## Change one thing

One change per measurement. Keep the change only if the numbers move beyond run-to-run noise.

## Report

```
metric · budget · before (median, spread) · after (median, spread) · machine · command
```

A number measured on a busy machine, a different machine or a single run is labelled as such. Never claim "faster" without
before and after.
