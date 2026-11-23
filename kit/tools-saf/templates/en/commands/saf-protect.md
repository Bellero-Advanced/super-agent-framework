---
description: Security review — secrets, authorization, untrusted input, money and data changes, configuration
argument-hint: <optional — area, card id, or "all">
---

# /saf-protect — security review

Scope: $ARGUMENTS

{{#if hasRole.security_auditor}}
Hand this to the `security-auditor` agent with the `security-review` skill.
{{else}}
Use the `security-review` skill (a read-only pass; enable the `security-auditor` role in `saf.config.json` for a dedicated agent).
{{/if}}

1. `{{cmd.checkSecrets}}` — no secret values in tracked files ({{envFilesText}} must stay untracked). Never print a value; count key names only.
2. Trust boundaries — the server decides; client input is intent only. Validate every input, check authorization on every action.
3. Injection — SQL · shell · HTML · path traversal · deserialization.
4. Data and money — every change of value goes through a transaction with an audit record and an idempotency key.
5. Configuration — headers, CORS, cookies, rate limits, dependency risks, tracked settings without `env`.
{{#if policies.externalServices}}
6. External services — only {{policies.externalServices}} may be touched.
{{/if}}

Report by severity (critical · high · medium · low): where · why it matters · the smallest fix · which card should do it.
Fixes go through cards — the review itself changes nothing.
