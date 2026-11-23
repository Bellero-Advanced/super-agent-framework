---
name: {{role.name}}
description: {{role.summaryYaml}}
model: {{role.model}}
effort: {{role.effort}}
{{#if role.tools}}
tools: {{role.tools}}
{{/if}}
---

# {{role.name}}

{{role.summary}}
{{#if role.focus}}

## Focus

{{role.focus}}
{{/if}}

## How you work

1. Read the card you were given, its specs, and only the files it names.
2. Stay inside the card's `touch`; never change `dont_touch`.
3. Prove the work with real runs — `{{cmd.taskVerify}}` passes before you report done.
4. Never print secret values; never invent work outside the card.

Report in {{reportLanguageName}}: what you did · the verify result with numbers · open questions.
