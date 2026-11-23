#!/usr/bin/env node
/**
 * Test runner that works the same on every OS: lists the test files itself (no shell globbing — cmd.exe does not expand
 * `*`) and hands them to `node --test`.
 *
 *   node scripts/test.mjs            unit + e2e
 *   node scripts/test.mjs unit       one suite (unit · e2e · package)
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ["unit", "e2e"];
const files = suites.flatMap((s) =>
  readdirSync(join(ROOT, "test", s))
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => relative(ROOT, join(ROOT, "test", s, f))),
);
const r = spawnSync(process.execPath, ["--test", ...files], { cwd: ROOT, stdio: "inherit" });
process.exit(r.status ?? 1);
