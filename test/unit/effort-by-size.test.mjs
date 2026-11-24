import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { after, test } from "node:test";
import { cleanup, gitRepo, lib, tmp, write } from "../helpers.mjs";

/** Effort by card size (docs/specs/effort-by-size.md rules 1-10, scenarios EFFORT-AC-01..05). */
const { EFFORT_BY_SIZE, LOCAL_CONFIG_FILE, ROLE_LIBRARY, ConfigError, loadConfig, resolveConfig, validateConfig } = await lib("config.mjs");
const { cardEffort, variantAgents } = await lib("effort.mjs");
const { generate, refreshKitFiles } = await lib("generate.mjs");
const { docsInputFor, runDocsCheck } = await lib("docs.mjs");
const { frontmatter } = await lib("markdown.mjs");
const { parseYaml } = await lib("yaml.mjs");
after(cleanup);

const BASE = { stack: { packageManager: "none" } };
const cfg = (models = {}, extra = {}) => resolveConfig({ ...BASE, ...extra, models: { effort: "by-size", ...models } });
const read = (root, f) => readFileSync(join(root, f), "utf8");
const head = (root, f) => parseYaml(frontmatter(read(root, f)).yaml);
const project = (models) => {
  const root = gitRepo();
  generate(root, { ...BASE, models });
  return root;
};
const agentFiles = (root) => readdirSync(join(root, ".claude", "agents")).sort();
/** Every file of a generated project, as docs:check lists them (posix paths). */
function listFiles(root, dir = "") {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = posix.join(dir, e.name);
    return e.isDirectory() ? (e.name === ".git" ? [] : listFiles(root, rel)) : [rel];
  });
}
const agentIssues = (root, config) => runDocsCheck(docsInputFor(root, listFiles(root), config)).issues.filter((i) => i.file.startsWith(".claude/agents/"));

test("EFFORT-AC-01 cardEffort follows rules 3 and 4 in both modes, with and without an override", () => {
  const fixed = cfg({ effort: "fixed" });
  for (const role of Object.keys(EFFORT_BY_SIZE).filter((r) => ROLE_LIBRARY[r].core)) for (const size of ["S", "M"]) {
    const r = cardEffort(fixed, { role, size });
    assert.deepEqual([r.effort, r.agent, r.mode], [ROLE_LIBRARY[role].effort, role, "fixed"], `fixed ${role} ${size}`);
  }
  const bySize = cfg();
  for (const role of Object.keys(EFFORT_BY_SIZE).filter((r) => ROLE_LIBRARY[r].core)) for (const size of ["S", "M"]) {
    const want = EFFORT_BY_SIZE[role][size];
    const r = cardEffort(bySize, { role, size });
    assert.equal(r.effort, want, `${role} ${size}`);
    assert.equal(r.agent, want === ROLE_LIBRARY[role].effort ? role : `${role}-${want}`, `${role} ${size} agent`);
  }
  assert.deepEqual(cardEffort(bySize, { role: "implementer", size: "S" }).agent, "implementer-medium");
  assert.deepEqual(cardEffort(bySize, { role: "implementer", size: "M" }).agent, "implementer");
  assert.equal(cardEffort(bySize, { role: "implementer" }).effort, "high", "a card without size counts as M");
  const over = cfg({ overrides: { implementer: { effort: "low" } } });
  for (const size of ["S", "M"]) assert.deepEqual([cardEffort(over, { role: "implementer", size }).effort, cardEffort(over, { role: "implementer", size }).agent], ["low", "implementer"], "the override wins in every size");
  const outside = cfg({}, { roles: { enabled: ["art-producer"] } });
  assert.ok(!("art-producer" in EFFORT_BY_SIZE));
  assert.deepEqual([cardEffort(outside, { role: "art-producer", size: "S" }).effort, cardEffort(outside, { role: "art-producer", size: "S" }).agent], [ROLE_LIBRARY["art-producer"].effort, "art-producer"]);
});

test("EFFORT-AC-02 by-size planning writes one variant file per differing effort with the name, effort, model, tools and description of rule 7; fixed writes none", () => {
  const fixed = project({ effort: "fixed" });
  assert.ok(agentFiles(fixed).every((f) => !/-(low|medium|high|xhigh|max)\.md$/.test(f)), "no variant in fixed mode");
  const root = project({ effort: "by-size" });
  const config = cfg();
  const variants = variantAgents(config);
  assert.deepEqual(variants.map((v) => v.name).sort(), ["designer-medium", "implementer-medium"]);
  assert.deepEqual(agentFiles(root).filter((f) => /-medium\.md$/.test(f)), ["designer-medium.md", "implementer-medium.md"]);
  for (const v of variants) {
    const base = head(root, `.claude/agents/${v.role}.md`);
    const got = head(root, `.claude/agents/${v.name}.md`);
    assert.equal(got.name, v.name);
    assert.equal(got.effort, v.effort);
    assert.equal(got.model, base.model);
    assert.equal(got.tools, base.tools);
    assert.ok(got.description.startsWith(`Same as ${v.role} at ${v.effort} effort — use it only when task:start names it. `));
    assert.ok(got.description.endsWith(base.description), "followed by the base description");
  }
  assert.deepEqual(variantAgents(cfg({ overrides: { implementer: { effort: "low" } } })).map((v) => v.name), ["designer-medium"], "an effort override gets no variant");
  assert.deepEqual(variantAgents(cfg({ effort: "fixed" })), []);
});

test("EFFORT-AC-03 upgrade after by-size to fixed removes the unedited variant, keeps and lists the edited one, leaves base agents alone", () => {
  const root = project({ effort: "by-size" });
  const baseBefore = Object.fromEntries(["implementer", "designer", "spec-reviewer", "qa-runner"].map((r) => [r, read(root, `.claude/agents/${r}.md`)]));
  writeFileSync(join(root, ".claude/agents/designer-medium.md"), `${read(root, ".claude/agents/designer-medium.md")}\nour own line\n`);
  const raw = JSON.parse(read(root, "saf.config.json"));
  raw.models.effort = "fixed";
  write(root, "saf.config.json", raw);
  const report = refreshKitFiles(root);
  assert.ok(!existsSync(join(root, ".claude/agents/implementer-medium.md")), "unedited variant removed");
  assert.ok(report.removed.includes(".claude/agents/implementer-medium.md"));
  assert.ok(existsSync(join(root, ".claude/agents/designer-medium.md")), "edited variant kept");
  assert.deepEqual(report.kept, [".claude/agents/designer-medium.md"]);
  for (const [r, text] of Object.entries(baseBefore)) assert.equal(read(root, `.claude/agents/${r}.md`), text, `${r} untouched`);
  const manifest = JSON.parse(read(root, ".saf/manifest.json"));
  assert.ok(!(".claude/agents/implementer-medium.md" in manifest.files));
  // and back: upgrade writes a missing variant of a by-size project
  raw.models.effort = "by-size";
  write(root, "saf.config.json", raw);
  assert.ok(refreshKitFiles(root).written.includes(".claude/agents/implementer-medium.md"));
  assert.ok(existsSync(join(root, ".claude/agents/implementer-medium.md")));
});

test("EFFORT-AC-04 docs:check accepts valid variants, fails an effort or name mismatch and a variant of a disabled role; a custom role named like a variant is a config error", () => {
  const root = project({ effort: "by-size" });
  const config = cfg();
  assert.deepEqual(agentIssues(root, config), []);
  const file = ".claude/agents/designer-medium.md";
  const text = read(root, file);
  writeFileSync(join(root, file), text.replace("effort: medium", "effort: high"));
  assert.ok(agentIssues(root, config).some((i) => i.file === file && i.message.includes("effort")));
  writeFileSync(join(root, file), text.replace("name: designer-medium", "name: designer"));
  assert.ok(agentIssues(root, config).some((i) => i.file === file && i.message.includes("name")));
  writeFileSync(join(root, file), text);
  write(root, ".claude/agents/db-guardian-medium.md", text.replace("designer-medium", "db-guardian-medium"));
  assert.ok(agentIssues(root, config).some((i) => i.file === ".claude/agents/db-guardian-medium.md" && i.message.includes("not an enabled role")));
  write(root, ".claude/agents/my-helper-high.md", "---\nname: x\n---\n");
  assert.ok(!agentIssues(root, config).some((i) => i.file.includes("my-helper")), "any other extra agent file keeps today's result");
  const errors = validateConfig({ ...BASE, roles: { custom: [{ name: "implementer-medium", description: "x" }] } });
  assert.ok(errors.some((e) => e.includes("implementer-medium")), errors.join("\n"));
  assert.deepEqual(validateConfig({ ...BASE, roles: { custom: [{ name: "implementer-high", description: "x" }] } }), [], "not a variant name: the implementer role effort is high");
});

test("EFFORT-AC-05 a local by-size over a tracked fixed gives mode by-size, source local and a cardEffort warning with the base agent", () => {
  const root = tmp();
  write(root, "saf.config.json", { version: 1, ...BASE });
  write(root, LOCAL_CONFIG_FILE, { models: { effort: "by-size" } });
  const c = loadConfig(root, {});
  assert.deepEqual([c.models.effort, c.models.effortSource, c.models.effortTracked], ["by-size", "local", "fixed"]);
  const r = cardEffort(c, { role: "implementer", size: "S" });
  assert.deepEqual([r.agent, r.effort, r.mode, r.source], ["implementer", "high", "by-size", "local"]);
  assert.match(r.warning, /setup/);
  assert.match(r.warning, /by-size/);
  assert.equal(cardEffort(c, { role: "implementer", size: "M" }).warning, undefined, "no warning when the base agent is the right one");
  const tracked = tmp();
  write(tracked, "saf.config.json", { version: 1, ...BASE, models: { effort: "by-size" } });
  const t = loadConfig(tracked, {});
  assert.deepEqual([t.models.effortSource, t.models.effortTracked], ["repo", "by-size"]);
  assert.deepEqual([cardEffort(t, { role: "implementer", size: "S" }).agent, cardEffort(t, { role: "implementer", size: "S" }).warning], ["implementer-medium", undefined]);
  const none = loadConfig((() => { const d = tmp(); write(d, "saf.config.json", { version: 1, ...BASE }); return d; })(), {});
  assert.deepEqual([none.models.effort, none.models.effortSource], ["fixed", "default"]);
  const bad = tmp();
  write(bad, "saf.config.json", { version: 1, ...BASE });
  write(bad, LOCAL_CONFIG_FILE, { models: { effort: "fast" } });
  assert.throws(() => loadConfig(bad, {}), (e) => e instanceof ConfigError && e.message.includes(LOCAL_CONFIG_FILE));
});
