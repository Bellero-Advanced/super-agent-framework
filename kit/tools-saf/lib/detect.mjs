import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Looks at a project folder and proposes stack answers (the setup interview shows them as recommended defaults).
 * Read only. Never reads env files.
 */

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const DB_HINTS = [
  ["postgres", ["pg", "postgres", "drizzle-orm", "@neondatabase/serverless", "pg-promise", "slonik"]],
  ["postgres (Supabase)", ["@supabase/supabase-js"]],
  ["prisma", ["prisma", "@prisma/client"]],
  ["mysql", ["mysql", "mysql2"]],
  ["mongodb", ["mongodb", "mongoose"]],
  ["sqlite", ["sqlite3", "better-sqlite3"]],
  ["redis", ["redis", "ioredis"]],
];

const FRAMEWORKS = ["next", "react", "vue", "svelte", "@sveltejs/kit", "nuxt", "astro", "solid-js", "preact", "angular", "@angular/core", "express", "fastify", "koa", "hono", "@nestjs/core", "phaser", "pixi.js", "three", "react-native", "expo", "electron", "vite", "vitest", "jest", "playwright", "@playwright/test", "cypress", "typescript", "eslint", "biome", "@biomejs/biome"];

export function detectProject(root) {
  const has = (f) => existsSync(join(root, f));
  const pkg = has("package.json") ? readJson(join(root, "package.json")) : null;
  const scripts = pkg?.scripts ?? {};
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  let pm = "none";
  if (has("pnpm-lock.yaml") || has("pnpm-workspace.yaml")) pm = "pnpm";
  else if (has("bun.lockb") || has("bun.lock")) pm = "bun";
  else if (has("yarn.lock")) pm = "yarn";
  else if (has("package-lock.json") || pkg) pm = "npm";
  if (typeof pkg?.packageManager === "string") {
    const m = pkg.packageManager.match(/^(pnpm|npm|yarn|bun)@/);
    if (m) pm = m[1];
  }
  const languages = [];
  if (has("tsconfig.json") || deps.typescript) languages.push("TypeScript");
  else if (pkg) languages.push("JavaScript");
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) languages.push("Python");
  if (has("go.mod")) languages.push("Go");
  if (has("Cargo.toml")) languages.push("Rust");
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) languages.push("Java/Kotlin");
  if (has("Gemfile")) languages.push("Ruby");
  if (has("composer.json")) languages.push("PHP");
  if (has("pubspec.yaml")) languages.push("Dart/Flutter");
  const database = [];
  for (const [name, list] of DB_HINTS) if (list.some((d) => deps[d])) database.push(name);
  if (has("supabase") && !database.some((d) => d.includes("Supabase"))) database.push("postgres (Supabase)");
  if (has("prisma/schema.prisma") && !database.includes("prisma")) database.push("prisma");
  const run = (s) => ({ pnpm: `pnpm ${s}`, yarn: `yarn ${s}`, bun: `bun run ${s}`, npm: s === "test" ? "npm test" : `npm run ${s}`, none: "" })[pm];
  const pick = (...names) => {
    const n = names.find((x) => scripts[x]);
    return n ? run(n) : "";
  };
  const commands = {
    typecheck: pick("typecheck", "type-check", "tsc", "check-types") || (languages.includes("TypeScript") && pm !== "none" ? `${pm === "npm" ? "npx" : pm === "pnpm" ? "pnpm exec" : pm === "yarn" ? "yarn" : "bunx"} tsc --noEmit` : ""),
    lint: pick("lint"),
    test: pick("test", "test:unit") || (has("pyproject.toml") || has("pytest.ini") ? "pytest" : has("go.mod") ? "go test ./..." : has("Cargo.toml") ? "cargo test" : ""),
    e2e: pick("e2e", "test:e2e"),
    build: pick("build") || (has("go.mod") ? "go build ./..." : has("Cargo.toml") ? "cargo build" : ""),
  };
  const existing = {
    claudeMd: has("CLAUDE.md"),
    claudeDir: has(".claude"),
    agents: has(".claude/agents") ? readdirSync(join(root, ".claude/agents")).filter((f) => f.endsWith(".md")) : [],
    commands: has(".claude/commands") ? readdirSync(join(root, ".claude/commands")).filter((f) => f.endsWith(".md")) : [],
    docsIndex: has("docs/INDEX.md"),
    decisions: has("docs/DECISIONS.md"),
    plan: has("docs/plan"),
    safConfig: has("saf.config.json"),
  };
  return {
    name: (typeof pkg?.name === "string" && pkg.name.replace(/^@[^/]+\//, "")) || basename(root),
    description: typeof pkg?.description === "string" ? pkg.description : "",
    git: has(".git"),
    packageJson: !!pkg,
    packageManager: pm,
    monorepo: has("pnpm-workspace.yaml") || Array.isArray(pkg?.workspaces) || !!pkg?.workspaces?.packages || has("turbo.json") || has("nx.json"),
    submodules: has(".gitmodules"),
    languages,
    frameworks: FRAMEWORKS.filter((f) => deps[f]),
    database: database.length ? database.join(", ") : "none",
    commands,
    scripts: Object.keys(scripts),
    existing,
    adopt: !!pkg || existing.claudeMd || existing.claudeDir || existing.docsIndex || has("src"),
  };
}
