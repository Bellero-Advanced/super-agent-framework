import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { REPO, card, cleanup, commitAll, git, gitRepo, lib, milestone, tmp, write } from "../helpers.mjs";

const rel = await lib("release.mjs");
const config = await lib("config.mjs");
const { NOT_ASKED } = await lib("choices.mjs");
after(cleanup);

const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, "task", "release", ...args], { cwd, encoding: "utf8" });
const NAME = "demo-pkg";
const ADDED = "### Added\n\n- a thing\n";
const changelog = (unreleased) => `# Changelog\n\n## Unreleased\n\n${unreleased}\n## 0.4.0 — 2026-01-01\n\n### Added\n\n- first\n`;
const byId = (guards) => Object.fromEntries(guards.map((g) => [g.id, g]));

/** A project with a bare remote: milestone M1 closed with its gate evidence, one done card, auto on, everything pushed. */
function fixture({ auto = "on", unreleased = ADDED, status = "done", cardStatus = "done", gates = [{ id: "cards", pass: true }], version = "0.4.0" } = {}) {
  const remote = tmp("saf-rel-remote-");
  git(remote, "init", "--bare", "-q");
  const root = gitRepo();
  const raw = { version: 1, stack: { packageManager: "none" }, policies: { release: { auto, versionFiles: ["VERSION"] } } };
  write(root, "saf.config.json", raw);
  write(root, "package.json", { name: NAME, version });
  write(root, "VERSION", `${version}\n`);
  write(root, "CHANGELOG.md", changelog(unreleased));
  write(root, "src/code.js", "export {};\n");
  write(root, "docs/plan/milestones/M1.md", milestone({ id: "M1", status, cards: ["T-M1-01"] }));
  write(root, "docs/plan/tasks/M1/T-M1-01.md", card({ id: "T-M1-01" }));
  write(root, "docs/plan/evidence/T-M1-01.json", { id: "T-M1-01", status: cardStatus });
  const head = commitAll(root, "work");
  write(root, "docs/plan/evidence/M1.json", { id: "M1", kind: "milestone", verified: { head, gates } });
  commitAll(root, "close M1");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "-u", "origin", "main");
  return { root, remote, head, config: config.resolveConfig(raw) };
}

/** Real git in the fixture; the registry and `gh` are fakes. `run.calls` records every call. */
function runner(root, { versions = { [NAME]: ["0.3.0", "0.4.0"] }, gh } = {}) {
  const real = rel.commandRunner(root);
  const run = (cmd, args) => {
    run.calls.push([cmd, ...args]);
    if (cmd === "npm") {
      const v = versions[args[1]];
      if (args[0] !== "view" || v === undefined) return { code: 1, out: "", err: "npm error code E404" };
      return v === null ? { code: 1, out: "", err: "npm error code ENOTFOUND" } : { code: 0, out: JSON.stringify(v), err: "" };
    }
    if (cmd === "gh") return gh ? gh(args) : { code: 127, out: "", err: "gh: not found" };
    return real(cmd, args);
  };
  run.calls = [];
  return run;
}
const ctxOf = (f, opts) => ({ root: f.root, config: f.config, run: runner(f.root, opts), now: () => new Date("2026-02-03T10:00:00Z") });

/** Every file under `dir` with its hash — the byte-level picture of a folder. */
function snapshot(dir, skip = []) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const name = relative(dir, p).split("\\").join("/");
      if (skip.includes(name)) continue;
      if (e.isDirectory()) walk(p);
      else out.push(`${name}:${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
    }
  };
  walk(dir);
  return out.sort();
}

const pushAll = (root, msg) => {
  commitAll(root, msg);
  git(root, "push", "-q", "origin", "main");
};

test("REL-AC-01 auto off at HEAD: G-switch fails with the reason, exit 1, nothing written, nothing pushed", () => {
  const f = fixture({ auto: "off", unreleased: "" });
  const before = { tree: snapshot(f.root, [".git"]), remote: snapshot(f.remote) };
  const r = cli(f.root, "M1");
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /✗ G-switch — .*policies\.release\.auto is "off" at HEAD/);
  assert.deepEqual(snapshot(f.root, [".git"]), before.tree, "the worktree is byte-identical");
  assert.deepEqual(snapshot(f.remote), before.remote, "the remote is byte-identical");
  const g = byId(rel.releaseGuards(ctxOf(f), "M1", { step: "prepare" }));
  assert.equal(g["G-switch"].ok, false);
});

test("REL-AC-01 auto on at HEAD but off on origin/main: G-switch fails naming origin/main (the fetch is part of the guard)", () => {
  const f = fixture();
  const other = tmp("saf-rel-other-");
  git(other, "clone", "-q", f.remote, ".");
  const cfg = JSON.parse(readFileSync(join(other, "saf.config.json"), "utf8"));
  cfg.policies.release.auto = "off";
  write(other, "saf.config.json", cfg);
  commitAll(other, "switch off");
  git(other, "push", "-q", "origin", "main");
  const g = byId(rel.releaseGuards(ctxOf(f), "M1", { step: "prepare" }));
  assert.equal(g["G-switch"].ok, false);
  assert.match(g["G-switch"].reason, /origin\/main/);
  assert.match(g["G-switch"].reason, /"off"/);
  assert.equal(byId(rel.releaseGuards(ctxOf(fixture()), "M1", { step: "prepare" }))["G-switch"].ok, true, "on at both places passes");
});

test("REL-AC-01 the setting: default off, in the schema, not per machine, with a not-asked line in both languages", () => {
  const d = config.resolveConfig({}).policies.release;
  assert.deepEqual(d, { auto: "off", packages: ["."], versionFiles: [], ciWorkflow: "ci.yml" });
  assert.equal(config.validateConfig({ policies: { release: { auto: "on", extra: 1 } } }).length > 0, true, "no extra property");
  assert.equal(config.validateConfig({ policies: { release: { auto: "maybe" } } }).length > 0, true);
  assert.equal(config.validateConfig({ policies: { release: { auto: "on", packages: ["a"], versionFiles: [], ciWorkflow: "ci.yml" } } }).length, 0);
  assert.ok(!config.LOCAL_KEYS.some((k) => k.startsWith("policies.release")));
  for (const k of ["auto", "packages", "versionFiles", "ciWorkflow"]) for (const lang of ["en", "th"]) assert.ok(NOT_ASKED[`policies.release.${k}`][lang].length > 0, `${k} ${lang}`);
  assert.match(NOT_ASKED["policies.release.auto"].en, /push.*tag.*publishing.*every.*guard.*off by default/i);
  assert.equal(config.ENGINE_SCRIPTS["task:release"], "task release");
  assert.equal(config.scriptCommand("npm", "task:release", "M1"), "npm run task:release -- M1");
});

test("REL-AC-02 nextVersion: Breaking / Added / only Fixed / empty at 0.x and at 1.x", () => {
  const log = (body) => rel.readChangelog(changelog(body));
  const breaking = "### Breaking\n\n- gone\n\n### Added\n\n- x\n";
  const cases = [
    [breaking, "0.4.2", "0.5.0"],
    [breaking, "1.4.2", "2.0.0"],
    [ADDED, "0.4.2", "0.5.0"],
    [ADDED, "1.4.2", "1.5.0"],
    ["### Fixed\n\n- bug\n", "0.4.2", "0.4.3"],
    ["### Fixed\n\n- bug\n", "1.4.2", "1.4.3"],
    ["### Fixed\n\n- bug\n\n### Changed\n\n- c\n", "1.4.2", "1.5.0"],
    ["### Breaking\n\n### Added\n\n- x\n", "1.4.2", "1.5.0"],
    ["", "0.4.2", null],
    ["### Added\n\n### Fixed\n", "1.4.2", null],
  ];
  for (const [body, current, want] of cases) assert.equal(rel.nextVersion(current, log(body)), want, `${current} ${JSON.stringify(body)}`);
  assert.equal(rel.nextVersion("not-a-version", log(ADDED)), null);
  assert.deepEqual(rel.releaseBump("1.0.0", log("### Fixed\n\n- bug\n")), { bump: "patch", reason: "Fixed" });
  const parsed = rel.readChangelog(changelog(`${ADDED}\r\n`).replace(/\n/g, "\r\n"));
  assert.deepEqual(parsed.unreleased, { Added: ["- a thing"] });
  assert.deepEqual(parsed.releases, ["0.4.0"]);
  assert.deepEqual(rel.readChangelog("# Changelog\n").unreleased, {});
});

test("REL-AC-02 the release log line is read back, and the log is where the plan says", () => {
  const line = rel.releaseLogLine({ version: "0.5.0", date: "2026-02-03", mid: "M1", head: "abcdef0123", from: "0.4.0", bump: "minor", reason: "Added" });
  assert.equal(line, "- v0.5.0 · 2026-02-03 · M1 · gate abcdef0 · from v0.4.0 · bump minor (Added)");
  assert.deepEqual(rel.readReleaseLog(`# Releases\n\n${line}\nnot an entry\n`), [{ version: "0.5.0", date: "2026-02-03", mid: "M1", head: "abcdef0", from: "0.4.0", bump: "minor", reason: "Added" }]);
  assert.equal(rel.RELEASE_LOG, "docs/plan/releases.md");
});

test("REL-AC-03 G-milestone names every cause: milestone open, a card open, a gate that failed, a code file changed since the gate", () => {
  const f = fixture({ status: "active", cardStatus: "in_progress", gates: [{ id: "project-checks", pass: false }] });
  write(f.root, "src/new.js", "export const x = 1;\n");
  pushAll(f.root, "code after the gate");
  const g = byId(rel.releaseGuards(ctxOf(f), "M1", { step: "prepare" }))["G-milestone"];
  assert.equal(g.ok, false);
  for (const cause of [/M1 .*not done/, /T-M1-01/, /project-checks/, /src\/new\.js/, /task:verify M1/]) assert.match(g.reason, cause);
  const open = byId(rel.releaseGuards(ctxOf(fixture({ status: "active" })), "M1", { step: "prepare" }))["G-milestone"];
  assert.match(open.reason, /M1 .*not done/);
  assert.doesNotMatch(open.reason, /T-M1-01|task:verify/);
  const none = byId(rel.releaseGuards(ctxOf(fixture()), "M2", { step: "prepare" }))["G-milestone"];
  assert.equal(none.ok, false);
  assert.match(none.reason, /M2/);
});

test("REL-AC-03 with only release files changed since the gate, G-milestone passes", () => {
  const f = fixture();
  write(f.root, "CHANGELOG.md", changelog(`${ADDED}\n- more\n`));
  write(f.root, "package.json", { name: NAME, version: "0.4.0", description: "x" });
  write(f.root, "VERSION", "0.4.0\n");
  write(f.root, "docs/plan/releases.md", "# Releases\n");
  write(f.root, "docs/plan/notes/x.md", "note\n");
  write(f.root, ".saf/plan.md", "mirror\n");
  pushAll(f.root, "release files");
  const g = byId(rel.releaseGuards(ctxOf(f), "M1", { step: "prepare" }))["G-milestone"];
  assert.equal(g.ok, true, g.reason);
  write(f.root, "README.md", "readme\n");
  pushAll(f.root, "a doc");
  assert.match(byId(rel.releaseGuards(ctxOf(f), "M1", { step: "prepare" }))["G-milestone"].reason, /README\.md/);
});

test("REL-AC-04 every guard passes, the plan lists the actions, exit 0, and neither the worktree nor the remote changes by a byte", () => {
  const f = fixture();
  const before = { tree: snapshot(f.root, [".git"]), remote: snapshot(f.remote) };
  const ctx = ctxOf(f);
  const lines = [];
  const exit = rel.runRelease(ctx, "M1", { out: (s) => lines.push(s) });
  const text = lines.join("\n");
  assert.equal(exit, 0, text);
  for (const id of ["G-switch", "G-branch", "G-milestone", "G-version"]) assert.match(text, new RegExp(`✓ ${id} `));
  assert.doesNotMatch(text, /✗/);
  assert.match(text, /v0\.4\.0 → v0\.5\.0 \(minor: Added\)/);
  for (const action of [/set version 0\.5\.0 in package\.json/, /set version 0\.5\.0 in VERSION/, /rename "## Unreleased" to "## 0\.5\.0 — 2026-02-03"/, /append to docs\/plan\/releases\.md: - v0\.5\.0 · 2026-02-03 · M1 · gate/, /chore\(release\): v0\.5\.0 \(M1\)/, /git push$/m, /git tag -a v0\.5\.0/, /git push origin refs\/tags\/v0\.5\.0/]) assert.match(text, action);
  assert.deepEqual(snapshot(f.root, [".git"]), before.tree, "the worktree is byte-identical");
  assert.deepEqual(snapshot(f.remote), before.remote, "the remote is byte-identical");
  const git_ = ctx.run.calls.filter((c) => c[0] === "git").map((c) => c[1]);
  for (const sub of git_) assert.ok(["fetch", "--no-optional-locks", "rev-parse", "show", "diff", "log", "tag", "ls-remote"].includes(sub), `read-only git only: ${sub}`);
  assert.deepEqual(ctx.run.calls.filter((c) => !["git", "npm"].includes(c[0])), [], "no gh call before the tag step");
  assert.ok(ctx.run.calls.filter((c) => c[0] === "npm").every((c) => c[1] === "view"), "the registry is only read");
});

test("REL-AC-04 G-branch: a dirty worktree, another branch, a card in progress or a HEAD behind origin each fail with the reason", () => {
  const dirty = fixture();
  write(dirty.root, "stray.txt", "x\n");
  assert.match(byId(rel.releaseGuards(ctxOf(dirty), "M1", { step: "prepare" }))["G-branch"].reason, /not clean/);
  const other = fixture();
  git(other.root, "checkout", "-q", "-b", "side");
  assert.match(byId(rel.releaseGuards(ctxOf(other), "M1", { step: "prepare" }))["G-branch"].reason, /branch is side, not main/);
  const busy = fixture({ cardStatus: "in_progress" });
  assert.match(byId(rel.releaseGuards(ctxOf(busy), "M1", { step: "prepare" }))["G-branch"].reason, /T-M1-01 is in progress/);
  const ahead = fixture();
  write(ahead.root, "docs/plan/x.md", "x\n");
  commitAll(ahead.root, "local only");
  assert.match(byId(rel.releaseGuards(ctxOf(ahead), "M1", { step: "prepare" }))["G-branch"].reason, /HEAD is not origin\/main/);
});

test("REL-AC-04 G-version: version already on the registry, an unreachable registry, a tag that exists, packages that differ, an empty Unreleased", () => {
  const f = fixture();
  const guard = (opts, fx = f) => byId(rel.releaseGuards(ctxOf(fx, opts), "M1", { step: "prepare" }))["G-version"];
  assert.equal(guard({}).ok, true, guard({}).reason);
  assert.equal(guard({ versions: { [NAME]: undefined } }).ok, true, "a package that is not on the registry yet is free");
  assert.match(guard({ versions: { [NAME]: ["0.5.0"] } }).reason, new RegExp(`${NAME}.*0\\.5\\.0`));
  assert.match(guard({ versions: { [NAME]: null } }).reason, /registry/);
  git(f.root, "tag", "v0.5.0");
  assert.match(guard({}).reason, /tag v0\.5\.0 exists locally/);
  git(f.root, "tag", "-d", "v0.5.0");
  git(f.root, "tag", "v0.5.0");
  git(f.root, "push", "-q", "origin", "refs/tags/v0.5.0");
  git(f.root, "tag", "-d", "v0.5.0");
  assert.match(guard({}).reason, /tag v0\.5\.0 exists on origin/);
  const empty = fixture({ unreleased: "" });
  assert.match(guard({}, empty).reason, /Unreleased is empty/);
  const two = fixture();
  const cfg = JSON.parse(readFileSync(join(two.root, "saf.config.json"), "utf8"));
  cfg.policies.release.packages = [".", "pkg/b"];
  write(two.root, "saf.config.json", cfg);
  write(two.root, "pkg/b/package.json", { name: "demo-b", version: "0.3.0" });
  pushAll(two.root, "second package");
  const fx = { ...two, config: config.resolveConfig(cfg) };
  assert.match(guard({ versions: { [NAME]: ["0.4.0"], "demo-b": [] } }, fx).reason, /versions differ/);
  const bad = { ...two, config: config.resolveConfig({ ...cfg, policies: { release: { ...cfg.policies.release, packages: ["../x"] } } }) };
  assert.match(guard({}, bad).reason, /not a folder inside the project/);
});

/** The state after --prepare: version 0.5.0 everywhere, CHANGELOG renamed, optionally the log entry, the release commit pushed. */
function released(withLog) {
  const f = fixture();
  write(f.root, "package.json", { name: NAME, version: "0.5.0" });
  write(f.root, "VERSION", "0.5.0\n");
  write(f.root, "CHANGELOG.md", `# Changelog\n\n## Unreleased\n\n## 0.5.0 — 2026-02-03\n\n${ADDED}\n## 0.4.0 — 2026-01-01\n`);
  if (withLog) write(f.root, "docs/plan/releases.md", `# Releases\n\n${rel.releaseLogLine({ version: "0.5.0", date: "2026-02-03", mid: "M1", head: f.head, from: "0.4.0", bump: "minor", reason: "Added" })}\n`);
  pushAll(f.root, "chore(release): v0.5.0 (M1)");
  return { ...f, sha: git(f.root, "rev-parse", "HEAD") };
}
const jobs = (...c) => c.map((conclusion, i) => ({ name: `job${i}`, status: "completed", conclusion }));
const ghFor = (sha, list, view) => (args) => {
  if (args[0] === "run" && args[1] === "list") return args[args.indexOf("--commit") + 1] === sha && args.includes("ci.yml") ? { code: 0, out: JSON.stringify(list), err: "" } : { code: 1, out: "", err: "wrong query" };
  return { code: 0, out: JSON.stringify({ status: "completed", conclusion: "success", jobs: view }), err: "" };
};
const RUNS = [{ databaseId: 77, status: "completed", conclusion: "success" }];

test("REL-AC-04 the tag step: G-ci refuses a skipped job, a missing run and a missing gh; G-log needs the entry", () => {
  const f = released(false);
  const guards = (gh) => byId(rel.releaseGuards(ctxOf(f, { versions: { [NAME]: ["0.4.0"] }, gh }), "M1", { step: "tag" }));
  const skipped = guards(ghFor(f.sha, RUNS, jobs("success", "skipped")));
  assert.equal(skipped["G-ci"].ok, false);
  assert.match(skipped["G-ci"].reason, /job1/);
  assert.equal(guards(undefined)["G-ci"].ok, false, "gh missing fails the guard");
  assert.equal(guards(ghFor(f.sha, [], []))["G-ci"].ok, false, "no run of the workflow for HEAD");
  assert.equal(skipped["G-log"].ok, false);
  assert.match(skipped["G-log"].reason, /docs\/plan\/releases\.md/);
});

test("REL-AC-04 the tag step: with a green run, the log entry and the release commit every guard passes; another commit on top does not", () => {
  const f = released(true);
  const guards = () => byId(rel.releaseGuards(ctxOf(f, { versions: { [NAME]: ["0.4.0"] }, gh: ghFor(f.sha, RUNS, jobs("success", "success")) }), "M1", { step: "tag" }));
  const all = guards();
  for (const id of ["G-switch", "G-branch", "G-milestone", "G-version", "G-ci", "G-log"]) assert.equal(all[id].ok, true, `${id}: ${all[id].reason}`);
  assert.equal(rel.chooseStep(ctxOf(f), "M1"), "tag", "a release commit at HEAD means the next step is the tag");
  write(f.root, "docs/plan/y.md", "y\n");
  pushAll(f.root, "another commit");
  assert.match(guards()["G-branch"].reason, /not the release commit/);
});

test("REL-AC-04 usage: no milestone, an unknown option or a bad id exit 2; --prepare and --tag say they are not built yet and exit 2", () => {
  const f = fixture();
  for (const args of [[], ["--bogus", "M1"], ["nope"], ["M1", "M2"]]) assert.equal(cli(f.root, ...args).status, 2, args.join(" "));
  for (const flag of ["--prepare", "--tag"]) {
    const r = cli(f.root, "M1", flag);
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /not built yet \(T-M3-10\)/);
  }
  assert.deepEqual(snapshot(f.root, [".git"]).filter((x) => x.startsWith(".saf")), [], "nothing was written");
});
