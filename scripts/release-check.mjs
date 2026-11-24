#!/usr/bin/env node
/**
 * Read-only checks around a release — used as "Done when" commands of the release cards and by the release workflow
 * (.github/workflows/release.yml). Never publishes, tags or uploads anything; the workflow does that after these pass.
 *
 *   node scripts/release-check.mjs npm                       both packages are on npm at the version in package.json
 *   node scripts/release-check.mjs tag                       the tag v<version> exists locally and on origin
 *   node scripts/release-check.mjs release                   a GitHub release v<version> exists (needs gh)
 *   node scripts/release-check.mjs social                    the repository has a custom social preview (needs gh)
 *   node scripts/release-check.mjs guards <tag>              every guard of the release workflow holds for this tag (git, gh)
 *   node scripts/release-check.mjs switch                    policies.release.auto is "on" on origin/<release branch> (fetches it)
 *   node scripts/release-check.mjs published <dir> <version> [--wait]   that package is on npm at that version (--wait: bounded retries)
 *   node scripts/release-check.mjs notes <tag>               print the CHANGELOG section of the tag (the GitHub release notes)
 *   node scripts/release-check.mjs workflow [file]           release.yml follows the publishing rules (static, no network)
 *
 * Exit 0 all hold · 1 one failed · 2 usage error. Every outside call goes through one injectable runner (offline tests).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../tools/saf/lib/config.mjs";
import { RELEASE, RELEASE_LOG, changelogSection, commandRunner, compareVersions, nextVersion, readChangelog, readReleaseLog } from "../tools/saf/lib/release.mjs";
import { parseYaml } from "../tools/saf/lib/yaml.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = "Bellero-Advanced/super-agent-framework";
const CONFIG_FILE = "saf.config.json";

/** Data, not logic: every name, number and pattern the workflow rules and the guards read. */
export const POLICY = {
  tag: /^v(\d+\.\d+\.\d+)$/,
  workflowFile: ".github/workflows/release.yml",
  workflowDir: ".github/workflows",
  docsLink: "https://docs.npmjs.com/trusted-publishers",
  minNode: "22.14.0",
  minNpm: "11.5.1",
  environment: "npm",
  runner: /^ubuntu-/, // trusted publishing needs a GitHub-hosted runner
  trigger: ["v*"],
  topPermissions: { contents: "read" },
  jobPermissions: { contents: "write", "id-token": "write" },
  jobName: "publish",
  actions: { uses: /^actions\/(checkout|setup-node)@([0-9a-f]{40}|v\d+)$/ }, // first-party only; a full commit id or a major version tag
  expressions: ["github.ref_name", "github.token", "github.repository"], // the only ${{ }} values the file may hold, never inside a script
  forbidden: /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|\bsecrets\b|pull_request_target|unpublish|deprecate|dist-tag|--force/i,
  tagStep: /\[\[ "\$TAG" =~ \^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$ \]\]/,
  guardsStep: /release-check\.mjs guards "\$TAG"/,
  publish: /npm publish (\S+) --provenance\b/g,
  waitStep: /release-check\.mjs published \S+ "\$VERSION" --wait\b/,
  skipStep: /\|\| status=\$\?/,
  release: /gh release create "\$TAG" --verify-tag\b/,
  after: ["release-check.mjs npm", "release-check.mjs release"],
  wait: { tries: 12, delayMs: 10000 }, // registry wait after a publish
};

const oneLine = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
const clean = (p) => String(p).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "") || ".";
const inside = (p) => typeof p === "string" && p !== "" && !/[\u0000-\u001f\u007f]/.test(p) && !/^([A-Za-z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes("..");
const sameMap = (a, b) => a && typeof a === "object" && !Array.isArray(a) && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const first = (s) => String(s ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
const versionOf = (tag) => String(tag).match(POLICY.tag)?.[1] ?? null;

// ── workflow: static rules (spec rules 15-19) ────────────────────────────────

/** The rules of `.github/workflows/release.yml` as `[ok, label]`; reads text only. `packages` = the released package folders in publish order. */
export function checkWorkflow(src, { packages = ["."] } = {}) {
  let doc;
  try {
    doc = parseYaml(src);
  } catch (e) {
    return [[false, `release.yml is not readable YAML (${oneLine(e.message)})`]];
  }
  const job = doc?.jobs?.[POLICY.jobName];
  const steps = Array.isArray(job?.steps) ? job.steps.filter((s) => s && typeof s === "object") : [];
  const runs = steps.map((s) => (typeof s.run === "string" ? s.run : ""));
  const at = (re) => runs.findIndex((r) => re.test(r));
  const out = [];
  const rule = (label, problem) => {
    let p;
    try {
      p = problem();
    } catch (e) {
      p = oneLine(e.message);
    }
    out.push([!p, p ? `${label} — ${p}` : label]);
  };
  const expressions = [...src.matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  const publishes = runs.map((r, i) => ({ i, targets: [...r.matchAll(POLICY.publish)].map((m) => clean(m[1])) })).filter((p) => p.targets.length || runs[p.i].includes("npm publish"));

  rule("runs only when a v* tag is pushed", () => {
    const on = doc?.on;
    if (!on || typeof on !== "object" || Array.isArray(on)) return "`on:` must be a mapping with only push";
    if (Object.keys(on).join() !== "push") return `triggers: ${Object.keys(on).join(", ")}`;
    const push = on.push;
    if (!push || Object.keys(push).join() !== "tags" || JSON.stringify(push.tags) !== JSON.stringify(POLICY.trigger)) return `push must have only tags: ${JSON.stringify(POLICY.trigger)}`;
    return null;
  });
  rule("top-level permissions are contents: read only", () => (sameMap(doc?.permissions, POLICY.topPermissions) ? null : "permissions differ"));
  rule("one job `publish` on a GitHub-hosted runner, in the environment `npm`", () => {
    if (Object.keys(doc?.jobs ?? {}).join() !== POLICY.jobName) return "the file must hold exactly one job named publish";
    if (job.environment !== POLICY.environment) return `environment is not ${POLICY.environment}`;
    if (!POLICY.runner.test(String(job["runs-on"]))) return "runs-on is not a GitHub-hosted ubuntu runner";
    if (job.if !== undefined) return "the job must not have an `if`";
    return null;
  });
  rule("the job asks for contents: write and id-token: write, nothing more", () => (sameMap(job?.permissions, POLICY.jobPermissions) ? null : "job permissions differ (id-token: write is how npm trusts the run)"));
  rule("no npm token, secrets, force flags, unpublish, deprecate or pull_request_target", () => {
    const m = src.match(POLICY.forbidden);
    return m ? `found "${m[0]}"` : null;
  });
  rule("event values reach scripts only through environment variables", () => {
    const bad = runs.findIndex((r) => r.includes("${{"));
    if (bad >= 0) return `step ${bad + 1} has an expression inside its script`;
    const other = expressions.find((e) => !POLICY.expressions.includes(e));
    return other ? `expression "${other}" is not allowed` : null;
  });
  rule("the tag name is validated first", () => {
    if (job?.env?.TAG !== "${{ github.ref_name }}") return "TAG is not set from github.ref_name in the job env";
    return POLICY.tagStep.test(runs[0] ?? "") ? null : "the first step must test $TAG against v<major>.<minor>.<patch>";
  });
  rule("actions are first-party and pinned (full commit id or major version tag)", () => {
    const bad = steps.map((s) => s.uses).filter((u) => u !== undefined && !POLICY.actions.uses.test(String(u)));
    return bad.length ? `not allowed: ${bad.map(oneLine).join(", ")}` : null;
  });
  rule("checkout has full history and keeps no git credentials", () => {
    const w = steps.find((s) => String(s.uses).startsWith("actions/checkout@"))?.with;
    return w?.["fetch-depth"] === "0" && w?.["persist-credentials"] === "false" ? null : "needs fetch-depth: 0 and persist-credentials: false";
  });
  rule(`Node >= ${POLICY.minNode} and npm >= ${POLICY.minNpm}, with a link to npm's trusted-publishing docs`, () => {
    const node = steps.find((s) => String(s.uses).startsWith("actions/setup-node@"))?.with?.["node-version"];
    if ((compareVersions(node, POLICY.minNode) ?? -1) < 0) return `node-version ${oneLine(node)} is below ${POLICY.minNode}`;
    const npm = runs.map((r) => r.match(/npm install --global npm@(\d+\.\d+\.\d+)\b/)?.[1]).find(Boolean);
    if ((compareVersions(npm, POLICY.minNpm) ?? -1) < 0) return `npm ${oneLine(npm)} is below ${POLICY.minNpm}`;
    return src.includes(POLICY.docsLink) ? null : `no comment with ${POLICY.docsLink}`;
  });
  rule("the guards step comes before every publish and release step, and no step is optional", () => {
    const g = at(POLICY.guardsStep);
    if (g < 0) return "no `node scripts/release-check.mjs guards \"$TAG\"` step";
    if (steps.some((s) => s["continue-on-error"] !== undefined)) return "a step has continue-on-error";
    if (steps[g].if !== undefined) return "the guards step has an `if`";
    const early = [...publishes.map((p) => p.i), at(POLICY.release)].filter((i) => i >= 0 && i < g);
    return early.length ? "a publish or release step comes before the guards step" : null;
  });
  rule("each package is published with provenance, in order, the kill switch checked right before", () => {
    const got = publishes.flatMap((p) => p.targets);
    if (JSON.stringify(got) !== JSON.stringify(packages.map(clean)) || publishes.some((p) => p.targets.length !== 1)) return `publish steps are [${got.join(", ")}], expected one each for [${packages.join(", ")}]`;
    const slow = publishes.find((p) => runs[p.i].indexOf("release-check.mjs switch") < 0 || runs[p.i].indexOf("release-check.mjs switch") > runs[p.i].indexOf("npm publish"));
    if (slow) return `step ${slow.i + 1} does not check the kill switch before npm publish`;
    const unsafe = publishes.find((p) => !POLICY.skipStep.test(runs[p.i]) || !POLICY.waitStep.test(runs[p.i]));
    return unsafe ? `step ${unsafe.i + 1} must skip a version already on npm and wait for it afterwards` : null;
  });
  rule("the GitHub release comes after the last publish, then the npm and release checks", () => {
    const rel = at(POLICY.release);
    const last = Math.max(...publishes.map((p) => p.i), -1);
    if (rel < 0 || rel < last) return "no `gh release create \"$TAG\" --verify-tag` after the last publish";
    const idx = POLICY.after.map((a) => runs.findIndex((r) => r.includes(a)));
    return idx.some((i, k) => i < rel || (k && i < idx[k - 1])) ? "the npm and release checks must follow the release step" : null;
  });
  return out;
}

// ── guards: the release workflow checks the tag again (spec rule 17) ─────────

/** What the guards read: the project root, the checked config and the runner (`run(cmd, args)` → `{ code, out, err }`). */
export function makeContext(root, run = commandRunner(root)) {
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
  } catch {
    raw = {};
  }
  return { root, run, config: resolveConfig(raw) };
}

const text = (ctx, file) => (inside(file) && existsSync(join(ctx.root, file)) ? readFileSync(join(ctx.root, file), "utf8") : null);
const git = (ctx, ...args) => ctx.run("git", args);
const why = (r) => oneLine(first(r.err || r.out) || `exit ${r.code}`).replace(/\/\/[^/@\s]+@/g, "//***@");
const branchOf = (ctx) => ctx.config.policies.protectedBranches[0] ?? RELEASE.fallbackBranch;

/** `{ auto, branch }` of saf.config.json on origin/<release branch> after a fetch, or `{ error }`. */
function switchOnOrigin(ctx) {
  const branch = branchOf(ctx);
  if (!RELEASE.branchName.test(branch)) return { error: `the release branch "${oneLine(branch)}" is not a plain branch name` };
  const f = git(ctx, "fetch", "--quiet", RELEASE.remote, branch);
  if (f.code !== 0) return { error: `fetch of ${RELEASE.remote}/${branch} failed (${why(f)})` };
  const s = git(ctx, "show", `refs/remotes/${RELEASE.remote}/${branch}:${CONFIG_FILE}`);
  if (s.code !== 0) return { error: `cannot read ${CONFIG_FILE} on ${RELEASE.remote}/${branch} (${why(s)})` };
  try {
    return { auto: JSON.parse(s.out)?.policies?.release?.auto ?? "off", branch };
  } catch {
    return { error: `${CONFIG_FILE} on ${RELEASE.remote}/${branch} is not valid JSON` };
  }
}

/** The CI matrix operating systems of the CI workflow file: `{ os, file }` or `{ error }`. */
function ciSystems(ctx) {
  const file = ctx.config.policies.release.ciWorkflow;
  const src = /^[\w.-]+$/.test(file) ? text(ctx, `${POLICY.workflowDir}/${file}`) : null;
  if (src === null) return { error: `${POLICY.workflowDir}/${oneLine(file)} cannot be read` };
  try {
    const os = Object.values(parseYaml(src).jobs ?? {}).flatMap((j) => j?.strategy?.matrix?.os ?? []).map(String);
    return os.length ? { os: [...new Set(os)], file } : { error: `${file} has no os matrix` };
  } catch (e) {
    return { error: `${file} is not readable (${oneLine(e.message)})` };
  }
}

function ciProblems(ctx, sha) {
  const sys = ciSystems(ctx);
  if (sys.error) return [sys.error];
  const list = ctx.run("gh", ["run", "list", "--workflow", sys.file, "--commit", sha, "--json", "databaseId,status,conclusion"]);
  if (list.code !== 0) return [`gh failed (${why(list)})`];
  let latest;
  try {
    latest = JSON.parse(list.out)?.[0];
  } catch {
    return ["gh run list did not answer with JSON"];
  }
  if (!latest) return [`no run of ${sys.file} for ${sha.slice(0, RELEASE.shortHead)}`];
  if (!Number.isSafeInteger(latest.databaseId)) return ["gh run list gave no run id"];
  const problems = [];
  if (latest.status !== "completed" || latest.conclusion !== "success") problems.push(`the newest run ${latest.databaseId} is ${oneLine(latest.status)}/${oneLine(latest.conclusion)}, not completed/success`);
  const view = ctx.run("gh", ["run", "view", String(latest.databaseId), "--json", "jobs"]);
  let jobs = null;
  try {
    jobs = view.code === 0 ? JSON.parse(view.out).jobs : null;
  } catch {
    jobs = null;
  }
  if (!Array.isArray(jobs) || !jobs.length) return [...problems, view.code === 0 ? `run ${latest.databaseId} lists no jobs` : `gh failed (${why(view)})`];
  for (const j of jobs.filter((x) => x?.conclusion !== "success")) problems.push(`job ${oneLine(j?.name)} is ${oneLine(j?.conclusion || j?.status)}`);
  for (const os of sys.os) if (!jobs.some((j) => String(j?.name).includes(os))) problems.push(`no job for ${os}`);
  return problems;
}

/** Every guard for `tag` as `[{ id, ok, reason }]`; a failed read fails its guard, an invalid tag stops at the first. */
export function releaseGuards(ctx, tag) {
  const version = versionOf(tag);
  if (!version) return [{ id: "G-tag", ok: false, reason: `"${oneLine(tag).slice(0, 40)}" is not a v<major>.<minor>.<patch> tag` }];
  const rel = ctx.config.policies.release;
  const out = [{ id: "G-tag", ok: true, reason: `${tag} is a release tag` }];
  const add = (id, problems, ok) => out.push({ id, ok: problems.length === 0, reason: problems.length ? problems.join("; ") : ok });

  const versions = [];
  for (const dir of rel.packages) {
    let json = null;
    try {
      json = JSON.parse(text(ctx, `${clean(dir)}/package.json`));
    } catch {
      json = null;
    }
    if (!json) versions.push(`${clean(dir)}/package.json is missing or not valid JSON`);
    else if (json.version !== version) versions.push(`${oneLine(json.name)} is ${oneLine(json.version)}, the tag says ${version}`);
  }
  for (const f of rel.versionFiles) if (String(text(ctx, f) ?? "").trim() !== version) versions.push(`${oneLine(f)} does not hold ${version}`);
  add("G-versions", versions, `every released package and version file is ${version}`);

  const entry = readReleaseLog(text(ctx, RELEASE_LOG) ?? "").find((e) => e.version === version);
  const commit = [];
  const head = git(ctx, "rev-parse", "HEAD");
  const tagged = git(ctx, "rev-parse", `refs/tags/${tag}^{commit}`);
  if (head.code !== 0 || tagged.code !== 0 || head.out.trim() !== tagged.out.trim()) commit.push(`the checkout is not the commit of ${tag}`);
  if (!entry) commit.push(`${RELEASE_LOG} has no entry for ${tag}`);
  else {
    const subject = git(ctx, "log", "-1", "--format=%s", "HEAD");
    if (subject.out.trim() !== RELEASE.subject(version, entry.mid)) commit.push(`the commit subject is not "${RELEASE.subject(version, entry.mid)}"`);
  }
  const branch = branchOf(ctx);
  if (!RELEASE.branchName.test(branch)) commit.push(`the release branch "${oneLine(branch)}" is not a plain branch name`);
  else if (git(ctx, "merge-base", "--is-ancestor", "HEAD", `refs/remotes/${RELEASE.remote}/${branch}`).code !== 0) commit.push(`the tagged commit is not on ${RELEASE.remote}/${branch}`);
  add("G-commit", commit, `${tag} is the release commit of ${entry?.mid ?? "?"}, on ${RELEASE.remote}/${branch}`);

  const log = text(ctx, RELEASE.changelog);
  const section = log === null ? null : changelogSection(log, version);
  const change = [];
  if (!section || !section.split("\n").slice(1).join("").trim()) change.push(`${RELEASE.changelog} has no filled "## ${version}" section`);
  else if (entry) {
    const implied = nextVersion(entry.from, readChangelog(section.replace(/^[^\n]*/, "## Unreleased")));
    if (implied !== version) change.push(`the ${version} section implies ${implied ? `v${implied}` : "no version"} after v${oneLine(entry.from)}`);
  }
  add("G-changelog", change, `${RELEASE.changelog} has the ${version} section and it gives ${version} after v${entry?.from}`);

  add("G-ci", head.code === 0 ? ciProblems(ctx, head.out.trim()) : [`HEAD is unknown (${why(head)})`], "the CI run for this commit succeeded in every job, on every operating system of its matrix");

  const sw = switchOnOrigin(ctx);
  add("G-switch", sw.error ? [sw.error] : sw.auto === "on" ? [] : [`policies.release.auto is "${oneLine(sw.auto)}" on ${RELEASE.remote}/${sw.branch}`], `policies.release.auto is on on ${RELEASE.remote}/${sw.branch ?? branch}`);
  return out;
}

/** The kill switch alone, fresh from origin: `[{ id, ok, reason }]`. */
export function killSwitch(ctx) {
  const sw = switchOnOrigin(ctx);
  const ok = !sw.error && sw.auto === "on";
  return [{ id: "G-switch", ok, reason: sw.error ?? `policies.release.auto is "${oneLine(sw.auto)}" on ${RELEASE.remote}/${sw.branch}` }];
}

// ── npm: is a package version there ──────────────────────────────────────────

/** `{ name }` of the released package in `dir`, or `{ error }`: only a folder named in policies.release.packages counts. */
function releasedPackage(ctx, dir) {
  const want = clean(dir);
  if (!ctx.config.policies.release.packages.map(clean).includes(want)) return { error: `${oneLine(dir)} is not one of policies.release.packages` };
  try {
    const name = JSON.parse(text(ctx, `${want}/package.json`)).name;
    return RELEASE.packageName.test(String(name)) ? { name } : { error: `${want}/package.json has no usable name` };
  } catch {
    return { error: `${want}/package.json is missing or not valid JSON` };
  }
}

/** Is `<name>@<version>` on npm? `{ name, published }` or `{ error }`. `wait` retries (bounded) until it is. */
export async function isPublished(ctx, dir, version, { wait = false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const pkg = releasedPackage(ctx, dir);
  if (pkg.error) return pkg;
  if (!RELEASE.version.test(String(version))) return { error: `"${oneLine(version).slice(0, 40)}" is not an x.y.z version` };
  for (let i = 1; i <= (wait ? POLICY.wait.tries : 1); i++) {
    const r = ctx.run("npm", ["view", `${pkg.name}@${version}`, "version"]);
    if (r.code === 0 && r.out.trim() === version) return { name: pkg.name, published: true };
    if (wait && i < POLICY.wait.tries) await sleep(POLICY.wait.delayMs);
  }
  return { name: pkg.name, published: false };
}

// ── the command line ─────────────────────────────────────────────────────────

const pkgVersion = () => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const listed = (guards) => guards.map((g) => [g.ok, `${g.id} — ${oneLine(g.reason)}`]);
const shell = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}`.trim(), err: `${r.stderr ?? ""}`.trim() };
};

/** Each check returns `[ok, label]` lines (or a string to print). */
const checks = {
  npm: () => ["super-agent-framework", "create-saf"].map((pkg) => {
    const r = shell("npm", ["view", `${pkg}@${pkgVersion()}`, "version"]);
    return [r.ok && r.out === pkgVersion(), `${pkg}@${pkgVersion()} on npm`];
  }),
  tag: () => {
    const tag = `v${pkgVersion()}`;
    return [
      [shell("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok, `tag ${tag} exists locally`],
      [shell("git", ["ls-remote", "--exit-code", "--tags", "origin", tag]).ok, `tag ${tag} is on origin`],
    ];
  },
  release: () => [[shell("gh", ["release", "view", `v${pkgVersion()}`, "--repo", REPO]).ok, `GitHub release v${pkgVersion()}`]],
  social: () => {
    const r = shell("gh", ["api", "graphql", "-f", `query={repository(owner:"Bellero-Advanced",name:"super-agent-framework"){usesCustomOpenGraphImage}}`, "--jq", ".data.repository.usesCustomOpenGraphImage"]);
    return [[r.ok && r.out === "true", "custom social preview uploaded (Settings → General → Social preview)"]];
  },
  guards: ([tag]) => listed(releaseGuards(makeContext(ROOT), tag)),
  switch: () => listed(killSwitch(makeContext(ROOT))),
  published: async ([dir, version, flag]) => {
    const r = await isPublished(makeContext(ROOT), dir, version, { wait: flag === "--wait" });
    return r.error ? [[false, r.error]] : [[r.published, `${r.name}@${version} on npm`]];
  },
  notes: ([tag]) => {
    const version = versionOf(tag);
    const log = version ? text(makeContext(ROOT), RELEASE.changelog) : null;
    const body = log === null ? null : changelogSection(log, version)?.split("\n").slice(1).join("\n").trim();
    return body ? `${body}\n` : [[false, `${RELEASE.changelog} has no filled section for ${oneLine(tag).slice(0, 40)}`]];
  },
  workflow: ([file]) => {
    const target = resolve(ROOT, file ?? POLICY.workflowFile);
    if (!existsSync(target)) return [[false, `${file ?? POLICY.workflowFile} does not exist`]];
    return checkWorkflow(readFileSync(target, "utf8"), { packages: makeContext(ROOT).config.policies.release.packages });
  },
};

async function main(argv) {
  const [what, ...rest] = argv;
  if (!Object.hasOwn(checks, what ?? "")) {
    process.stderr.write(`usage: node scripts/release-check.mjs ${Object.keys(checks).join("|")}\n`);
    return 2;
  }
  const result = await checks[what](rest);
  if (typeof result === "string") {
    process.stdout.write(result);
    return 0;
  }
  let failed = 0;
  for (const [ok, label] of result) {
    process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
    if (!ok) failed++;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
