#!/usr/bin/env node
/**
 * create-saf — `npx create-saf [dir] [init options]` and `npm create saf` run `saf init` from the super-agent-framework
 * package. A first argument that is not an option is the target folder (same as --dir).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("super-agent-framework/package.json"));
const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith("-") && !args.includes("--dir")) args.splice(0, 1, "--dir", args[0]);
const r = spawnSync(process.execPath, [join(pkgDir, "bin", "cli.mjs"), "init", ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
