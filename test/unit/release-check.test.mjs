import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, commitAll, git, gitRepo, lib, tmp, write } from "../helpers.mjs";
import { POLICY, checkWorkflow, isPublished, killSwitch, makeContext, releaseGuards } from "../../scripts/release-check.mjs";

const { commandRunner } = await lib("release.mjs");
after(() => import("../helpers.mjs").then((h) => h.cleanup()));

const SCRIPT = join(REPO, "scripts", "release-check.mjs");
const WORKFLOW = readFileSync(join(REPO, ".github", "workflows", "release.yml"), "utf8").replace(/\r\n/g, "\n");
const CI = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8").replace(/\r\n/g, "\n");
const PACKAGES = [".", "packages/create-saf"];
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: "utf8" });
const failed = (results) => results.filter(([ok]) => !ok).map(([, label]) => label);

// ── REL-AC-08 · release-check workflow ───────────────────────────────────────

/** `text` with the first `from` replaced (the test fails if `from` is not there, so a renamed line cannot hide a mutation). */
function mutate(text, from, to) {
  assert.ok(text.includes(from), `the workflow has: ${from}`);
  return text.replace(from, to);
}

test("REL-AC-08 the real release.yml passes every rule, in the script and from the command line", () => {
  const results = checkWorkflow(WORKFLOW, { packages: PACKAGES });
  assert.deepEqual(failed(results), []);
  assert.ok(results.length >= 12);
  const r = cli("workflow");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!/✗/.test(r.stdout));
});

test("REL-AC-08 a workflow checked out with CRLF line endings passes too", () => {
  assert.deepEqual(failed(checkWorkflow(WORKFLOW.replace(/\n/g, "\r\n"), { packages: PACKAGES })), []);
});

const MUTATIONS = [
  ["a token reference (NODE_AUTH_TOKEN from a secret)", (w) => mutate(w, "      GH_REPO:", "      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n      GH_REPO:"), /no npm token/],
  ["any secrets reference", (w) => mutate(w, "      GH_REPO:", "      OTHER: ${{ secrets.OTHER }}\n      GH_REPO:"), /no npm token/],
  ["a missing id-token: write", (w) => mutate(w, "      id-token: write\n", ""), /job asks for/],
  ["id-token: write at the top level", (w) => mutate(w, "permissions:\n  contents: read\n", "permissions:\n  contents: read\n  id-token: write\n"), /top-level permissions/],
  ["contents: write at the top level", (w) => mutate(w, "permissions:\n  contents: read\n", "permissions:\n  contents: write\n"), /top-level permissions/],
  ["a branch trigger instead of tags", (w) => mutate(w, 'tags: ["v*"]', "branches: [main]"), /runs only when/],
  ["a second trigger (workflow_dispatch)", (w) => mutate(w, "on:\n  push:", "on:\n  workflow_dispatch:\n  push:"), /runs only when/],
  ["a tag pattern that is not v*", (w) => mutate(w, '["v*"]', '["*"]'), /runs only when/],
  ["pull_request_target", (w) => mutate(w, "on:\n  push:", "on:\n  pull_request_target:\n  push:"), /pull_request_target|runs only when/],
  ["a missing guards step", (w) => mutate(w, 'run: node scripts/release-check.mjs guards "$TAG"', "run: echo skipped"), /guards step/],
  ["a guards step that may fail", (w) => mutate(w, "      - name: Check every guard again\n", "      - name: Check every guard again\n        continue-on-error: true\n"), /guards step/],
  ["the guards step moved after the publish steps", (w) => `${mutate(w, 'run: node scripts/release-check.mjs guards "$TAG"', "run: echo skipped")}      - run: node scripts/release-check.mjs guards "$TAG"\n`, /comes before the guards step/],
  ["an event value inside a script", (w) => mutate(w, 'guards "$TAG"', 'guards "${{ github.ref_name }}"'), /inside its script/],
  ["an expression that is not on the list", (w) => mutate(w, "      GH_REPO:", "      WHO: ${{ github.event.head_commit.message }}\n      GH_REPO:"), /not allowed/],
  ["a third-party action", (w) => mutate(w, "actions/setup-node@v4", "someone/setup-node@v4"), /first-party/],
  ["an action on a branch", (w) => mutate(w, "actions/checkout@v4", "actions/checkout@main"), /first-party/],
  ["an old Node", (w) => mutate(w, '"22.14.0"', '"20"'), /Node >=/],
  ["an old npm", (w) => mutate(w, "npm@11.5.1", "npm@10.9.0"), /Node >=/],
  ["a missing docs link", (w) => mutate(w, "https://docs.npmjs.com/trusted-publishers", "https://example.invalid"), /Node >=/],
  ["a publish without provenance", (w) => mutate(w, "npm publish . --provenance", "npm publish ."), /published with provenance/],
  ["a publish without the kill-switch check before it", (w) => mutate(w, "node scripts/release-check.mjs switch\n          status=0\n          node scripts/release-check.mjs published . ", "status=0\n          node scripts/release-check.mjs published . "), /published with provenance/],
  ["a publish that is not skipped when the version is on npm", (w) => mutate(w, ' "$VERSION" || status=$?\n          case "$status" in\n            0) echo "super-agent-framework', ' "$VERSION"\n          case "$status" in\n            0) echo "super-agent-framework'), /published with provenance/],
  ["a publish without the wait for the registry", (w) => mutate(w, ' "$VERSION" --wait\n      - name: Publish create-saf', ' "$VERSION"\n      - name: Publish create-saf'), /published with provenance/],
  ["a force flag", (w) => mutate(w, "npm publish . --provenance", "npm publish . --provenance --force"), /force/],
  ["a missing environment", (w) => mutate(w, "    environment: npm\n", ""), /environment/],
  ["a self-hosted runner", (w) => mutate(w, "runs-on: ubuntu-latest", "runs-on: self-hosted"), /GitHub-hosted/],
  ["a missing tag validation", (w) => mutate(w, "[[ \"$TAG\" =~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$ ]]", "true"), /tag name is validated/],
  ["git credentials kept by checkout", (w) => mutate(w, "persist-credentials: false", "persist-credentials: true"), /keeps no git credentials/],
  ["no GitHub release step", (w) => mutate(w, 'gh release create "$TAG" --verify-tag', 'gh release create "$TAG"'), /GitHub release comes after/],
];
for (const [name, edit, label] of MUTATIONS) {
  test(`REL-AC-08 fails for ${name}`, () => {
    const bad = failed(checkWorkflow(edit(WORKFLOW), { packages: PACKAGES }));
    assert.ok(bad.length >= 1 && bad.some((l) => label.test(l)), `a failed rule matches ${label}: ${bad.join(" | ")}`);
  });
}

test("REL-AC-08 fails when the publish order differs from policies.release.packages, and for unreadable text", () => {
  assert.ok(failed(checkWorkflow(WORKFLOW, { packages: [...PACKAGES].reverse() })).some((l) => /published with provenance/.test(l)));
  assert.ok(failed(checkWorkflow("name: x\njobs:\n  a: [unclosed", { packages: PACKAGES })).length >= 1);
});

test("REL-AC-08 the command line fails for a mutated copy of the file and for a missing file, and the old checks keep their names", () => {
  const dir = tmp("saf-rel-wf-");
  write(dir, "release.yml", mutate(WORKFLOW, "      id-token: write\n", ""));
  const bad = cli("workflow", join(dir, "release.yml"));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✗ the job asks for contents: write and id-token: write/);
  assert.equal(cli("workflow", join(dir, "absent.yml")).status, 1);
  const usage = cli("bogus");
  assert.equal(usage.status, 2);
  for (const name of ["npm", "tag", "release", "social", "guards", "workflow"]) assert.ok(usage.stderr.includes(name), `usage lists ${name}`);
});

test("REL-AC-08 the release workflow never names a token or secret (the card's own check, on the file)", () => {
  assert.ok(!/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.[A-Z_]*NPM/i.test(WORKFLOW));
  assert.ok(/id-token:\s*write/.test(WORKFLOW));
});

// ── REL-AC-09 · release-check guards ─────────────────────────────────────────

const OS = ["ubuntu-latest", "macos-latest", "windows-latest"];
const ENTRY = "- v0.5.0 · 2026-02-01 · M1 · gate abc1234 · from v0.4.0 · bump minor (Added)\n";
const CHANGELOG = (section = "### Added\n\n- a thing\n") => `# Changelog\n\n## Unreleased\n\n## 0.5.0 — 2026-02-01\n\n${section}\n## 0.4.0 — 2026-01-01\n\n### Added\n\n- first\n`;
const jobs = (os = OS, conclusion = "success") => os.flatMap((o) => [20, 22].map((n) => ({ name: `test (${o} · node ${n})`, status: "completed", conclusion })));

/** A project at its release commit with a bare origin, an annotated tag v0.5.0 and the files the guards read. `o` varies one thing. */
function fixture(o = {}) {
  const remote = tmp("saf-relc-remote-");
  git(remote, "init", "--bare", "-q");
  const root = gitRepo();
  const cfg = { version: 1, stack: { packageManager: "none" }, policies: { release: { auto: o.auto ?? "on", packages: [".", "packages/b"], versionFiles: ["VERSION"] } } };
  write(root, "saf.config.json", cfg);
  write(root, "package.json", { name: "demo-a", version: o.aVersion ?? "0.5.0" });
  write(root, "packages/b/package.json", { name: "demo-b", version: o.bVersion ?? "0.5.0" });
  write(root, "VERSION", o.versionFile ?? "0.5.0\n");
  write(root, "CHANGELOG.md", o.changelog ?? CHANGELOG());
  write(root, "docs/plan/releases.md", o.log ?? `# Releases\n\n${ENTRY}`);
  write(root, ".github/workflows/ci.yml", o.ci ?? CI);
  if (o.pushBase !== false) {
    commitAll(root, "base");
    git(root, "remote", "add", "origin", remote);
    git(root, "push", "-q", "-u", "origin", "main");
    write(root, "docs/plan/note.md", "release\n");
  }
  commitAll(root, o.subject ?? "chore(release): v0.5.0 (M1)");
  if (o.pushBase === false) {
    git(root, "remote", "add", "origin", remote);
    git(root, "push", "-q", "-u", "origin", "main");
  } else if (o.push !== false) git(root, "push", "-q", "origin", "main");
  git(root, "tag", "-a", "v0.5.0", "-m", "v0.5.0");
  if (o.originOff) {
    write(root, "saf.config.json", { ...cfg, policies: { release: { ...cfg.policies.release, auto: "off" } } });
    commitAll(root, "turn the switch off");
    git(root, "push", "-q", "origin", "main");
    git(root, "reset", "-q", "--hard", "HEAD~1");
  }
  if (o.later) commitAll(root, "later work");
  return { root, remote };
}

/** A runner: git is real (a temp repo), gh and npm are fakes; every call is recorded. */
function runner(root, { gh, npm } = {}) {
  const real = commandRunner(root);
  const calls = [];
  const ok = (out) => ({ code: 0, out: typeof out === "string" ? out : JSON.stringify(out), err: "" });
  const green = (args) => (args[1] === "list" ? ok([{ databaseId: 7, status: "completed", conclusion: "success" }, { databaseId: 6, status: "completed", conclusion: "failure" }]) : ok({ jobs: jobs() }));
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === "gh") return (gh ?? green)(args);
    if (cmd === "npm") return (npm ?? (() => ok("")))(args);
    assert.equal(cmd, "git", "only git, gh and npm are started");
    return real(cmd, args);
  };
  run.calls = calls;
  return run;
}
const guardsOf = (root, tag = "v0.5.0", fakes = {}) => {
  const run = runner(root, fakes);
  return { guards: Object.fromEntries(releaseGuards(makeContext(root, run), tag).map((g) => [g.id, g])), run };
};
const ciWith = (list, over = {}) => (args) => (args[1] === "list" ? { code: 0, out: JSON.stringify([{ databaseId: 9, status: "completed", conclusion: "success", ...over }]), err: "" } : { code: 0, out: JSON.stringify({ jobs: list }), err: "" });

test("REL-AC-09 a consistent fixture passes every guard, asks gh about the exact commit, and writes nothing", () => {
  const { root } = fixture();
  const before = git(root, "status", "--porcelain");
  const { guards, run } = guardsOf(root);
  assert.deepEqual(Object.keys(guards), ["G-tag", "G-versions", "G-commit", "G-changelog", "G-ci", "G-switch"]);
  for (const g of Object.values(guards)) assert.ok(g.ok, `${g.id}: ${g.reason}`);
  const head = git(root, "rev-parse", "HEAD");
  assert.ok(run.calls.some((c) => c[0] === "gh" && c.includes("--commit") && c.includes(head)));
  assert.equal(git(root, "status", "--porcelain"), before);
  assert.ok(!run.calls.some((c) => c[0] === "git" && ["push", "tag", "commit", "reset"].includes(c[1])), "git only reads");
});

test("REL-AC-09 a tag that differs from a package version or the version file fails G-versions naming it", () => {
  assert.match(guardsOf(fixture().root, "v0.6.0").guards["G-versions"].reason, /demo-a is 0\.5\.0, the tag says 0\.6\.0/);
  const b = guardsOf(fixture({ bVersion: "0.5.1" }).root).guards;
  assert.equal(b["G-versions"].ok, false);
  assert.match(b["G-versions"].reason, /demo-b is 0\.5\.1/);
  assert.match(guardsOf(fixture({ versionFile: "0.4.0\n" }).root).guards["G-versions"].reason, /VERSION does not hold 0\.5\.0/);
});

test("REL-AC-09 a tag that is not a plain release tag stops at G-tag and starts no command", () => {
  const { root } = fixture();
  for (const bad of ["v1.2", "V0.5.0", "v0.5.0-rc.1", "v0.5.0; rm -rf /", "$(id)", "v0.5.0\nv0.5.1", "", undefined]) {
    const run = runner(root);
    const guards = releaseGuards(makeContext(root, run), bad);
    assert.deepEqual(guards.map((g) => [g.id, g.ok]), [["G-tag", false]]);
    assert.equal(run.calls.length, 0);
  }
});

test("REL-AC-09 a missing CHANGELOG section fails G-changelog, a section that implies another version too", () => {
  assert.match(guardsOf(fixture({ changelog: "# Changelog\n\n## Unreleased\n\n## 0.4.0 — 2026-01-01\n\n### Added\n\n- first\n" }).root).guards["G-changelog"].reason, /no filled "## 0\.5\.0" section/);
  assert.match(guardsOf(fixture({ changelog: CHANGELOG("### Fixed\n\n- a bug\n") }).root).guards["G-changelog"].reason, /implies v0\.4\.1 after v0\.4\.0/);
});

test("REL-AC-09 the release log entry, the commit subject, the tag commit and the branch are checked by G-commit", () => {
  assert.match(guardsOf(fixture({ log: "# Releases\n" }).root).guards["G-commit"].reason, /no entry for v0\.5\.0/);
  assert.match(guardsOf(fixture({ subject: "feat: sneaky" }).root).guards["G-commit"].reason, /subject is not "chore\(release\): v0\.5\.0 \(M1\)"/);
  assert.match(guardsOf(fixture({ later: true }).root).guards["G-commit"].reason, /not the commit of v0\.5\.0/);
  assert.match(guardsOf(fixture({ push: false, pushBase: true }).root).guards["G-commit"].reason, /not on origin\/main/);
  assert.match(guardsOf(fixture().root, "v0.5.1").guards["G-commit"].reason, /not the commit of v0\.5\.1/);
});

test("REL-AC-09 auto off on origin/main fails G-switch with the reason (even when it is on in the checkout), and an unreachable origin fails it", () => {
  const { root } = fixture({ originOff: true });
  assert.equal(JSON.parse(readFileSync(join(root, "saf.config.json"), "utf8")).policies.release.auto, "on");
  const { guards } = guardsOf(root);
  assert.equal(guards["G-switch"].ok, false);
  assert.match(guards["G-switch"].reason, /policies\.release\.auto is "off" on origin\/main/);
  assert.equal(killSwitch(makeContext(root, runner(root)))[0].ok, false);
  git(root, "remote", "set-url", "origin", join(root, "no-such-remote"));
  assert.match(guardsOf(root).guards["G-switch"].reason, /fetch of origin\/main failed/);
  assert.equal(killSwitch(makeContext(fixture().root, runner(fixture().root)))[0].ok, true);
});

test("REL-AC-09 a CI run without a windows job, a skipped job, a failed run, no run, gh failing: each fails G-ci with the reason", () => {
  const { root } = fixture();
  const noWindows = guardsOf(root, "v0.5.0", { gh: ciWith(jobs(OS.slice(0, 2))) }).guards["G-ci"];
  assert.equal(noWindows.ok, false);
  assert.match(noWindows.reason, /no job for windows-latest/);
  assert.match(guardsOf(root, "v0.5.0", { gh: ciWith([...jobs(), { name: "extra", status: "completed", conclusion: "skipped" }]) }).guards["G-ci"].reason, /job extra is skipped/);
  assert.match(guardsOf(root, "v0.5.0", { gh: ciWith(jobs(), { conclusion: "failure" }) }).guards["G-ci"].reason, /not completed\/success/);
  assert.match(guardsOf(root, "v0.5.0", { gh: ciWith(jobs(), { status: "in_progress", conclusion: "" }) }).guards["G-ci"].reason, /in_progress/);
  assert.match(guardsOf(root, "v0.5.0", { gh: () => ({ code: 0, out: "[]", err: "" }) }).guards["G-ci"].reason, /no run of ci\.yml/);
  assert.match(guardsOf(root, "v0.5.0", { gh: () => ({ code: 1, out: "", err: "gh: not logged in" }) }).guards["G-ci"].reason, /gh failed \(gh: not logged in\)/);
  assert.match(guardsOf(root, "v0.5.0", { gh: ciWith([]) }).guards["G-ci"].reason, /lists no jobs/);
});

test("REL-AC-09 the operating systems come from the CI workflow's matrix, and a CI file that cannot be read fails G-ci", () => {
  const withBsd = fixture({ ci: CI.replace("windows-latest]", "windows-latest, freebsd-latest]") });
  assert.match(guardsOf(withBsd.root).guards["G-ci"].reason, /no job for freebsd-latest/);
  assert.match(guardsOf(fixture({ ci: "name: ci\njobs:\n  a:\n    runs-on: x\n" }).root).guards["G-ci"].reason, /has no os matrix/);
});

test("REL-AC-09 published: yes, no, a folder that is not released, a bad version, and the bounded wait", async () => {
  const { root } = fixture();
  const ctx = (npm) => makeContext(root, runner(root, { npm }));
  const there = (args) => ({ code: 0, out: args[1].endsWith("@0.5.0") ? "0.5.0\n" : "", err: "" });
  assert.deepEqual(await isPublished(ctx(there), ".", "0.5.0"), { name: "demo-a", published: true });
  assert.deepEqual(await isPublished(ctx(there), "packages/b", "0.5.1"), { name: "demo-b", published: false });
  assert.match((await isPublished(ctx(there), "src", "0.5.0")).error, /not one of policies\.release\.packages/);
  assert.match((await isPublished(ctx(there), "../x", "0.5.0")).error, /not one of/);
  assert.match((await isPublished(ctx(there), ".", "0.5.0; id")).error, /not an x\.y\.z version/);
  let tries = 0;
  const waits = [];
  const late = (args) => ({ code: 0, out: ++tries === 4 ? "0.5.0" : "", err: "" });
  assert.equal((await isPublished(ctx(late), ".", "0.5.0", { wait: true, sleep: async (ms) => waits.push(ms) })).published, true);
  assert.deepEqual(waits, [POLICY.wait.delayMs, POLICY.wait.delayMs, POLICY.wait.delayMs]);
  let never = 0;
  const slept = [];
  const r = await isPublished(ctx(() => ({ code: 1, out: "", err: `E404 ${++never}` })), ".", "0.5.0", { wait: true, sleep: async (ms) => slept.push(ms) });
  assert.equal(r.published, false);
  assert.equal(never, POLICY.wait.tries);
  assert.equal(slept.length, POLICY.wait.tries - 1);
});

test("REL-AC-09 the command line: notes for a tag with no CHANGELOG section fails, the tag is validated, unknown arguments are a usage error", () => {
  const none = cli("notes", "v9.9.9");
  assert.equal(none.status, 1);
  assert.match(none.stdout, /✗ CHANGELOG\.md has no filled section for v9\.9\.9/);
  assert.equal(cli("notes", "v1.0.0; id").status, 1);
  assert.equal(cli("guards", "not-a-tag").status, 1);
  assert.equal(cli("published", "src", "0.1.0").status, 1);
});
