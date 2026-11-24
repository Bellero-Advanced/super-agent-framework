import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { CONFIG_FILE } from "./config.mjs";
import { activeCards, cardStatus, gateResults, isDone, loadPlan } from "./plan.mjs";

/**
 * Automatic release, the read-only part (docs/specs/auto-release.md rules 1-9, decision D-015). The guards and the dry run
 * only READ: every call to the outside world (git, the registry, `gh`) goes through one injected `run(cmd, args)` that
 * returns `{ code, out, err }`, so tests use fakes and the engine never touches the network by itself. Nothing here pushes,
 * tags, publishes or writes a file; the steps that do are a later card.
 */

/** Where the release log lives (append-only, written by the prepare step). */
export const RELEASE_LOG = "docs/plan/releases.md";

/** Data, not logic: names, patterns and tables the guards read. */
export const RELEASE = {
  remote: "origin",
  fallbackBranch: "main",
  changelog: "CHANGELOG.md",
  mirror: ".saf/plan.md",
  planDir: "docs/plan/",
  evidenceDir: "docs/plan/evidence/",
  version: /^(\d+)\.(\d+)\.(\d+)$/,
  branchName: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  hexHead: /^[0-9a-f]{7,64}$/i,
  packageName: /^(@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/, // no leading "-" (it would read as an npm option) and no shell characters
  shortHead: 7,
  maxBuffer: 64 * 1024 * 1024,
  registryMissing: /E404/,
  // sub-section of `## Unreleased` (lower case) → bump; anything else is `otherBump`
  sectionBump: { breaking: "major", fixed: "patch" },
  otherBump: "minor",
  bumpOrder: ["major", "minor", "patch"],
  zeroMajor: { major: "minor" },
  // the dependency maps of a package.json that can name another released package
  dependencyKeys: ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"],
  subject: (version, mid) => `chore(release): v${version} (${mid})`,
};

const num = (v) => (typeof v === "string" ? v.match(RELEASE.version)?.slice(1).map(Number) : null) ?? null;
const oneLine = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
/** First line of a failed call's message; a user name and token inside a URL are hidden. */
const why = (r) => oneLine(String(r.err || r.out || "").split(/\r?\n/).find((l) => l.trim()) ?? `exit ${r.code}`).replace(/\/\/[^/@\s]+@/g, "//***@");
const noCr = (text) => String(text ?? "").replace(/\r\n/g, "\n");

/** Compare two `x.y.z` versions: negative, 0 or positive; `null` when either is not `x.y.z` (callers fail closed). */
export function compareVersions(a, b) {
  const [x, y] = [num(a), num(b)];
  if (!x || !y) return null;
  const i = x.findIndex((n, k) => n !== y[k]);
  return i < 0 ? 0 : x[i] - y[i];
}

/** The runner a real run uses: one process per call, an argument array, no prompts, a time limit. */
export function commandRunner(cwd, { timeoutMs } = {}) {
  return (cmd, args) => {
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: RELEASE.maxBuffer,
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32" && cmd === "npm", // npm is a .cmd file on Windows and needs a shell; its only variable argument is a package name that passed RELEASE.packageName
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" },
    });
    return { code: r.error ? 127 : (r.status ?? 1), out: r.stdout ?? "", err: r.error ? r.error.message : (r.stderr ?? "") };
  };
}

// ── CHANGELOG, release log, the bump ─────────────────────────────────────────

/** `{ unreleased: { <sub-section>: [non-blank lines] }, releases: [version] }` — a missing Unreleased section reads as `{}`. */
export function readChangelog(text) {
  const out = { unreleased: {}, releases: [] };
  let inside = false;
  let sub = null;
  for (const line of noCr(text).split("\n")) {
    const h3 = line.match(/^###\s+(.*?)\s*$/);
    const h2 = h3 ? null : line.match(/^##\s+(.*?)\s*$/);
    if (h2) {
      inside = /^\[?unreleased\]?$/i.test(h2[1]);
      sub = null;
      const v = h2[1].match(/^\[?v?(\d+\.\d+\.\d+)\]?/);
      if (v) out.releases.push(v[1]);
    } else if (inside && h3) {
      sub = h3[1];
      out.unreleased[sub] ??= [];
    } else if (inside && line.trim() && !line.startsWith("# ")) (out.unreleased[sub ?? ""] ??= []).push(line.trimEnd());
  }
  return out;
}

/** The text of one released section of the CHANGELOG (from its heading to the next one), or `null`. */
export function changelogSection(text, version) {
  const lines = noCr(text).split("\n");
  const heading = new RegExp(`^##\\s+\\[?v?${version.replace(/\./g, "\\.")}\\]?(\\s|$)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}

/** `{ bump, reason }` for the Unreleased section (rule 7), or `null` when nothing is there or `current` is not `x.y.z`. */
export function releaseBump(current, changelog) {
  const now = num(current);
  const named = Object.entries(changelog?.unreleased ?? {}).filter(([, lines]) => lines.length).map(([name]) => name);
  if (!now || !named.length) return null;
  const kindOf = (name) => RELEASE.sectionBump[name.trim().toLowerCase()] ?? RELEASE.otherBump;
  const top = RELEASE.bumpOrder.find((k) => named.some((n) => kindOf(n) === k));
  const reason = named.find((n) => kindOf(n) === top);
  return { bump: now[0] === 0 ? (RELEASE.zeroMajor[top] ?? top) : top, reason: reason || "Unreleased" };
}

/** The next version after `current` for the Unreleased section of `changelog`, or `null` (nothing to release). */
export function nextVersion(current, changelog) {
  const r = releaseBump(current, changelog);
  if (!r) return null;
  const [major, minor, patch] = num(current);
  return { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[r.bump];
}

/** One release-log entry (rule 10): `- v<next> · <date> · <M> · gate <short head> · from v<previous> · bump <kind> (<reason>)`. */
export const releaseLogLine = ({ version, date, mid, head, from, bump, reason }) => `- v${version} · ${date} · ${mid} · gate ${String(head).slice(0, RELEASE.shortHead)} · from v${from} · bump ${bump} (${reason})`;

const LOG_LINE = /^- v(\S+) · (\d{4}-\d{2}-\d{2}) · (\S+) · gate (\S+) · from v(\S+) · bump (major|minor|patch) \((.*)\)$/;
/** The entries of the release log text; lines that are not entries are ignored. */
export function readReleaseLog(text) {
  return noCr(text).split("\n").flatMap((l) => {
    const m = l.trimEnd().match(LOG_LINE);
    return m ? [{ version: m[1], date: m[2], mid: m[3], head: m[4], from: m[5], bump: m[6], reason: m[7] }] : [];
  });
}

// ── settings and project facts ───────────────────────────────────────────────

const safeDir = (p) => typeof p === "string" && p.trim() !== "" && !/^([A-Za-z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes("..") && !p.startsWith("-");
const asPath = (dir, file) => posix.normalize(`${dir.split("\\").join("/")}/${file}`);

/** The release settings of the config, checked: unusable values are listed in `errors` by name. */
function settings(ctx) {
  const rel = ctx.config.policies.release;
  const branch = ctx.config.policies.protectedBranches[0] ?? RELEASE.fallbackBranch;
  const errors = {};
  if (!RELEASE.branchName.test(branch)) errors.branch = `the release branch "${oneLine(branch)}" is not a plain branch name`;
  const badPaths = [...rel.packages, ...rel.versionFiles].filter((p) => !safeDir(p));
  if (badPaths.length) errors.packages = `${badPaths.map(oneLine).join(", ")} is not a folder inside the project`;
  if (!safeDir(rel.ciWorkflow) || /[\\/]/.test(rel.ciWorkflow)) errors.ciWorkflow = `ciWorkflow "${oneLine(rel.ciWorkflow)}" is not a workflow file name`;
  return { ...rel, branch, errors };
}

const readText = (ctx, file) => {
  const p = join(ctx.root, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const readJson = (ctx, file) => {
  try {
    return JSON.parse(readText(ctx, file));
  } catch {
    return null;
  }
};

/** What the version guard and the plan share: the released packages, their version, the bump and the next version. */
function describe(ctx, step) {
  const s = settings(ctx);
  const problems = [];
  if (s.errors.packages) return { s, problems: [s.errors.packages], packages: [] };
  const packages = s.packages.map((dir) => {
    const file = asPath(dir, "package.json");
    const json = readJson(ctx, file);
    return { dir, file, name: json?.name, version: json?.version, json };
  });
  for (const p of packages) {
    if (!p.json) problems.push(`${p.file} is missing or not valid JSON`);
    else if (!RELEASE.packageName.test(String(p.name))) problems.push(`${p.file} has no usable name`);
    else if (!num(p.version)) problems.push(`${p.file} has no x.y.z version`);
  }
  const versions = [...new Set(packages.map((p) => p.version))];
  if (!problems.length && versions.length > 1) problems.push(`package versions differ: ${packages.map((p) => `${p.name} ${p.version}`).join(" · ")}`);
  const current = problems.length ? null : versions[0];
  const changelog = readText(ctx, RELEASE.changelog);
  const parsed = changelog === null ? null : readChangelog(changelog);
  let bump = null;
  let next = null;
  if (current && step === "tag") next = current;
  else if (current && parsed) {
    bump = releaseBump(current, parsed);
    next = nextVersion(current, parsed);
  }
  return { s, problems, packages, current, changelog, parsed, bump, next };
}

const git = (ctx, ...args) => ctx.run("git", args);
const verdict = (id, problems, okText) => ({ id, ok: problems.length === 0, reason: problems.length ? problems.join("; ") : okText });

// ── the guards ───────────────────────────────────────────────────────────────

/** `auto` of saf.config.json as git shows it at `rev`: `{ auto }` or `{ error }`. */
function switchAt(ctx, rev, label = rev) {
  const r = git(ctx, "show", `${rev}:${CONFIG_FILE}`);
  if (r.code !== 0) return { error: `cannot read ${CONFIG_FILE} at ${label} (${why(r)})` };
  try {
    return { auto: JSON.parse(r.out)?.policies?.release?.auto ?? "off" };
  } catch {
    return { error: `${CONFIG_FILE} at ${label} is not valid JSON` };
  }
}

function guardSwitch(ctx, s, fetched) {
  const problems = [];
  const at = (rev, label = rev) => {
    const v = switchAt(ctx, rev, label);
    if (v.error) problems.push(v.error);
    else if (v.auto !== "on") problems.push(`policies.release.auto is "${oneLine(v.auto)}" at ${label}`);
  };
  at("HEAD");
  if (s.errors.branch) problems.push(s.errors.branch);
  else if (fetched.error) problems.push(`${RELEASE.remote}/${s.branch} not read: ${fetched.error}`);
  else at(`refs/remotes/${RELEASE.remote}/${s.branch}`, `${RELEASE.remote}/${s.branch}`);
  return verdict("G-switch", problems, `policies.release.auto is on at HEAD and on ${RELEASE.remote}/${s.branch}`);
}

function guardBranch(ctx, s, fetched, plan, step, d, mid) {
  const problems = [];
  const branch = git(ctx, "rev-parse", "--abbrev-ref", "HEAD");
  const here = branch.code === 0 ? branch.out.trim() : `unknown (${why(branch)})`;
  if (here !== s.branch) problems.push(`the branch is ${oneLine(here)}, not ${s.branch}`);
  const status = git(ctx, "--no-optional-locks", "status", "--porcelain");
  if (status.code !== 0) problems.push(`git status failed (${why(status)})`);
  else if (status.out.trim()) problems.push("the worktree is not clean");
  if (plan.error) problems.push(`the plan cannot be read (${plan.error})`);
  else for (const c of activeCards(plan.plan)) problems.push(`card ${oneLine(c.id)} is in progress`);
  if (fetched.error) problems.push(`fetch failed (${fetched.error})`);
  else if (!s.errors.branch) {
    const head = git(ctx, "rev-parse", "HEAD");
    const origin = git(ctx, "rev-parse", `refs/remotes/${RELEASE.remote}/${s.branch}`);
    if (head.code !== 0 || origin.code !== 0 || head.out.trim() !== origin.out.trim()) problems.push(`HEAD is not ${RELEASE.remote}/${s.branch}`);
  }
  if (step === "tag") {
    const subject = git(ctx, "log", "-1", "--format=%s", "HEAD");
    const want = d.current ? RELEASE.subject(d.current, mid) : null;
    if (!want || subject.out.trim() !== want) problems.push(`HEAD is not the release commit${want ? ` "${want}"` : ""}`);
  }
  return verdict("G-branch", problems, `on ${s.branch}, clean, no card in progress, HEAD is ${RELEASE.remote}/${s.branch}${step === "tag" ? ", HEAD is the release commit" : ""}`);
}

function guardMilestone(ctx, s, plan, mid, d) {
  if (plan.error) return verdict("G-milestone", [`the plan cannot be read (${plan.error})`]);
  const p = plan.plan;
  const m = p.milestones.find((x) => x.id === mid);
  if (!m) return verdict("G-milestone", [`${mid} is not a milestone of this plan`]);
  const problems = [];
  if (m.status !== "done") problems.push(`milestone ${mid} is ${oneLine(m.status)}, not done`);
  for (const id of m.cards) if (!isDone(cardStatus(p, id))) problems.push(`card ${oneLine(id)} is not done (${oneLine(cardStatus(p, id))})`);
  const gate = p.gateEvidence.get(mid);
  if (!gate) problems.push(`no gate evidence for ${mid} — run task:verify ${mid}`);
  else {
    for (const g of gateResults(gate).filter((x) => x.pass === false)) problems.push(`gate ${oneLine(g.id)} failed`);
    const head = String(gate.verified?.head ?? "");
    if (!RELEASE.hexHead.test(head)) problems.push(`the gate evidence of ${mid} has no commit — run task:verify ${mid}`);
    else {
      const diff = git(ctx, "diff", "--name-only", "--no-renames", "-z", head, "HEAD", "--");
      if (diff.code !== 0) problems.push(`cannot compare the gate commit with HEAD (${why(diff)}) — run task:verify ${mid}`);
      else {
        const allowed = new Set([RELEASE.changelog, RELEASE.mirror, ...d.packages.map((x) => x.file), ...s.versionFiles.filter(safeDir).map((f) => asPath(".", f))]);
        const other = diff.out.split("\0").filter((f) => f && !allowed.has(f) && !f.startsWith(RELEASE.planDir));
        if (other.length) problems.push(`${other.map(oneLine).join(", ")} changed since the gate evidence (${head.slice(0, RELEASE.shortHead)}) — run task:verify ${mid} again`);
      }
    }
  }
  return verdict("G-milestone", problems, `${mid} is done, its cards are done, no gate failed, only release files changed since the gate`);
}

/** The versions of `name` on the registry: `{ versions }` or `{ error }`; a package that is not there yet has none. */
function registryVersions(ctx, name) {
  const r = ctx.run("npm", ["view", name, "versions", "--json"]);
  if (r.code !== 0) return RELEASE.registryMissing.test(`${r.err}${r.out}`) ? { versions: [] } : { error: `the registry did not answer for ${name} (${why(r)})` };
  try {
    const v = r.out.trim() ? JSON.parse(r.out) : [];
    return { versions: (Array.isArray(v) ? v : [v]).filter((x) => num(x)) };
  } catch {
    return { error: `the registry answer for ${name} is not JSON` };
  }
}

function guardVersion(ctx, d, step) {
  const problems = [...d.problems];
  if (!problems.length && d.changelog === null) problems.push(`${RELEASE.changelog} is missing`);
  if (!problems.length && step === "prepare" && !d.next) problems.push("Unreleased is empty — nothing to release");
  if (!problems.length && step === "tag" && !d.parsed.releases.includes(d.next)) problems.push(`${RELEASE.changelog} has no section for ${d.next}`);
  if (!problems.length) {
    for (const p of d.packages) {
      const r = registryVersions(ctx, p.name);
      if (r.error) problems.push(r.error);
      else {
        const newer = r.versions.filter((v) => (compareVersions(v, d.next) ?? 1) >= 0);
        if (newer.length) problems.push(`${p.name} ${newer.at(-1)} is on the registry (the new version must be above it)`);
      }
    }
    const tag = `v${d.next}`;
    const local = git(ctx, "tag", "--list", tag);
    if (local.code !== 0) problems.push(`git tag --list failed (${why(local)})`);
    else if (local.out.trim()) problems.push(`tag ${tag} exists locally`);
    const remote = git(ctx, "ls-remote", "--tags", RELEASE.remote, `refs/tags/${tag}`);
    if (remote.code !== 0) problems.push(`the tags of ${RELEASE.remote} could not be read (${why(remote)})`);
    else if (remote.out.trim()) problems.push(`tag ${tag} exists on ${RELEASE.remote}`);
  }
  const ok = step === "tag" ? `v${d.next} is not on the registry or in any tag` : `v${d.current} → v${d.next} (${d.bump?.bump}: ${d.bump?.reason}); the registry and the tags are free`;
  return verdict("G-version", problems, ok);
}

function guardCi(ctx, s) {
  if (s.errors.ciWorkflow) return verdict("G-ci", [s.errors.ciWorkflow]);
  const head = git(ctx, "rev-parse", "HEAD");
  if (head.code !== 0) return verdict("G-ci", [`HEAD is unknown (${why(head)})`]);
  const sha = head.out.trim();
  const short = sha.slice(0, RELEASE.shortHead);
  const list = ctx.run("gh", ["run", "list", "--workflow", s.ciWorkflow, "--commit", sha, "--json", "databaseId,status,conclusion"]);
  if (list.code !== 0) return verdict("G-ci", [`gh failed (${why(list)})`]);
  let runs;
  try {
    runs = JSON.parse(list.out);
  } catch {
    return verdict("G-ci", ["gh run list did not answer with JSON"]);
  }
  const latest = Array.isArray(runs) ? runs[0] : null;
  if (!latest) return verdict("G-ci", [`no run of ${s.ciWorkflow} for ${short}`]);
  if (!Number.isSafeInteger(latest.databaseId)) return verdict("G-ci", ["gh run list gave no run id"]);
  const problems = [];
  if (latest.status !== "completed" || latest.conclusion !== "success") problems.push(`the newest run ${latest.databaseId} is ${oneLine(latest.status)}/${oneLine(latest.conclusion)}, not completed/success`);
  const view = ctx.run("gh", ["run", "view", String(latest.databaseId), "--json", "status,conclusion,jobs"]);
  let jobs = null;
  try {
    jobs = view.code === 0 ? JSON.parse(view.out).jobs : null;
  } catch {
    jobs = null;
  }
  if (!Array.isArray(jobs) || !jobs.length) problems.push(view.code === 0 ? `run ${latest.databaseId} lists no jobs` : `gh failed (${why(view)})`);
  else for (const j of jobs.filter((x) => x?.conclusion !== "success")) problems.push(`job ${oneLine(j?.name)} is ${oneLine(j?.conclusion || j?.status)}`);
  return verdict("G-ci", problems, `run ${latest.databaseId} of ${s.ciWorkflow} for ${short} succeeded in all ${jobs?.length} jobs`);
}

function guardLog(ctx, d, mid) {
  const found = readReleaseLog(readText(ctx, RELEASE_LOG) ?? "").find((e) => e.version === d.next && e.mid === mid);
  return verdict("G-log", found ? [] : [`${RELEASE_LOG} has no entry for v${d.next} (${mid}) — run --prepare first`], `${RELEASE_LOG} has the entry for v${d.next}`);
}

/** The step the dry run looks at: `tag` when HEAD is already the release commit of the package version, else `prepare`. */
export function chooseStep(ctx, mid) {
  const d = describe(ctx, "tag");
  const subject = git(ctx, "log", "-1", "--format=%s", "HEAD");
  return d.current && subject.code === 0 && subject.out.trim() === RELEASE.subject(d.current, mid) ? "tag" : "prepare";
}

/** Every guard of the step as `[{ id, ok, reason }]` — rules 4-9. Reads only; a failed read fails its guard. */
export function releaseGuards(ctx, mid, { step = "prepare" } = {}) {
  const s = settings(ctx);
  let fetched = { error: s.errors.branch };
  if (!s.errors.branch) {
    const r = git(ctx, "fetch", "--quiet", RELEASE.remote, s.branch);
    fetched = r.code === 0 ? {} : { error: why(r) };
  }
  let plan;
  try {
    plan = { plan: loadPlan(ctx.root, ctx.config) };
  } catch (e) {
    plan = { error: oneLine(e?.message) };
  }
  const d = describe(ctx, step);
  const guards = [guardSwitch(ctx, s, fetched), guardBranch(ctx, s, fetched, plan, step, d, mid), guardMilestone(ctx, s, plan, mid, d), guardVersion(ctx, d, step)];
  if (step === "tag") guards.push(guardCi(ctx, s), guardLog(ctx, d, mid));
  return guards;
}

// ── the plan ─────────────────────────────────────────────────────────────────

/** The version and what each step would do, as text; `null` when there is no version to plan. At the tag step `prepare` is empty and `done` says what --prepare already did. */
export function planRelease(ctx, mid, { step = "prepare" } = {}) {
  const d = describe(ctx, step);
  if (!d.next) return null;
  const date = (ctx.now?.() ?? new Date()).toISOString().slice(0, 10);
  const names = d.packages.map((p) => p.name);
  const gate = readJson(ctx, `${RELEASE.evidenceDir}${mid}.json`)?.verified?.head;
  const bump = d.bump ?? { bump: "none", reason: "the version in package.json" };
  const line = releaseLogLine({ version: d.next, date, mid, head: typeof gate === "string" ? gate : "", from: d.current, bump: bump.bump, reason: bump.reason });
  const entry = readReleaseLog(readText(ctx, RELEASE_LOG) ?? "").find((e) => e.version === d.next && e.mid === mid);
  const done = step === "tag" ? (entry ? releaseLogLine(entry) : `${RELEASE.subject(d.next, mid)} (no entry in ${RELEASE_LOG})`) : null;
  const prepare = step === "tag" ? [] : [
    ...d.packages.map((p) => `set version ${d.next} in ${p.file}`),
    ...d.packages.flatMap((p) => names.filter((n) => n !== p.name && RELEASE.dependencyKeys.some((k) => p.json?.[k]?.[n] !== undefined)).map((n) => `set ${n} to ${d.next} in ${p.file}`)),
    ...d.s.versionFiles.map((f) => `set version ${d.next} in ${f}`),
    `rename "## Unreleased" to "## ${d.next} — ${date}" in ${RELEASE.changelog} and add a new empty "## Unreleased" above it`,
    `append to ${RELEASE_LOG}: ${line}`,
    `git commit those files as "${RELEASE.subject(d.next, mid)}"`,
    "git push",
  ];
  const tag = [`git tag -a v${d.next} on HEAD (message: the ${RELEASE.changelog} section of ${d.next})`, `git push ${RELEASE.remote} refs/tags/v${d.next}`];
  return { version: d.next, previous: d.current, bump: bump.bump, reason: bump.reason, step, prepare, done, tag };
}

/** `task:release <M>` without a step flag: print every guard of the next step and the plan, change nothing. Returns the exit code (0 all hold · 1 one failed). */
export function runRelease(ctx, mid, { step, out }) {
  const at = step ?? chooseStep(ctx, mid);
  out(`task:release ${mid} — dry run, nothing is written (next step: ${at === "tag" ? "--tag" : "--prepare"})`);
  const guards = releaseGuards(ctx, mid, { step: at });
  for (const g of guards) out(`${g.ok ? "✓" : "✗"} ${g.id} — ${g.reason}`);
  const plan = planRelease(ctx, mid, { step: at });
  if (plan) {
    out(at === "tag" ? `version: v${plan.version} (the release commit)` : `version: v${plan.previous} → v${plan.version} (${plan.bump}: ${plan.reason})`);
    if (at === "tag") out(`--prepare already done: ${plan.done}`);
    else {
      out("--prepare would:");
      plan.prepare.forEach((a) => out(`  - ${a}`));
    }
    out("--tag would (after the CI run of the release commit is green):");
    plan.tag.forEach((a) => out(`  - ${a}`));
  }
  const failed = guards.filter((g) => !g.ok);
  out(failed.length ? `✗ ${failed.length} guard(s) failed — nothing was changed` : "✓ every guard holds — nothing was changed");
  return failed.length ? 1 : 0;
}
