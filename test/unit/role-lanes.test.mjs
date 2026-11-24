import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, fakeCtx, lib, planRepo, tmp, write } from "../helpers.mjs";

/** roles.lanes (docs/specs/role-lanes.md): a project moves a role to the other lane. */
const { ConfigError, ROLE_LIBRARY, loadConfig, loadSchema, resolveConfig, roleTable, validateConfig } = await lib("config.mjs");
const { CHOICES, FIELD_MAX, NOT_ASKED, QUESTIONS } = await lib("choices.mjs");
const { activeMilestone, loadPlan } = await lib("plan.mjs");
const { laneOf, pickParallel } = await lib("parallel.mjs");
const task = await lib("task.mjs");
after(cleanup);

const ART = "T-M1-01";
const IMPL = "T-M1-02";
const cfg = (lanes, extra = {}) => ({ roles: { enabled: ["art-producer"], ...(lanes ? { lanes } : {}) }, workflow: { lanes: { code: 2, main: 1 } }, ...extra });
/** An art-producer card and an implementer card on separate files. */
const repo = (config) =>
  planRepo({ config, cards: [{ id: ART, role: "art-producer", touch: ["art/**"] }, { id: IMPL, role: "implementer", touch: ["src/**"] }] });
const pick = (r) => {
  const plan = loadPlan(r.root, r.config);
  return pickParallel(plan, activeMilestone(plan));
};

test("RLANE-AC-01 a moved art-producer card is picked into the code lane beside an implementer card; without the setting it is in the main lane", async () => {
  const moved = pick(await repo(cfg({ "art-producer": "code" })));
  assert.deepEqual([moved.parallel.code, moved.parallel.main], [[ART, IMPL], []]);
  const plain = pick(await repo(cfg()));
  assert.deepEqual([plain.parallel.code, plain.parallel.main], [[IMPL], [ART]]);
  assert.deepEqual(pick(await repo(cfg({ "art-producer": "main" }))).parallel, plain.parallel, "the library lane written out changes nothing");
});

test("RLANE-AC-02 startCard --worktree opens a lane for the moved role; without the setting it is refused with the code-lane message", async () => {
  const r = await repo(cfg({ "art-producer": "code" }));
  const ev = task.startCard(fakeCtx(r.root, r.config), ART, { worktree: true });
  assert.equal(ev.lane, 1);
  assert.ok(existsSync(join(r.root, ev.worktree)), "the worktree folder exists");
  const next = task.startCard(fakeCtx(r.root, r.config), IMPL, { worktree: true });
  assert.equal(next.lane, 2, "the implementer card opens the second lane beside it");
  const plain = await repo(cfg());
  assert.throws(() => task.startCard(fakeCtx(plain.root, plain.config), ART, { worktree: true }), /--worktree is for code-lane cards of the root repo only \(T-M1-01 role: art-producer/);
});

test("RLANE-AC-03 an implementer moved to main: at most one of two cards is picked, --worktree is refused and a second main-folder start is refused", async () => {
  const r = await planRepo({ config: { roles: { lanes: { implementer: "main" } }, workflow: { lanes: { code: 2, main: 1 } } }, cards: [{ id: ART, touch: ["a/**"] }, { id: IMPL, touch: ["b/**"] }] });
  const p = pick(r);
  assert.deepEqual([p.parallel.code, p.parallel.main], [[], [ART]]);
  assert.match(p.skipped.find((s) => s.id === IMPL).reason, /main-folder lane is full/);
  assert.throws(() => task.startCard(fakeCtx(r.root, r.config), ART, { worktree: true }), /--worktree is for code-lane cards/);
  task.startCard(fakeCtx(r.root, r.config), ART);
  assert.throws(() => task.startCard(fakeCtx(r.root, r.config), IMPL), /one folder works one card at a time/);
});

const raw = (lanes, custom) => ({ version: 1, roles: { ...(custom ? { custom } : {}), lanes } });

test("RLANE-AC-04 validateConfig gives one error per bad key (locked, custom, unknown, value) and loadConfig refuses the file", () => {
  const custom = [{ name: "scribe", description: "writes" }];
  const lanes = { designer: "code", "spec-reviewer": "code", "release-operator": "code", scribe: "code", ghost: "code", implementer: "side", "qa-runner": "main", "art-producer": "code" };
  const errors = validateConfig(raw(lanes, custom));
  assert.equal(errors.length, 6, errors.join("\n"));
  for (const k of ["designer", "spec-reviewer", "release-operator"]) assert.equal(errors.filter((e) => e.includes(`roles.lanes.${k}`) && /fixed/.test(e)).length, 1, k);
  assert.equal(errors.filter((e) => e.includes("roles.lanes.scribe") && e.includes("roles.custom[].lane")).length, 1);
  assert.equal(errors.filter((e) => e.includes("roles.lanes.ghost") && /not a role of the library/.test(e)).length, 1);
  assert.equal(errors.filter((e) => e.includes("roles.lanes.implementer") && e.includes('must be one of "code", "main"')).length, 1);
  assert.deepEqual(validateConfig(raw({ "qa-runner": "main", "art-producer": "code", "content-writer": "main" })), []);
  assert.deepEqual(validateConfig(raw({})), []);
  const inherited = validateConfig(JSON.parse('{"version":1,"roles":{"lanes":{"constructor":"code","toString":"main","__proto__":"code","hasOwnProperty":"code"}}}'));
  assert.equal(inherited.filter((e) => /not a role of the library/.test(e)).length, 4, inherited.join("\n"));
  assert.deepEqual(roleTable(resolveConfig({ roles: { enabled: ["constructor"] } })).map((r) => r.name).filter((n) => n === "constructor"), [], "an inherited property name is not a role");
  assert.ok(validateConfig({ version: 1, roles: { lanes: ["code"] } }).length > 0, "an array is not a map");
  const root = tmp();
  write(root, "saf.config.json", raw({ designer: "code", ghost: "main" }));
  assert.throws(() => loadConfig(root, {}), (e) => e instanceof ConfigError && e.message.includes("roles.lanes.designer") && e.message.includes("roles.lanes.ghost"));
  write(root, "saf.config.json", raw({ "art-producer": "code" }));
  assert.deepEqual(loadConfig(root, {}).roles.lanes, { "art-producer": "code" });
  assert.deepEqual(loadSchema().properties.roles.properties.lanes, { type: "object", additionalProperties: { enum: ["code", "main"] } });
  assert.deepEqual(Object.keys(ROLE_LIBRARY).filter((r) => ROLE_LIBRARY[r].laneLocked), ["designer", "spec-reviewer", "release-operator"]);
});

test("RLANE-AC-05 with worktrees off or lanes.code 0 every card is in the main lane, whatever roles.lanes says; a key for a role that is not enabled has no effect", async () => {
  for (const workflow of [{ worktrees: false, lanes: { code: 2, main: 1 } }, { lanes: { code: 0, main: 1 } }]) {
    const r = await repo({ roles: { enabled: ["art-producer"], lanes: { "art-producer": "code" } }, workflow });
    const plan = loadPlan(r.root, r.config);
    assert.deepEqual([laneOf(plan, plan.cards.get(ART)), laneOf(plan, plan.cards.get(IMPL))], ["main", "main"], JSON.stringify(workflow));
    assert.equal(pick(r).parallel.code.length, 0);
  }
  const off = resolveConfig({ roles: { lanes: { "art-producer": "code" } } });
  assert.ok(!roleTable(off).some((r) => r.name === "art-producer"));
  assert.equal(roleTable(resolveConfig({ roles: { enabled: ["art-producer"], lanes: { "art-producer": "code" } } })).find((r) => r.name === "art-producer").lane, "code");
});

test("RLANE-AC-05 roleTable: the setting wins over the library lane and the tier default, a custom role keeps its own lane field, and a lane card already open keeps its lane evidence when its role moves to main", async () => {
  const c = resolveConfig({ roles: { enabled: ["db-guardian"], custom: [{ name: "scribe", description: "writes", tier: "planner", lane: "code" }, { name: "plain", description: "builds" }], lanes: { "db-guardian": "main" } } });
  const lane = (n) => roleTable(c).find((r) => r.name === n).lane;
  assert.deepEqual(["db-guardian", "scribe", "plain", "implementer", "designer"].map(lane), ["main", "code", "code", "code", "main"]);
  const r = await repo(cfg({ "art-producer": "code" }));
  const ev = task.startCard(fakeCtx(r.root, r.config), ART, { worktree: true });
  const moved = { ...r.config, roles: { ...r.config.roles, lanes: { "art-producer": "main" } } };
  const plan = loadPlan(r.root, moved);
  assert.equal(laneOf(plan, plan.cards.get(ART)), "main");
  assert.equal(plan.evidence.get(ART).lane, ev.lane, "the evidence keeps the lane label that task:merge reads");
});

test("RLANE-AC-01 side cards of a moved role follow the same lane", async () => {
  const r = await planRepo({
    config: cfg({ "art-producer": "code" }, { workflow: { lanes: { code: 3, main: 1 } } }),
    cards: [{ id: IMPL, touch: ["src/**"] }, { id: "T-M2-01", role: "art-producer", touch: ["site/**"] }],
    extra: [{ id: "M2", status: "planned", cards: ["T-M2-01"], sideCards: ["T-M2-01"] }],
  });
  const p = pick(r);
  assert.deepEqual([p.parallel.code, p.parallel.main, p.side], [[IMPL, "T-M2-01"], [], ["T-M2-01"]]);
});

const cli = (...args) => spawnSync(process.execPath, [join(REPO, "kit", "tools-saf", "bin", "saf.mjs"), "choices", ...args], { cwd: tmp(), encoding: "utf8" });
const entry = (q, v) => CHOICES.find((e) => e.question === q && e.values.includes(v));
const text = (e, l) => Object.values(e[l]).join(" ");

test("RLANE-AC-06 choices --group 6 prints role-lanes in en and th within FIELD_MAX, role-lanes is asked and in questions.md, and the movable roles say 'by default'", () => {
  const q = QUESTIONS.find((x) => x.id === "role-lanes");
  assert.deepEqual([q.group, q.kind, q.keys], [6, "value", ["roles.lanes"]]);
  assert.ok(!("roles.lanes" in NOT_ASKED));
  const e = CHOICES.filter((x) => x.question === "role-lanes");
  assert.equal(e.length, 1);
  for (const lang of ["en", "th"]) {
    for (const f of ["what", "good", "cost", "when"]) {
      assert.ok(e[0][lang][f].length > 0 && e[0][lang][f].length <= FIELD_MAX, `${lang} ${f}`);
      assert.doesNotMatch(e[0][lang][f], /\d\d|claude-/);
    }
    const out = cli("--group", "6", "--lang", lang);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(out.stdout.includes("roles.lanes") && Object.values(e[0][lang]).every((t) => out.stdout.includes(t)), lang);
  }
  const keyRow = readFileSync(join(REPO, "kit", "claude", "skills", "saf-setup", "questions.md"), "utf8").split(/\r?\n/).find((l) => l.startsWith("|") && l.includes("`roles.lanes`"));
  assert.ok(keyRow && /leave empty/.test(keyRow) && /worktree lanes are on/.test(keyRow) && /any library role/.test(keyRow) && /custom role sets its own `lane`/.test(keyRow));
  for (const role of Object.keys(ROLE_LIBRARY).filter((r) => !ROLE_LIBRARY[r].core)) {
    const x = entry("extra-roles", role);
    for (const [lang, by] of [["en", /by default/i], ["th", /โดยปกติ/]]) {
      const says = /main folder|โฟลเดอร์หลักทีละใบ/.test(text(x, lang));
      if (says && !ROLE_LIBRARY[role].laneLocked) assert.match(text(x, lang), by, `${role} ${lang}`);
      assert.doesNotMatch(text(x, lang), /never in a parallel lane|ไม่ขนานใน lane/, `${role} ${lang}`);
    }
  }
  assert.match(text(entry("extra-roles", "art-producer"), "en"), /roles\.lanes/);
  assert.match(text(entry("extra-roles", "art-producer"), "th"), /roles\.lanes/);
});

test("RLANE-AC-07 roles.md and config-reference.md name roles.lanes, and the locked roles roles.md lists equal the laneLocked roles of ROLE_LIBRARY", () => {
  const read = (f) => readFileSync(join(REPO, "docs", f), "utf8").replace(/\r\n/g, "\n");
  const roles = read("roles.md");
  assert.ok(roles.includes("## Moving a role to the other lane") && roles.includes("`roles.lanes`"));
  assert.ok(read("config-reference.md").includes("`lanes`") && read("config-reference.md").includes("roles.md#moving-a-role-to-the-other-lane"));
  const bullet = roles.split("\n").find((l) => l.startsWith("- **Locked roles.**"));
  const listed = [...bullet.split("cannot move")[0].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, Object.keys(ROLE_LIBRARY).filter((r) => ROLE_LIBRARY[r].laneLocked).sort());
  assert.match(read("card-lifecycle.md"), /By default the roles of the main-folder lane[\s\S]*submodule cards, which cannot move[\s\S]*library role other than designer/);
  assert.match(roles, /committed on the lane branch/);
});
