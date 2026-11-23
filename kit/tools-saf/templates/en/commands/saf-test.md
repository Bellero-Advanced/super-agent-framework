---
description: Run the real tests and report the real numbers
argument-hint: <optional — card id, area, or "all">
---

# /saf-test — real runs, real numbers

Scope: $ARGUMENTS

Hand this to the `qa-runner` agent. It runs, in order, what applies:

{{#each readyCommands}}
- `{{.cmd}}` ({{.key}})
{{/each}}
- `{{cmd.specMatrixCheck}}` — every started card's scenarios have tests
- `{{cmd.checkSecrets}}` · `{{cmd.docsCheck}}`
{{#if measureOn}}

Heavy runs (the full suite, e2e, performance) go through the measure lock: `{{cmd.measure}}`. Exit 75 = not measured,
run again later — never report it as a pass.
{{/if}}
{{#if pendingCommands}}

Not set up yet (report as missing, do not invent): {{#each pendingCommands}}{{.key}}{{#unless @last}} · {{/unless}}{{/each}}
{{/if}}

Report: each command · exit code · pass/fail counts · durations · the first failure with its real message.
A failure is reported as it is — qa-runner never edits code to make a test pass.
