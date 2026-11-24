import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, commitAll, git, gitRepo, lib, tmp, write, card, milestone } from "../helpers.mjs";

const rel = await lib("release.mjs");
const config = await lib("config.mjs");
after(cleanup);

// Every test works in temp git repos with a BARE temp remote; the registry and `gh` are fakes. Nothing here can reach this
// repository's remote, a real tag, npm or GitHub.
const BIN = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, "task", "release", ...args], { cwd, encoding: "utf8" });
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_NOT_NL = /[\u0000-\u0009\u000b-\u001f\u007f]/; // a file or a commit message may have line ends
const ADDED = "### Added\n\n- a thing\n";
const changelog = (unreleased) => `# Changelog\n\n## Unreleased\n\n${unreleased}\n## 0.4.0 — 2026-01-01\n\n### Added\n\n- first\n`;
const PKG_B = '{\r\n    "name": "demo-b",\r\n    "version": "0.4.0",\r\n    "dependencies": {\r\n        "demo-pkg": "0.4.0",\r\n        "other": "^1.0.0"\r\n    }\r\n}\r\n';
const read = (root, file) => readFileSync(join(root, file), "utf8");
const byId = (guards) => Object.fromEntries(guards.map((g) => [g.id, g]));

/** A project with a bare remote: two released packages (the second depends on the first), a version file, M1 closed. */
function fixture({ auto = "on", unreleased = ADDED, protectedBranches } = {}) {
  const remote = tmp("saf-run-remote-");
  git(remote, "init", "--bare", "-q");
  const root = gitRepo();
  const raw = { version: 1, stack: { packageManager: "none" }, policies: { release: { auto, packages: [".", "pkg/b"], versionFiles: ["VERSION"] }, ...(protectedBranches ? { protectedBranches } : {}) } };
  write(root, "saf.config.json", raw);
  write(root, "package.json", { name: "demo-pkg", version: "0.4.0", description: "x" });
  write(root, "pkg/b/package.json", PKG_B);
  write(root, "VERSION", "0.4.0\n");
  write(root, "CHANGELOG.md", changelog(unreleased));
  write(root, "src/code.js", "export {};\n");
  write(root, "docs/plan/milestones/M1.md", milestone({ id: "M1", status: "done", cards: ["T-M1-01"] }));
  write(root, "docs/plan/tasks/M1/T-M1-01.md", card({ id: "T-M1-01" }));
  write(root, "docs/plan/evidence/T-M1-01.json", { id: "T-M1-01", status: "done" });
  const head = commitAll(root, "work");
  write(root, "docs/plan/evidence/M1.json", { id: "M1", kind: "milestone", verified: { head, gates: [{ id: "cards", pass: true }] } });
  commitAll(root, "close M1");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "-u", "origin", "main");
  return { root, remote, head, raw, config: config.resolveConfig(raw) };
}

const verbOf = (args) => args.find((a) => !a.startsWith("-"));
/** Real git; fake registry and `gh`; `intercept(cmd, args)` may answer a call itself. `run.calls` records every call. */
function runner(root, { gh, intercept } = {}) {
  const real = rel.commandRunner(root);
  const run = (cmd, args) => {
    run.calls.push([cmd, ...args]);
    const own = intercept?.(cmd, args);
    if (own) return own;
    if (cmd === "npm") return args[0] === "view" && ["demo-pkg", "demo-b"].includes(args[1]) ? { code: 0, out: JSON.stringify(["0.3.0", "0.4.0"]), err: "" } : { code: 1, out: "", err: "npm error code E404" };
    if (cmd === "gh") return gh ? gh(args) : { code: 127, out: "", err: "gh: not found" };
    return real(cmd, args);
  };
  run.calls = [];
  return run;
}
const ctxOf = (f, opts) => ({ root: f.root, config: f.config, run: runner(f.root, opts), now: () => new Date("2026-02-03T10:00:00Z") });
const run = (fn, ctx, mid = "M1") => {
  const l = [];
  return { code: fn(ctx, mid, { out: (s) => l.push(s) }), text: l.join("\n"), lines: l };
};

const gitCalls = (calls) => calls.filter(([c]) => c === "git").map(([, ...a]) => a);
const writeCalls = (calls) => gitCalls(calls).filter((a) => ["add", "commit", "push", "reset"].includes(verbOf(a)) || (verbOf(a) === "tag" && !a.includes("--list")));
const pushes = (calls) => gitCalls(calls).filter((a) => verbOf(a) === "push");
const remoteRefs = (remote) => git(remote, "for-each-ref", "--format=%(refname) %(objectname)");
const head = (root) => git(root, "rev-parse", "HEAD");
const FILES = ["package\\.json", "pkg\\/b\\/package\\.json", "VERSION", "CHANGELOG\\.md", "docs\\/plan\\/releases\\.md"].join("|");

/** The only git calls --prepare and --tag may make: the dry run's reads plus these writes, one ref per push. */
const BRANCH = "[A-Za-z0-9][A-Za-z0-9._/-]*";
const SHA = "[0-9a-f]{40,64}";
const ALLOWED = [
  new RegExp(`^fetch --quiet origin refs/heads/${BRANCH}$`), /^rev-parse FETCH_HEAD\^\{commit\}$/, /^--no-optional-locks status --porcelain$/,
  /^rev-parse (--abbrev-ref HEAD|HEAD|HEAD\^)$/, new RegExp(`^show (HEAD|${SHA}):saf\\.config\\.json$`),
  /^diff --name-only --no-renames -z [0-9a-f]{7,64} HEAD --$/, /^log -1 --format=%s HEAD$/,
  /^tag --list v\d+\.\d+\.\d+$/, /^ls-remote --tags origin refs\/tags\/v\d+\.\d+\.\d+$/, new RegExp(`^ls-remote origin refs/heads/${BRANCH}$`),
  new RegExp(`^--literal-pathspecs add -- (${FILES})( (${FILES}))*$`),
  new RegExp(`^--literal-pathspecs commit -q -m chore\\(release\\): v\\d+\\.\\d+\\.\\d+ \\(M\\d+\\) -- (${FILES})( (${FILES}))*$`),
  new RegExp(`^--literal-pathspecs reset -q -- (${FILES})( (${FILES}))*$`),
  new RegExp(`^push --no-follow-tags origin ${SHA}:refs/heads/${BRANCH}$`),
  /^cat-file -t refs\/tags\/v\d+\.\d+\.\d+$/, /^rev-parse refs\/tags\/v\d+\.\d+\.\d+\^\{commit\}$/,
  new RegExp(`^tag -a v\\d+\\.\\d+\\.\\d+ --cleanup=whitespace -m [\\s\\S]+ ${SHA}$`),
  /^push --no-follow-tags origin refs\/tags\/v\d+\.\d+\.\d+$/,
  /^ls-remote --tags origin refs\/tags\/v(\d+\.\d+\.\d+) refs\/tags\/v\1\^\{\}$/,
];
const offenders = (calls) => gitCalls(calls).filter((a) => !ALLOWED.some((re) => re.test(a.join(" "))));

/** What a --prepare leaves behind: the files, the commit, the remote. */
function prepared(opts) {
  const f = fixture(opts);
  const ctx = ctxOf(f);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 0, r.text);
  return { ...f, sha: head(f.root), prep: r };
}
const ghFor = (sha, jobs) => (args) => {
  if (args[1] === "list") return { code: 0, out: JSON.stringify([{ databaseId: 77, status: "completed", conclusion: "success", headSha: sha }]), err: "" };
  return { code: 0, out: JSON.stringify({ status: "completed", conclusion: "success", headSha: sha, jobs: jobs.map((conclusion, i) => ({ name: `job${i}`, status: "completed", conclusion })) }), err: "" };
};
const tagCtx = (f, jobs, opts = {}) => ctxOf(f, { gh: ghFor(f.sha, jobs), ...opts });

// ── REL-AC-05 --prepare ──────────────────────────────────────────────────────

test("REL-AC-05 --prepare bumps every package, the dependency and the version file, moves Unreleased, writes one log line, commits exactly those files and pushes one ref without force", () => {
  const f = fixture();
  const ctx = ctxOf(f);
  const before = head(f.root);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(JSON.parse(read(f.root, "package.json")), { name: "demo-pkg", version: "0.5.0", description: "x" });
  assert.equal(read(f.root, "VERSION"), "0.5.0\n");
  // the second package keeps its CRLF and 4-space indent; only the version and the dependency on the first package change
  assert.equal(read(f.root, "pkg/b/package.json"), PKG_B.replace('"version": "0.4.0"', '"version": "0.5.0"').replace('"demo-pkg": "0.4.0"', '"demo-pkg": "0.5.0"'));
  assert.equal(read(f.root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.5.0 — 2026-02-03\n\n### Added\n\n- a thing\n\n## 0.4.0 — 2026-01-01\n\n### Added\n\n- first\n");
  const log = read(f.root, "docs/plan/releases.md");
  const entries = rel.readReleaseLog(log);
  assert.equal(entries.length, 1, log);
  assert.deepEqual(entries[0], { version: "0.5.0", date: "2026-02-03", mid: "M1", head: f.head.slice(0, 7), from: "0.4.0", bump: "minor", reason: "Added" });
  assert.equal(git(f.root, "rev-list", "--count", `${before}..HEAD`), "1", "one commit");
  assert.equal(git(f.root, "log", "-1", "--format=%s"), "chore(release): v0.5.0 (M1)");
  assert.deepEqual(git(f.root, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["CHANGELOG.md", "VERSION", "docs/plan/releases.md", "package.json", "pkg/b/package.json"]);
  assert.equal(git(f.root, "status", "--porcelain"), "", "nothing else is left dirty");
  assert.equal(git(f.remote, "rev-parse", "main"), head(f.root), "the release commit is on the remote");
  assert.deepEqual(pushes(ctx.run.calls), [["push", "--no-follow-tags", "origin", `${head(f.root)}:refs/heads/main`]], "exactly one ref (the release commit), no force");
  assert.deepEqual(offenders(ctx.run.calls), []);
  assert.doesNotMatch(JSON.stringify(ctx.run.calls), /--force|"-f"|--delete|--mirror|\+refs/);
});

test("REL-AC-05 --prepare prints each git command before running it; nothing printed, written or committed holds a control character", () => {
  const f = fixture({ unreleased: "### Added\u001b[31m\n\n- a thing\n" });
  const ctx = ctxOf(f);
  const order = [];
  const real = ctx.run;
  ctx.run = (cmd, args) => {
    if (cmd === "git" && ["add", "commit", "push"].includes(verbOf(args))) order.push(`call ${verbOf(args)}`);
    return real(cmd, args);
  };
  const l = [];
  const code = rel.prepareRelease(ctx, "M1", { out: (s) => (order.push(`print ${s}`), l.push(s)) });
  assert.equal(code, 0, l.join("\n"));
  for (const verb of ["add", "commit", "push"]) {
    const call = order.indexOf(`call ${verb}`);
    const shown = order.findIndex((x) => x.startsWith("print") && new RegExp(`git .*\\b${verb}\\b`).test(x));
    assert.ok(shown >= 0 && shown < call, `${verb} is printed before it runs: ${order.join(" | ")}`);
  }
  assert.ok(l.some((x) => /^✓ G-version/.test(x)), "the guard list is printed");
  for (const x of l) assert.doesNotMatch(x, CONTROL, JSON.stringify(x));
  assert.doesNotMatch(read(f.root, "docs/plan/releases.md"), CONTROL_NOT_NL);
  assert.doesNotMatch(git(f.root, "log", "-1", "--format=%B"), CONTROL_NOT_NL);
  assert.equal(rel.readReleaseLog(read(f.root, "docs/plan/releases.md"))[0].reason, "Added [31m", "the cleaned reason is what the log keeps");
});

test("REL-AC-05 a failing guard writes nothing and makes no write call: auto off, a dirty worktree, an empty Unreleased", () => {
  for (const make of [() => fixture({ auto: "off" }), () => fixture({ unreleased: "" }), () => { const f = fixture(); write(f.root, "stray.txt", "x\n"); return f; }]) {
    const f = make();
    const ctx = ctxOf(f);
    const snap = () => ({ head: head(f.root), remote: remoteRefs(f.remote), pkg: read(f.root, "package.json"), status: git(f.root, "status", "--porcelain") });
    const before = snap();
    const r = run(rel.prepareRelease, ctx);
    assert.equal(r.code, 1, r.text);
    assert.match(r.text, /✗ /);
    assert.deepEqual(writeCalls(ctx.run.calls), [], "no write call at all");
    assert.deepEqual(snap(), before);
  }
});

test("REL-AC-05 a rejected push keeps the local commit and exits 1 with the reason; running --prepare again changes nothing and says why", () => {
  const f = fixture();
  const other = tmp("saf-run-other-");
  git(other, "clone", "-q", f.remote, ".");
  let raced = false;
  const ctx = ctxOf(f, {
    intercept: (cmd, args) => {
      if (cmd === "git" && verbOf(args) === "push" && !raced) {
        raced = true;
        write(other, "docs/plan/x.md", "x\n");
        commitAll(other, "someone first");
        git(other, "push", "-q", "origin", "main");
      }
    },
  });
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /push was rejected/);
  assert.match(r.text, /the release commit stays/);
  assert.match(r.text, /reset the local commit, pull, then run --prepare again — or rebase it onto origin and push it yourself, then run --tag/, "advice that works (after a pull the version is already bumped)");
  assert.equal(git(f.root, "log", "-1", "--format=%s"), "chore(release): v0.5.0 (M1)", "the local commit stays");
  assert.notEqual(git(f.remote, "rev-parse", "main"), head(f.root));
  assert.equal(git(f.remote, "log", "-1", "--format=%s", "main"), "someone first", "only the other person's commit is there");
  assert.equal(pushes(ctx.run.calls).length, 1, "no second try, no force");
  const again = ctxOf(f);
  const snap = () => ({ head: head(f.root), files: read(f.root, "CHANGELOG.md"), log: read(f.root, "docs/plan/releases.md") });
  const state = snap();
  const r2 = run(rel.prepareRelease, again);
  assert.equal(r2.code, 1, r2.text);
  assert.match(r2.text, /already the release commit/);
  assert.match(r2.text, /reset the local commit, pull, then run --prepare again — or rebase it onto origin and push it yourself, then run --tag/);
  assert.deepEqual(writeCalls(again.run.calls), []);
  assert.deepEqual(snap(), state);
});

test("REL-AC-05 a second --prepare after a complete one changes nothing", () => {
  const f = prepared();
  const snap = () => ({ head: head(f.root), remote: remoteRefs(f.remote), log: read(f.root, "docs/plan/releases.md") });
  const state = snap();
  const ctx = ctxOf(f);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /already the release commit.*--tag/);
  assert.deepEqual(writeCalls(ctx.run.calls), []);
  assert.deepEqual(snap(), state);
});

test("REL-AC-05 a commit that fails puts every file back, unstages them and pushes nothing", () => {
  const f = fixture();
  const names = ["package.json", "pkg/b/package.json", "VERSION", "CHANGELOG.md"];
  const before = names.map((x) => read(f.root, x));
  const ctx = ctxOf(f, { intercept: (cmd, args) => (cmd === "git" && verbOf(args) === "commit" ? { code: 1, out: "", err: "hook failed: no" } : undefined) });
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /hook failed/);
  assert.deepEqual(names.map((x) => read(f.root, x)), before, "byte-identical again");
  assert.equal(git(f.root, "status", "--porcelain"), "", "no staged change, no created file");
  assert.deepEqual(pushes(ctx.run.calls), []);
  assert.equal(git(f.remote, "rev-parse", "main"), head(f.root));
});

test("REL-AC-05 a version file that does not hold the current version stops --prepare before anything is written", () => {
  const f = fixture();
  write(f.root, "VERSION", "0.3.9\n");
  commitAll(f.root, "stale version file");
  git(f.root, "push", "-q", "origin", "main");
  const ctx = ctxOf(f);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /VERSION .*0\.4\.0/);
  assert.deepEqual(writeCalls(ctx.run.calls), []);
  assert.equal(read(f.root, "package.json").includes("0.5.0"), false);
});

test("REL-AC-05 a stale refs/remotes ref does not fool the guards: the fetched commit is what HEAD and the kill switch are compared with", () => {
  const f = fixture();
  git(f.root, "config", "remote.origin.fetch", "+refs/heads/never:refs/remotes/origin/never"); // a narrowed refspec: a fetch of main does not move refs/remotes/origin/main
  const other = tmp("saf-run-other-");
  git(other, "clone", "-q", f.remote, ".");
  write(other, "docs/plan/x.md", "x\n");
  commitAll(other, "moved on");
  git(other, "push", "-q", "origin", "main");
  assert.equal(git(f.root, "rev-parse", "refs/remotes/origin/main"), head(f.root), "the stale ref still equals HEAD");
  const ctx = ctxOf(f);
  assert.match(byId(rel.releaseGuards(ctx, "M1"))["G-branch"].reason, /HEAD is not origin\/main/);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.deepEqual(writeCalls(ctx.run.calls), []);
  // the switch is read from the fetched commit too
  git(other, "pull", "-q");
  write(other, "saf.config.json", { ...f.raw, policies: { ...f.raw.policies, release: { ...f.raw.policies.release, auto: "off" } } });
  commitAll(other, "switch off");
  git(other, "push", "-q", "origin", "main");
  assert.match(byId(rel.releaseGuards(ctxOf(f), "M1"))["G-switch"].reason, /"off" at origin\/main/);
});

test("REL-AC-05 a branch name that is not a plain branch never reaches git push", () => {
  for (const bad of ["--force", "-f", "a..b", "main:other", "x.lock", "a//b", "main/", "a b", "+main"]) {
    const f = fixture({ protectedBranches: [bad] });
    const ctx = ctxOf(f);
    const r = run(rel.prepareRelease, ctx);
    assert.equal(r.code, 1, `${bad}: ${r.text}`);
    assert.deepEqual(writeCalls(ctx.run.calls), [], bad);
    assert.ok(!gitCalls(ctx.run.calls).some((a) => a.includes(bad)), `${bad} is never given to git`);
  }
});

test("REL-AC-05 usage: --prepare with --tag exits 2 and writes nothing; in a lane worktree --prepare and --tag exit 2", () => {
  const f = fixture();
  const r = cli(f.root, "M1", "--prepare", "--tag");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /give one of --prepare and --tag/);
  write(f.root, ".saf-lane.json", { card: "T-M1-01", lane: 1 });
  for (const flag of ["--prepare", "--tag"]) {
    const l = cli(f.root, "M1", flag);
    assert.equal(l.status, 2, `${flag}: ${l.stdout}${l.stderr}`);
    assert.match(l.stderr, /lane/);
  }
  assert.equal(read(f.root, "package.json").includes("0.5.0"), false);
});

// ── REL-AC-06 --tag ──────────────────────────────────────────────────────────

test("REL-AC-06 --tag is refused while CI has a skipped job (no tag, no push of any kind), then with all jobs green creates the annotated tag and pushes only it", () => {
  const f = prepared();
  const refsBefore = remoteRefs(f.remote);
  const red = tagCtx(f, ["success", "skipped"]);
  const r1 = run(rel.tagRelease, red);
  assert.equal(r1.code, 1, r1.text);
  assert.match(r1.text, /✗ G-ci .*job1/);
  assert.deepEqual(writeCalls(red.run.calls), [], "no tag created and nothing pushed while CI is not green");
  assert.equal(git(f.root, "tag", "--list"), "");
  assert.equal(remoteRefs(f.remote), refsBefore);
  const green = tagCtx(f, ["success", "success"]);
  const r2 = run(rel.tagRelease, green);
  assert.equal(r2.code, 0, r2.text);
  assert.equal(git(f.root, "cat-file", "-t", "refs/tags/v0.5.0"), "tag", "annotated");
  assert.equal(git(f.root, "rev-parse", "refs/tags/v0.5.0^{commit}"), f.sha);
  const message = git(f.root, "cat-file", "-p", "refs/tags/v0.5.0");
  assert.match(message, /## 0\.5\.0 — 2026-02-03/);
  assert.match(message, /### Added\n\n- a thing/);
  assert.doesNotMatch(message, /## 0\.4\.0/, "only this release's section");
  assert.deepEqual(pushes(green.run.calls), [["push", "--no-follow-tags", "origin", "refs/tags/v0.5.0"]]);
  assert.equal(git(f.remote, "tag", "--list"), "v0.5.0", "the remote gained only the tag");
  assert.equal(git(f.remote, "rev-parse", "main"), f.sha, "the branch did not move");
  assert.deepEqual(offenders(green.run.calls), []);
  const [list, view] = green.run.calls.filter((c) => c[0] === "gh");
  assert.deepEqual(list.slice(0, 3), ["gh", "run", "list"]);
  assert.equal(list[list.indexOf("--commit") + 1], f.sha, "asks for the exact commit");
  assert.equal(list[list.indexOf("--json") + 1], "databaseId,status,conclusion,headSha");
  assert.equal(view[view.indexOf("--json") + 1], "status,conclusion,headSha,jobs");
});

test("REL-AC-06 G-ci fails closed: a run for another commit, a missing job list, a cancelled or neutral job", () => {
  const f = prepared();
  const guard = (gh) => byId(rel.releaseGuards(ctxOf(f, { gh }), "M1", { step: "tag" }))["G-ci"];
  const ok = ghFor(f.sha, ["success"]);
  assert.equal(guard(ok).ok, true, guard(ok).reason);
  assert.equal(guard(ghFor("0".repeat(40), ["success"])).ok, false, "the run is for another commit");
  for (const bad of ["cancelled", "neutral", "failure", "skipped", undefined]) assert.equal(guard(ghFor(f.sha, ["success", bad])).ok, false, String(bad));
  assert.equal(guard((args) => (args[1] === "list" ? ok(args) : { code: 0, out: JSON.stringify({ status: "completed", conclusion: "success", headSha: f.sha }), err: "" })).ok, false, "no jobs listed");
});

test("REL-AC-06 a failed tag push is resumed without a second tag; a second --tag after that refuses and changes nothing", () => {
  const f = prepared();
  const failing = tagCtx(f, ["success"], { intercept: (cmd, args) => (cmd === "git" && verbOf(args) === "push" ? { code: 1, out: "", err: "fatal: unable to access 'https://user:hunter2@example.invalid/x.git/'" } : undefined) });
  const r1 = run(rel.tagRelease, failing);
  assert.equal(r1.code, 1, r1.text);
  assert.doesNotMatch(r1.text, /hunter2/, "a password in a URL is hidden");
  assert.equal(git(f.root, "tag", "--list"), "v0.5.0", "the local tag stays (never deleted)");
  assert.equal(git(f.remote, "tag", "--list"), "");
  const tagObject = git(f.root, "rev-parse", "refs/tags/v0.5.0");
  const resume = tagCtx(f, ["success"]);
  const r2 = run(rel.tagRelease, resume);
  assert.equal(r2.code, 0, r2.text);
  assert.equal(gitCalls(resume.run.calls).filter((a) => verbOf(a) === "tag" && !a.includes("--list")).length, 0, "the existing tag is pushed, not made again");
  assert.equal(git(f.root, "rev-parse", "refs/tags/v0.5.0"), tagObject, "the tag object is untouched");
  assert.equal(git(f.remote, "rev-parse", "refs/tags/v0.5.0"), tagObject);
  assert.deepEqual(pushes(resume.run.calls), [["push", "--no-follow-tags", "origin", "refs/tags/v0.5.0"]]);
  const third = tagCtx(f, ["success"]);
  const r3 = run(rel.tagRelease, third);
  assert.equal(r3.code, 1, r3.text);
  assert.match(r3.text, /exists on origin/);
  assert.deepEqual(writeCalls(third.run.calls), []);
});

test("REL-AC-06 --tag refuses when HEAD is not the release commit, when a local tag points elsewhere, when the tag is on origin, or when HEAD moves during the guards", () => {
  const notRelease = prepared();
  write(notRelease.root, "docs/plan/y.md", "y\n");
  commitAll(notRelease.root, "another commit");
  git(notRelease.root, "push", "-q", "origin", "main");
  notRelease.sha = head(notRelease.root);
  const a = tagCtx(notRelease, ["success"]);
  assert.match(run(rel.tagRelease, a).text, /not the release commit/);
  assert.deepEqual(writeCalls(a.run.calls), []);

  const elsewhere = prepared();
  git(elsewhere.root, "tag", "-a", "v0.5.0", "-m", "x", `${elsewhere.sha}~1`);
  const b = tagCtx(elsewhere, ["success"]);
  assert.equal(run(rel.tagRelease, b).code, 1);
  assert.deepEqual(writeCalls(b.run.calls), []);

  const onOrigin = prepared();
  git(onOrigin.root, "tag", "-a", "v0.5.0", "-m", "x");
  git(onOrigin.root, "push", "-q", "origin", "refs/tags/v0.5.0");
  git(onOrigin.root, "tag", "-d", "v0.5.0");
  const c = tagCtx(onOrigin, ["success"]);
  assert.match(run(rel.tagRelease, c).text, /exists on origin/);
  assert.deepEqual(writeCalls(c.run.calls), []);

  const moves = prepared();
  const d = tagCtx(moves, ["success"]);
  let moved = false;
  const ctx = { ...d, run: (cmd, args) => { const r = d.run(cmd, args); if (cmd === "gh" && args[1] === "view" && !moved) { moved = true; write(moves.root, "docs/plan/z.md", "z\n"); commitAll(moves.root, "raced"); } return r; } };
  const r = run(rel.tagRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /HEAD moved/);
  assert.equal(git(moves.root, "tag", "--list"), "", "no tag on a commit CI never saw");
});

// ── REL-AC-07 the engine source ──────────────────────────────────────────────

const SRC = readFileSync(join(REPO, "kit", "tools-saf", "lib", "release.mjs"), "utf8").replace(/\r\n/g, "\n");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// "rebase" is only forbidden as a command: the advice a person reads says it in words
test("REL-AC-07 the release engine has no force push, tag deletion, unpublish, deprecate or npm publish — nor a deleting or rewriting refspec", () => {
  for (const re of [/unpublish/, /deprecate/, /--force/, /push\s+-f/, /tag\s+-d/, /--delete/, /npm\s+publish/, /'publish'/, /"publish"/, /--mirror/, /--prune/, /reset\s+--hard/, /--amend/, /["'`]rebase["'`]|git\s+rebase/, /update-ref/, /branch\s+-[dD]/, /filter-branch/, /\+refs/, /[`"' ]:refs\//, /[`"' ]:\$\{/, /[`"' ]\+\$\{/, /--force-with-lease/]) assert.doesNotMatch(SRC, re, String(re));
  assert.doesNotMatch(CODE, /["'`]-{1,2}(f|d|D|force|delete)["'`]/, "no flag literal that deletes or forces");
  assert.doesNotMatch(CODE, /["'`]-+["'`]\s*\+|\+\s*["'`]-+["'`]/, "no flag built by joining strings");
  // every push names its refspec from the one builder, with --no-follow-tags
  const pushLines = CODE.split("\n").filter((l) => /"push"/.test(l));
  assert.equal(pushLines.length, 2, "two push call sites: the branch and the tag");
  for (const l of pushLines) assert.match(l, /"push", PUSH_SAFE, RELEASE\.remote, `(\$\{release\}:refs\/heads\/\$\{branch\}|refs\/tags\/\$\{tag\})`/, l);
});

test("REL-AC-07 imports and writes are confined: fs writes cannot hide behind another import, and every outside call has a known shape", () => {
  const imports = [...CODE.matchAll(/^import (.+?) from "([^"]+)";$/gm)].map((m) => [m[2], m[1]]);
  const allowed = { "node:child_process": ["spawnSync"], "node:fs": ["existsSync", "lstatSync", "readFileSync", "realpathSync", "rmSync", "writeFileSync"], "node:path": ["dirname", "join", "posix", "relative"], "./config.mjs": null, "./plan.mjs": null };
  for (const [mod, what] of imports) {
    assert.ok(Object.hasOwn(allowed, mod), `import from ${mod} is not allowed`);
    if (allowed[mod]) {
      assert.match(what, /^\{[^}]*\}$/, `${mod}: named imports only (no namespace, no default)`);
      for (const n of what.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(allowed[mod].includes(n), `${mod} may not give ${n}`);
    }
  }
  assert.equal(imports.length, CODE.split("\n").filter((l) => /^import\s/.test(l)).length, "every import line was read");
  assert.doesNotMatch(CODE, new RegExp(["\\bimport\\(", "\\brequire\\(", "createRequire", "\\beval\\(", "new\\s+Func" + "tion", "process\\.binding", "fs/promises", "node:(http|https|net|dgram|tls|vm|worker_threads)"].join("|")));
  // one place writes a file, one place removes one, one place starts a process
  assert.equal(CODE.match(/\bwriteFileSync\(/g).length, 1, "one writeFileSync call");
  assert.equal(CODE.match(/\brmSync\(/g).length, 1, "one rmSync call");
  assert.equal(CODE.match(/\bspawnSync\(/g).length, 1, "one spawnSync call");
  assert.match(CODE, /function putFile\([\s\S]*?\bwriteFileSync\(/, "the write sits in putFile");
  // every call through the injected runner
  const calls = [...CODE.matchAll(/\bctx\.run\(([^\n]*)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 4);
  for (const c of calls) assert.ok(/^"git", args\)/.test(c) || /^"npm", \["view", name, "versions", "--json"\]\)/.test(c) || /^"gh", \["run", "(list|view)"/.test(c), `unknown outside call: ctx.run(${c}`);
  // the git verbs the source can name
  const verbs = new Set([...CODE.matchAll(/\bgitw?\(ctx,(?:\s*out,)?((?:\s*"-[^"]*",)*)\s*"([a-z-]+)"/g)].map((m) => m[2]));
  const known = ["add", "cat-file", "commit", "diff", "fetch", "log", "ls-remote", "push", "reset", "rev-parse", "show", "status", "tag"];
  assert.match(CODE, /"fetch", "--quiet", RELEASE\.remote, `refs\/heads\/\$\{s\.branch\}`/, "the fetch names the full ref: a tag called like the branch cannot win");
  for (const v of verbs) assert.ok(known.includes(v), `git ${v} is not a known verb`);
  for (const v of ["push", "tag", "commit", "add"]) assert.ok(verbs.has(v), `git ${v} is among the verbs`);
});

// ── round 1 review: tags, a moving HEAD, ambiguous names, advice, paths, bytes ──

test("REL-AC-06 with push.followTags on, --tag pushes only the release tag, not a local tag that is merely reachable", () => {
  const f = prepared();
  git(f.root, "config", "push.followTags", "true");
  git(f.root, "tag", "-a", "v0.4.1", "-m", "stale local tag", `${f.sha}~1`);
  const ctx = tagCtx(f, ["success"]);
  const r = run(rel.tagRelease, ctx);
  assert.equal(r.code, 0, r.text);
  assert.equal(git(f.remote, "tag", "--list"), "v0.5.0", "the remote gained only v0.5.0 (a stale tag would start the release workflow)");
  assert.deepEqual(pushes(ctx.run.calls), [["push", "--no-follow-tags", "origin", "refs/tags/v0.5.0"]]);
});

// a guard, not a red-first test: the branch push already carried --no-follow-tags; this pins it so it cannot be dropped
test("REL-AC-05 with push.followTags on, --prepare pushes the branch and no tag", () => {
  const f = fixture();
  git(f.root, "config", "push.followTags", "true");
  git(f.root, "tag", "-a", "v0.0.1", "-m", "local only");
  assert.equal(run(rel.prepareRelease, ctxOf(f)).code, 0);
  assert.equal(git(f.remote, "tag", "--list"), "", "no tag went with the branch");
});

test("REL-AC-05 a commit that lands while the guards run stops --prepare before anything is written", () => {
  const f = fixture();
  let landed = false;
  const ctx = ctxOf(f, { intercept: (cmd) => { if (cmd === "npm" && !landed) { landed = true; git(f.root, "commit", "-q", "--allow-empty", "-m", "from another session"); } } });
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /HEAD moved/);
  assert.deepEqual(writeCalls(ctx.run.calls), []);
  assert.equal(read(f.root, "package.json").includes("0.5.0"), false);
});

test("REL-AC-05 a commit that lands under the release commit is never pushed: the local commit stays and the reason is printed", () => {
  const f = fixture();
  let landed = false;
  const ctx = ctxOf(f, {
    intercept: (cmd, args) => {
      if (cmd === "git" && verbOf(args) === "add" && !landed) {
        landed = true; // another session commits (plumbing, so the index stays as --prepare left it)
        const tip = git(f.root, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "landed meanwhile");
        git(f.root, "update-ref", "HEAD", tip);
      }
    },
  });
  const remoteBefore = remoteRefs(f.remote);
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /another commit landed/);
  assert.match(r.text, /nothing was pushed/);
  assert.deepEqual(pushes(ctx.run.calls), []);
  assert.equal(remoteRefs(f.remote), remoteBefore, "the remote did not change");
  assert.equal(git(f.root, "log", "-1", "--format=%s"), "chore(release): v0.5.0 (M1)", "the local commit stays");
});

test("REL-AC-05 a remote tag named like the branch does not become the commit the guards read: the fetch names refs/heads/<branch>", () => {
  const f = fixture();
  const other = tmp("saf-run-other-");
  git(other, "clone", "-q", f.remote, ".");
  write(other, "saf.config.json", { ...f.raw, policies: { ...f.raw.policies, release: { ...f.raw.policies.release, auto: "off" } } });
  commitAll(other, "a commit that is only a tag");
  git(other, "tag", "main");
  git(other, "push", "-q", "origin", "refs/tags/main");
  const ctx = ctxOf(f);
  const g = byId(rel.releaseGuards(ctx, "M1"));
  assert.equal(g["G-switch"].ok, true, g["G-switch"].reason);
  assert.equal(g["G-branch"].ok, true, g["G-branch"].reason);
  assert.ok(ctx.run.calls.some((c) => c.join(" ") === "git fetch --quiet origin refs/heads/main"));
});

test("REL-AC-05 the failure paths print the commands they run, and the tag command is printed exactly", () => {
  const f = fixture();
  const ctx = ctxOf(f, { intercept: (cmd, args) => (cmd === "git" && verbOf(args) === "commit" ? { code: 1, out: "", err: "hook failed: no" } : undefined) });
  const r = run(rel.prepareRelease, ctx);
  assert.match(r.text, /^\$ git --literal-pathspecs reset -q -- /m, "the reset is shown");
  const p = prepared();
  const t = run(rel.tagRelease, tagCtx(p, ["success"]));
  assert.ok(t.lines.some((l) => l.startsWith(`$ git tag -a v0.5.0 --cleanup=whitespace -m ## 0.5.0 — 2026-02-03`) && l.endsWith(` ${p.sha}`)), t.text);
});

test("REL-AC-05 a version file under a linked folder is never written outside the project", (t) => {
  const f = fixture();
  const outside = tmp("saf-run-outside-");
  write(outside, "VERSION", "0.4.0\n");
  try {
    symlinkSync(outside, join(f.root, "linked"), "junction");
  } catch {
    return t.skip("links cannot be made here");
  }
  write(f.root, ".git/info/exclude", "linked\n");
  const raw = { ...f.raw, policies: { ...f.raw.policies, release: { ...f.raw.policies.release, versionFiles: ["VERSION", "linked/VERSION"] } } };
  const ctx = ctxOf({ ...f, config: config.resolveConfig(raw) });
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /linked\/VERSION .*outside the project/);
  assert.equal(read(outside, "VERSION"), "0.4.0\n", "the file outside was not touched");
  assert.equal(read(f.root, "package.json").includes("0.5.0"), false, "nothing inside was written either");
  assert.deepEqual(writeCalls(ctx.run.calls), []);
});

test("REL-AC-05 a symbolic link as a release file keeps its message (nothing is written, nothing is lost)", (t) => {
  const f = fixture();
  const outside = tmp("saf-run-outside-");
  write(outside, "v.txt", "0.4.0\n");
  try {
    symlinkSync(join(outside, "v.txt"), join(f.root, "LINK"), "file");
  } catch {
    return t.skip("links cannot be made here");
  }
  write(f.root, ".git/info/exclude", "LINK\n");
  const raw = { ...f.raw, policies: { ...f.raw.policies, release: { ...f.raw.policies.release, versionFiles: ["VERSION", "LINK"] } } };
  const r = run(rel.prepareRelease, ctxOf({ ...f, config: config.resolveConfig(raw) }));
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /LINK is a symbolic link/);
  assert.equal(read(outside, "v.txt"), "0.4.0\n");
  assert.equal(read(f.root, "VERSION"), "0.4.0\n");
});

test("REL-AC-05 a file that is not UTF-8 comes back byte for byte when the commit fails", () => {
  const f = fixture();
  const bytes = Buffer.concat([Buffer.from('{"name":"demo-b","version":"0.4.0","description":"caf'), Buffer.from([0xe9]), Buffer.from('","dependencies":{"demo-pkg":"0.4.0"}}\n')]);
  writeFileSync(join(f.root, "pkg/b/package.json"), bytes);
  commitAll(f.root, "latin-1 description");
  git(f.root, "push", "-q", "origin", "main");
  const ctx = ctxOf(f, { intercept: (cmd, args) => (cmd === "git" && verbOf(args) === "commit" ? { code: 1, out: "", err: "hook failed: no" } : undefined) });
  const r = run(rel.prepareRelease, ctx);
  assert.equal(r.code, 1, r.text);
  assert.ok(readFileSync(join(f.root, "pkg/b/package.json")).equals(bytes) && git(f.root, "status", "--porcelain") === "", "byte-identical, nothing dirty");
});

test("REL-AC-06 the tag confirmation needs the peeled line to be the release commit", () => {
  const f = prepared();
  const lie = (cmd, args) => (cmd === "git" && verbOf(args) === "ls-remote" && args.length === 5 ? { code: 0, out: `${"a".repeat(40)}\trefs/tags/v0.5.0\n${"b".repeat(40)}\trefs/tags/v0.5.0^{}\n`, err: "" } : undefined);
  const r = run(rel.tagRelease, tagCtx(f, ["success"], { intercept: lie }));
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /does not show v0\.5\.0 pointing at the release commit/);
  const none = (cmd, args) => (cmd === "git" && verbOf(args) === "ls-remote" && args.length === 5 ? { code: 0, out: `${"a".repeat(40)}\trefs/tags/v0.5.0\n`, err: "" } : undefined);
  assert.equal(run(rel.tagRelease, tagCtx(prepared(), ["success"], { intercept: none })).code, 1, "no peeled line: refused");
});
