# FAQ

**Does SAF need dependencies or a build?** No. The engine is plain Node ≥ 20 ESM, vendored in `tools/saf/`.

**My project is not JavaScript.** Choose package manager `none`. Commands become `node tools/saf/bin/saf.mjs …`; your test
commands (`pytest`, `go test ./...`, `cargo test`) go in `stack.commands`. Scenario tests in other languages count when
the scenario id appears in a test file.

**Why can't I mark a card done myself?** "Done" is evidence: `task:verify` runs the commands and checks the files. Hand
edits of `STATE.md` or evidence are overwritten and `task:state --check` fails.

**A card needs one more file.** Stop and ask the designer to widen `touch` (or split the card). Widening it yourself to get
green defeats the point.

**I have changes lying around before starting a card.** Fine — `task:start` hashes dirty files; unchanged ones are not
counted as the card's.

**Can two cards run at once?** Yes, in worktree lanes, when their `touch` lists do not overlap. `task:next --parallel`
tells you which.

**What does the probe gate cost?** Two short `claude -p` calls without tools. It is an M0 gate; skip it by removing the
gate from `docs/plan/milestones/M0.md` if you prefer.

**Where do my old agent docs go?** `docs/archive/pre-saf/`, same relative paths. Nothing is deleted.

**Does SAF push or deploy?** Never by itself. The generated rules say push and deploy only on the owner's order (configurable);
`release-operator` is the only role meant to touch live systems.

**Thai documents?** Set `people.docLanguage: "th"`. CLAUDE.md, the index, decisions, plan docs, STATE, cards and commands are
generated in Thai, addressing you as "คุณ". Agent role files stay in English (shorter, cheaper); reports follow
`roles.reportLanguage`.

**How do I change a setting later?** Edit `saf.config.json` and re-run setup with it, or run `/saf-setup` again.
