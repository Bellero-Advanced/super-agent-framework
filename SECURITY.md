# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: **Security → Advisories → Report a vulnerability** on
<https://github.com/Bellero-Advanced/super-agent-framework/security/advisories/new>.

Include what you found, how to reproduce it, and the impact you expect. You will get an answer as soon as a maintainer has
looked at it; we will agree on a fix and a disclosure date with you and credit you unless you prefer otherwise.

## Scope

SAF runs commands from a project's own files (card criteria, gates, `saf.config.json`) with the user's permissions — the
same trust as `package.json` scripts. Reports that matter most:

- secret values leaking into evidence, logs, generated files or terminal output despite redaction
- `check-secrets` or `docs:check` passing when they should fail
- the installer or `upgrade` overwriting or deleting files SAF did not write
- command injection through values that are not meant to be commands (card ids, titles, paths)

## Supported versions

The latest released version.
