#!/usr/bin/env node
/**
 * Read-only checks that a release step really happened — used as "Done when" commands of the release cards.
 * Never publishes, tags or uploads anything.
 *
 *   node scripts/release-check.mjs npm       both packages are on npm at the version in package.json
 *   node scripts/release-check.mjs tag       the tag v<version> exists locally and on origin
 *   node scripts/release-check.mjs release   a GitHub release v<version> exists (needs gh)
 *   node scripts/release-check.mjs social    the repository has a custom social preview (needs gh)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const REPO = "Bellero-Advanced/super-agent-framework";
const tag = `v${version}`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}`.trim(), err: `${r.stderr ?? ""}`.trim() };
}

const checks = {
  npm: () => ["super-agent-framework", "create-saf"].map((pkg) => {
    const r = run("npm", ["view", `${pkg}@${version}`, "version"]);
    return [r.ok && r.out === version, `${pkg}@${version} on npm`];
  }),
  tag: () => [
    [run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok, `tag ${tag} exists locally`],
    [run("git", ["ls-remote", "--exit-code", "--tags", "origin", tag]).ok, `tag ${tag} is on origin`],
  ],
  release: () => [[run("gh", ["release", "view", tag, "--repo", REPO]).ok, `GitHub release ${tag}`]],
  social: () => {
    const r = run("gh", ["api", "graphql", "-f", `query={repository(owner:"Bellero-Advanced",name:"super-agent-framework"){usesCustomOpenGraphImage}}`, "--jq", ".data.repository.usesCustomOpenGraphImage"]);
    return [[r.ok && r.out === "true", "custom social preview uploaded (Settings → General → Social preview)"]];
  },
};

const what = process.argv[2];
if (!checks[what]) {
  process.stderr.write(`usage: node scripts/release-check.mjs ${Object.keys(checks).join("|")}\n`);
  process.exit(2);
}
let failed = 0;
for (const [ok, label] of checks[what]()) {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
