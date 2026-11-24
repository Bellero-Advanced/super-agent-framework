---
description: Say what you want in plain words — SAF routes it (build through the card loop · plan · bug · test · security · question · how to use SAF), proves it with real runs and reports briefly
argument-hint: <what you want, in plain words — or "help">
---

# /saf — one entry point

Request: $ARGUMENTS

## 1. Route

Read the injected status (or `docs/plan/STATE.md`) first, then pick **one** route:

| The request is… | Route |
|---|---|
| empty, "help", "how do I use this", "what can you do" | **Help** (section 4) — answer it yourself, change nothing |
| a question about this project ("where is…", "why does…", "what's the status") | answer from `docs/INDEX.md` → the topic's home and the code · change nothing |
| plan a milestone, or new work that is in no milestone yet | `/saf-plan` — never invent work: ask the owner once whether to add it |
| a bug, error, crash, flaky test | the `debug-protocol` skill — root cause with evidence before any edit |
| "run the tests", "is it working", numbers | the `test-runner` skill (hand it to `qa-runner`) |
| security, secrets, "is this safe" | the `security-review` skill |
| build or change something | the card loop (section 2) |

Unclear between two routes → ask one short question with a recommendation.

## 2. Card loop (build or change)

1. Match the request to a card in `docs/plan/tasks/` of the active milestone. No card yet but it belongs to the active
   milestone → `designer` writes the card first, then continue. Unmet `depends` come first.
2. Run it:

| Step | Who | Command |
|---|---|---|
| start | main session | `npm run task:start -- <id>` (code-lane role → `npm run task:start -- <id> --worktree`) |
| build | the agent `npm run task:start -- <id>` named | touch only files in `touch` |
| verify | same agent | `npm run task:verify -- <id>` until it passes |
| review | `spec-reviewer` (read only) | `npm run task:diff -- <id>`, then the card id · the review types · the diff path |
| real tests | `qa-runner` | when the card touches UI · multiplayer · performance |
| land | main session | commit · lane card → `npm run task:merge -- <id>` |

Give the `spec-reviewer` the card id, the review types the card needs (a comma list of `text` · `data` · `security` · `refactor`, as its agent file defines them; none fits → none) and the path `npm run task:diff -- <id>` prints: the file holds exactly the files `npm run task:verify -- <id>` counted as the card's — never build a diff by hand.

After every spec review the main session records the result with `npm run task:review -- <id> pass|fail [--kind <k>[,<k>…]] [--note <text>] [--area <area>]` (`pass`, or `fail` with the kinds that
apply). On `fail` the card is open again: the builder fixes it and runs `npm run task:verify -- <id>` again, no restart. The command
does not commit: commit the round file `docs/plan/evidence/reviews/<id>.json` alone (before `npm run task:merge -- <id>`)
with `git commit -m "chore(plan): review <id> round <n>" -- docs/plan/evidence/reviews/<id>.json`.

Independent cards may run in parallel — `npm run task:next -- --parallel` lists the safe set.

## 3. Report

Reply in Thai, results first: what changed for the user · which card · the verify result with real
numbers · anything the owner must decide (once, with options and a recommendation). No stack traces.
Never say "done" without real run output (the `evidence-before-done` skill).

## 4. Help (answer this yourself)

Show the owner, in Thai:

- **Commands:** `/saf <anything>` (this) · `/saf-plan <M or goal>` (designer writes cards and specs, then waits for Go) ·
  `/saf-setup` (change settings — re-runs the interview)
- **Skills load by themselves** when the work matches: `debug-protocol` · `tdd` · `code-review` · `security-review` · `writing-for-agents` · `handoff` · `evidence-before-done` · `test-runner`
- **Roles:**

| Role | Model | Effort | Does |
|---|---|---|---|
| `designer` | `claude-opus-5-5` | high | Writes milestone plans, cards and specs. Never edits product code. |
| `spec-reviewer` | `claude-opus-5-5` | high | Read-only. Compares a finished card with its spec and reports every mismatch. |
| `implementer` | `claude-sonnet-5-5` | high | Takes one card, writes code and tests, runs task:verify until it passes. |
| `qa-runner` | `claude-sonnet-5-5` | medium | Runs real tests (e2e, load, perf, screenshots) and reports real numbers. Never fixes code to pass. |
| `release-operator` | `claude-sonnet-5-5` | medium | The only role that touches live systems — only on an explicit owner order, dry run first, logged. |

- **Open a session per role:**
  - design · write cards/specs · review against specs (`designer` · `spec-reviewer`): `claude --model claude-opus-5-5`
  - build cards · test · specialist work (`implementer` · `qa-runner` · `release-operator`): `claude --model claude-sonnet-5-5`
- **Card commands:** `npm run task:start -- <id>` → work → `npm run task:verify -- <id>` → review → commit · status `docs/plan/STATE.md` ·
  how it works `docs/plan/README.md`
- **Try:** `/saf what is the next card?` · `/saf the login page crashes on submit` · `/saf run the tests`

## 5. Self-fix (SAF fixes its own proven bugs)

`workflow.selfFix` is `on`: a friction entry of kind `command-failed` or `doc-drift` that one size M card with a test can fix becomes a card
in the **active** milestone without waiting for the owner's Go — at most 3 such cards per milestone
(`SELF_FIX_LIMITS.perMilestone` in `tools/saf/lib/friction.mjs`). The engine checks every condition (`npm run task:state -- --check`).

1. `npm run task:friction -- draft` prints a draft with `self_fix: <F-id>`. Replace `T-M<n>-??` with the next free card id, fill
   `touch` (a test file included) and "Done when" (a command that runs that test file), and save it as the card file.
2. Append the card id to `cards:` of the active milestone — only that one line of the milestone file.
3. Run `npm run task:friction -- close <F-id> carded <card id>`.
4. Run the normal card loop with the test written first and failing before the fix (the `tdd` skill); the `spec-reviewer`
   checks that the test exercises the friction's evidence. When the card passes `npm run task:verify -- <id>` (a lane card: `npm run task:merge -- <id>`),
   the engine closes the entry as fixed in `docs/plan/friction.md`: commit that file alone right after (an uncommitted main
   folder refuses the next merge).

Anything else — another kind, size L (a self-fix card is size M), no test, the cap reached — waits for `designer` and the owner's Go (`/saf-plan`).
