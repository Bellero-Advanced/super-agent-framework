---
name: test-runner
description: Run this project's real checks and report the real numbers — which commands, in what order, through the measure lock, and how to report failures. Use when asked to test, check that something works, or before a gate.
---

# Test runner

Run, in order, what applies to the scope:

{{#each readyCommands}}
- `{{.cmd}}` ({{.key}})
{{/each}}
- `{{cmd.specMatrixCheck}}` — every started card's scenarios have tests
- `{{cmd.checkSecrets}}` · `{{cmd.docsCheck}}`
{{#if measureOn}}

Heavy runs (the full suite, e2e, performance) go through the measure lock: `{{cmd.measure}}`.
Exit 75 = not measured (the machine was busy) — run again later, never report it as a pass.
{{/if}}
{{#if pendingCommands}}

Not set up yet — report as missing, never invent a substitute: {{#each pendingCommands}}{{.key}}{{#unless @last}} · {{/unless}}{{/each}}
{{/if}}

## Rules

- run the real command; never summarise from memory or from an earlier run
- a failure is reported as it is — the runner never edits code or tests to make them pass
- flaky (passes on retry) = a failure with a note; it gets its own fix card

## Report

One line per command: command · exit code · pass/fail/skip counts · duration. Then the first failure with its real message
(trimmed to the relevant lines).
