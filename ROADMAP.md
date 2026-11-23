# Roadmap

Gates, not dates — an item ships when its tests and docs are done. Ideas and votes welcome in
[Discussions](https://github.com/Bellero-Advanced/super-agent-framework/discussions).

## Next

- **More document languages** — the generator and status text are English and Thai today; add a language by adding a
  template folder and a text table
- **Guided upgrade of project docs** — show a diff of what `/saf-setup` would change in CLAUDE.md and the plan before
  re-generating, instead of archive-and-replace
- **Skill packs from the community** — a documented format so a pack can live in its own repository and be picked in setup
- **Card size check** — `task:verify` reports changed code and test lines against the card's size cap
- **Evidence viewer** — a static HTML page generated from `docs/plan/evidence/` for people who do not read JSON
- **Setup suggestions** — during `/saf-setup`, propose ideas for scope and direction, each with its reason, drawn from
  the owner's own interview answers, before the first milestone is written

## Later

- **Subfolder projects** — SAF inside one package of a larger git repository (paths relative to the project, not the repo)
- **Hosted CI recipe** — a reusable GitHub Actions workflow that runs `task:state --check`, `docs:check`, `check-secrets`
  and `spec:matrix --check` on pull requests
- **Team mode** — several people sharing one plan: card ownership, side lanes per person, merge queue

## Done

See [CHANGELOG.md](CHANGELOG.md).
