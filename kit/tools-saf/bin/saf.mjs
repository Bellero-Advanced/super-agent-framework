#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_FILE, ConfigError, findRoot, loadConfig, scriptCommand, validateConfig } from "../lib/config.mjs";
import { detectProject } from "../lib/detect.mjs";
import { docsInputFor, runDocsCheck } from "../lib/docs.mjs";
import { listRepoFiles } from "../lib/git.mjs";
import { blockingGaps, buildMatrix, completeGaps, renderMatrix, summarize } from "../lib/matrix.mjs";
import { EXIT_REFUSED, lockPathFor, measureStatus, runMeasured } from "../lib/measure.mjs";
import { LANE_NAME, laneOf, pickParallel, startableCards } from "../lib/parallel.mjs";
import { CARD_ID, activeCards, activeMilestone, cardStatus, loadPlan, titleOf } from "../lib/plan.mjs";
import { renderReport, reportPath } from "../lib/report.mjs";
import { taskRunner } from "../lib/run.mjs";
import { scanSecrets } from "../lib/secrets.mjs";
import {
  MergeStop,
  StartIncomplete,
  TaskError,
  abandonCard,
  checkStop,
  evidencePath,
  laneEnvLines,
  laneFolder,
  mergeCard,
  refuseInLane,
  runProbe,
  sessionStartText,
  startCard,
  stateCheck,
  verifyCard,
  verifyMilestone,
  writeGenerated,
} from "../lib/task.mjs";

/**
 * SAF engine CLI (vendored in the project at tools/saf/, no dependencies, Node ≥ 20).
 * Usually called through package scripts (task:start …) — see docs/plan/README.md.
 *
 *   task start <id> [--base <commit>] [--restart] [--worktree [--resume]]
 *   task verify <id|M>  [--verbose]        card: the only way to "done" · milestone: exit gates
 *   task abandon <id> · task merge <id>    (merge exit 3 refused · 4 conflict · 5 merge checks failed)
 *   task state [--check] · task next [--parallel] [--json] · task probe [--bin <claude>] · task env · task report <M>
 *   hook session-start · hook check-stop    (Claude Code hooks)
 *   docs-check · spec-matrix [--check] [--complete=a,b] · check-secrets
 *   measure <name> -- <command…> · measure --status
 *   setup --answers <file.json> [--adopt|--no-adopt] · detect · config --check · version
 *
 * A lone `--` (npm passes arguments after it) is ignored everywhere except `measure`, where it separates the command.
 */

const rawArgv = process.argv.slice(2);
const argv = rawArgv.filter((a) => a !== "--");
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

function ctxFor(root, config, verbose = false) {
  return {
    root,
    config,
    run: taskRunner(root, { onOutput: verbose ? (s) => process.stderr.write(s) : undefined, timeoutMs: config.workflow.commandTimeoutMs }),
    // workflow.laneInstall comes from the project's own saf.config.json (same trust as package.json scripts)
    runSync: (command, cwd) => spawnSync(command, { cwd, shell: true, stdio: ["ignore", "inherit", "inherit"] }).status ?? 1,
    log: err,
  };
}

function cardReport(ev, inLane) {
  const v = ev.verified;
  if (!v) return [];
  const lines = [
    v.pass
      ? `✓ ${ev.id} passed — ${v.commands.length} command(s) · ${v.files.changed.length} file(s) changed (all inside touch)${v.scenarios.required.length ? ` · scenarios ${v.scenarios.required.join(", ")} have tests` : ""}`
      : `✗ ${ev.id} did not pass (attempt ${ev.attempts}) — not recorded as done`,
  ];
  const failed = v.commands.filter((c) => c.exit !== 0);
  if (failed.length) lines.push(`  failed commands: ${failed.map((c) => `${c.cmd} (exit ${c.exit})`).join(" · ")}`);
  if (v.files.outside.length) lines.push(`  files outside touch: ${v.files.outside.join(" · ")}`);
  if (v.files.forbidden.length) lines.push(`  files in dont_touch: ${v.files.forbidden.join(" · ")}`);
  if (v.scenarios.missing.length) lines.push(`  scenarios without a test that has the id in its name: ${v.scenarios.missing.join(", ")}`);
  lines.push(`  evidence: ${evidencePath(ev.id)} · ${inLane ? "written on the lane branch only (STATE.md + .saf/plan.md are rebuilt in the main folder)" : "STATE.md + .saf/plan.md updated"}`);
  return lines;
}

const readStdin = () => {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

async function task(sub, rest) {
  const root = findRoot();
  const config = loadConfig(root);
  const flag = (n) => rest.includes(n);
  const option = (n) => {
    const i = rest.indexOf(n);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = () => rest.find((a, i) => !a.startsWith("--") && !["--base", "--bin"].includes(rest[i - 1] ?? ""));
  const c = (s, a) => scriptCommand(config.stack.packageManager, s, a);
  const requireId = () => {
    const id = positional();
    if (!id) throw new TaskError(`give an id, e.g. ${c(`task:${sub}`, sub === "report" ? "M1" : "T-M1-01")}`);
    return id;
  };
  const ctx = ctxFor(root, config, flag("--verbose"));
  switch (sub) {
    case "start": {
      const id = requireId();
      const ev = startCard(ctx, id, { base: option("--base"), restart: flag("--restart"), worktree: flag("--worktree"), resume: flag("--resume") });
      const card = loadPlan(root, config).cards.get(id);
      out(`▶ started ${id} ${card?.title ?? ""}`);
      if (ev.lane) out(`  lane ${ev.lane} · branch ${ev.branch} · worktree ${ev.worktree} (evidence committed in the main folder)`);
      const dirty = Object.keys(ev.started.dirty).length;
      out(`  files are compared with commit ${ev.started.base.slice(0, 7)}${dirty ? ` · ${dirty} file(s) already changed before do not count (unless edited again)` : ""}`);
      out(`  may touch: ${card?.touch.join(" · ")}`);
      out(`  criteria: ${card?.criteria.join(" · ")}`);
      out(`  when done run: ${c("task:verify", id)}`);
      return 0;
    }
    case "verify": {
      const id = requireId();
      if (!CARD_ID.test(id) && /^M\d+$/.test(id)) {
        const r = await verifyMilestone(ctx, id);
        out(r.pass ? `✓ exit gates of ${id}: every machine-checked gate passed · all cards done` : `✗ exit gates of ${id} not passed`);
        for (const g of r.evidence.verified.gates) out(`  ${g.pass === null ? "·" : g.pass ? "✓" : "✗"} ${g.id}${g.pass === null ? " manual check" : ""}`);
        if (r.openCards.length) out(`  cards not done: ${r.openCards.join(", ")}`);
        out(`  evidence: ${evidencePath(id)}`);
        return r.pass ? 0 : 1;
      }
      const ev = await verifyCard(ctx, id);
      for (const l of cardReport(ev, laneFolder(root, loadPlan(root, config)) !== null)) out(l);
      return ev.status === "done" ? 0 : 1;
    }
    case "abandon": {
      const id = requireId();
      const l = abandonCard(ctx, id);
      out(`${id} is "not started" again${l ? ` (abandon of lane ${l.lane} committed in the main folder)` : ""}`);
      if (l) out(`  not deleted — decide yourself: worktree ${l.worktree}${l.worktreeExists ? "" : " (gone)"} · branch ${l.branch}${l.unmerged === null ? " (gone)" : ` · ${l.unmerged} unmerged commit(s)`}`);
      return 0;
    }
    case "merge": {
      const id = requireId();
      const r = await mergeCard(ctx, id);
      out(`✓ merged ${id} — commit ${r.commit.slice(0, 7)} (not pushed)`);
      out(`  merge checks passed: ${r.checks.join(" · ") || "(none configured)"} · STATE.md + .saf/plan.md rebuilt in the same commit`);
      for (const w of r.warnings) err(`  ⚠ ${w}`);
      if (r.next) out(`  can start next (task:next --parallel): code lane ${r.next.parallel.code.join(", ") || "none"} · main-folder lane ${r.next.parallel.main.join(", ") || "none"}`);
      return 0;
    }
    case "state": {
      if (flag("--check")) {
        const r = stateCheck(ctx);
        for (const i of r.issues) err(`✗ ${i}`);
        for (const f of r.stale) err(`✗ ${f} does not match plan + evidence — run ${c("task:state")} and commit`);
        if (r.issues.length || r.stale.length) return 1;
        out(laneFolder(root, loadPlan(root, config)) ? "✓ plan is valid (lane worktree — state files are not compared here)" : "✓ plan is valid · STATE.md and .saf/plan.md match plan + evidence");
        return 0;
      }
      const plan = loadPlan(root, config);
      const lane = laneFolder(root, plan);
      if (lane) {
        out(`nothing written — this folder is the worktree of lane ${lane.lane}, card ${lane.card} · state files are built in the main folder`);
        return 0;
      }
      for (const i of plan.issues) err(`✗ ${i}`);
      const changed = writeGenerated(root, plan);
      out(changed.length ? `rewritten: ${changed.join(" · ")}` : "STATE.md and .saf/plan.md are up to date");
      return plan.issues.length ? 1 : 0;
    }
    case "next": {
      const plan = loadPlan(root, config);
      const m = activeMilestone(plan);
      if (!m) {
        err("✗ no milestone is status: active — no card to pick");
        return 1;
      }
      if (plan.issues.length) throw new TaskError(["the plan has problems — no proposal until fixed:", ...plan.issues.map((i) => `  ✗ ${i}`)].join("\n"));
      const label = (id) => `${id} ${titleOf(plan, id)}`;
      if (!flag("--parallel")) {
        const startable = startableCards(plan, m);
        const active = activeCards(plan).map((x) => x.id);
        if (flag("--json")) out(JSON.stringify({ milestone: m.id, startable, active }, null, 2));
        else {
          out(`${m.id} — ${startable.length} card(s) can start:`);
          for (const id of startable) out(`  ${label(id)}`);
          out(`in progress: ${active.length ? active.map(label).join(" · ") : "none"}`);
        }
        return 0;
      }
      const r = pickParallel(plan, m);
      if (flag("--json")) {
        out(JSON.stringify({ milestone: m.id, ...r }, null, 2));
        return 0;
      }
      out(`${m.id} — set that can start together (read only · starts nothing)`);
      out(`in progress: ${r.active.length ? r.active.map((id) => `${label(id)} [${LANE_NAME[laneOf(plan, plan.cards.get(id))]}]`).join(" · ") : "none"}`);
      for (const lane of ["code", "main"]) {
        out(`${LANE_NAME[lane]}:${r.parallel[lane].length ? "" : " none"}`);
        for (const id of r.parallel[lane]) out(`  ✓ ${label(id)}`);
      }
      if (r.blocked) out(`blocked: ${r.blocked}`);
      for (const s of r.skipped) out(`  · ${s.id} — ${s.reason}`);
      return 0;
    }
    case "probe": {
      const r = await runProbe(ctx, { bin: option("--bin") });
      const short = (s) => s.split("\n").slice(0, 3).join(" ⏎ ").slice(0, 300);
      out(`${r.pass ? "✓" : "✗"} probe: fresh session without tools — expected ${r.expected} · ${(r.ms / 1000).toFixed(1)}s`);
      out(`  ${r.main.knows ? "✓" : "✗"} with hooks: ${r.main.knows ? "correct" : `wrong (exit ${r.main.exit})`} — ${short(r.main.out)}`);
      out(`  ${r.control.blind ? "✓" : "✗"} all hooks off: ${r.control.blind ? "cannot answer (as expected) → the answer above came from the SessionStart hook" : r.control.exit ? `did not run (exit ${r.control.exit})` : "still answers → the information leaks from elsewhere (e.g. CLAUDE.md), so the hook is not proven"} — ${short(r.control.out)}`);
      return r.pass ? 0 : 1;
    }
    case "env": {
      for (const line of laneEnvLines(config, laneFolder(root, loadPlan(root, config))?.lane ?? null)) out(line);
      return 0;
    }
    case "report": {
      refuseInLane(ctx, "task:report");
      const id = requireId();
      const plan = loadPlan(root, config);
      if (!plan.milestones.some((m) => m.id === id)) throw new TaskError(`no milestone ${id}`);
      const read = (rel) => readFileSync(join(root, rel), "utf8");
      const text = renderReport({ plan, files: listRepoFiles(root), read }, id);
      const file = join(root, reportPath(id));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      out(`wrote ${reportPath(id)}`);
      return 0;
    }
    default:
      err("usage: task start|verify|abandon|merge|state|next|probe|env|report — see docs/plan/README.md");
      return 2;
  }
}

async function main() {
  const [cmd = "", sub = "", ...more] = argv;
  switch (cmd) {
    case "task":
      return task(sub, more);
    case "hook": {
      const root = findRoot();
      const config = loadConfig(root);
      const ctx = ctxFor(root, config);
      if (sub === "session-start") {
        process.stdout.write(sessionStartText(ctx));
        return 0;
      }
      if (sub === "check-stop") {
        let input = {};
        try {
          input = JSON.parse(readStdin() || "{}") ?? {};
        } catch {
          input = {};
        }
        const guidance = checkStop(ctx, input);
        if (guidance) out(JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: guidance } }));
        return 0;
      }
      err("usage: hook session-start|check-stop");
      return 2;
    }
    case "docs-check": {
      const root = findRoot();
      const config = loadConfig(root);
      const r = runDocsCheck(docsInputFor(root, listRepoFiles(root), config));
      const sorted = [...r.issues].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
      for (const w of r.warnings) err(`! ${w.file} — ${w.message}`);
      for (const i of sorted) err(`✗ ${i.file}${i.line ? `:${i.line}` : ""} — ${i.message}`);
      const summary = `${r.stats.markdown} markdown file(s) · ${r.stats.links} local link(s) · ${r.stats.commands} command(s) in agent docs · ${r.stats.agents} agent(s)`;
      if (sorted.length) {
        err(`\n✗ docs:check failed at ${sorted.length} place(s) (${summary})`);
        return 1;
      }
      out(`✓ docs:check passed — ${summary}${r.warnings.length ? ` · ${r.warnings.length} warning(s)` : ""}`);
      return 0;
    }
    case "spec-matrix": {
      const root = findRoot();
      const config = loadConfig(root);
      const rest = [sub, ...more].filter(Boolean);
      const check = rest.includes("--check");
      const completeArg = rest.find((a) => a.startsWith("--complete="));
      const complete = completeArg ? completeArg.slice(11).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
      const plan = loadPlan(root, config);
      const matrix = buildMatrix({ files: listRepoFiles(root), read: (rel) => readFileSync(join(root, rel), "utf8"), cards: [...plan.cards.values()], status: (id) => cardStatus(plan, id) });
      out(`${matrix.rows.length ? renderMatrix(matrix) : "(no acceptance scenarios in docs/specs/ yet)"}\n\n${summarize(matrix)}`);
      if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Scenario ↔ test\n\n${renderMatrix(matrix)}\n\n${summarize(matrix)}\n`, { flag: "a" });
      let failed = false;
      for (const i of matrix.issues) {
        err(`✗ ${i.file}${i.line ? `:${i.line}` : ""} — ${i.message}`);
        failed = true;
      }
      if (check) {
        for (const r of blockingGaps(matrix)) {
          err(`✗ ${r.id} (${r.spec}:${r.line}) has no test — card ${r.cards.filter((x) => x.status !== "todo").map((x) => x.id).join(", ")} has started`);
          failed = true;
        }
      }
      if (complete) {
        const { unknown, missing } = completeGaps(matrix, complete);
        for (const n of unknown) err(`✗ --complete: no spec "${n}" in docs/specs/`);
        for (const r of missing) err(`✗ ${r.id} (${r.spec}:${r.line}) has no test — this spec must be complete`);
        if (!complete.length || unknown.length || missing.length) failed = true;
      }
      return failed ? 1 : 0;
    }
    case "check-secrets": {
      const root = findRoot();
      const config = loadConfig(root);
      const r = scanSecrets(root, listRepoFiles(root), config);
      for (const f of r.findings) err(`[FAIL] ${f.file}${f.line ? `:${f.line}` : ""} — ${f.kind} (value hidden)`);
      if (r.findings.length) {
        err(`✗ check-secrets: ${r.findings.length} finding(s) in ${r.scanned} scanned file(s)`);
        return 1;
      }
      out(`✓ check-secrets: 0 findings in ${r.scanned} scanned file(s)`);
      return 0;
    }
    case "measure": {
      const root = findRoot();
      const config = loadConfig(root);
      if (rawArgv.includes("--status")) {
        out(measureStatus(lockPathFor(root)));
        return 0;
      }
      const dash = rawArgv.indexOf("--");
      if (!sub || sub.startsWith("-") || dash < 0) {
        err("usage: measure <name> -- <command…> · measure --status");
        return EXIT_REFUSED;
      }
      return runMeasured({ root, config, name: sub, argv: rawArgv.slice(dash + 1) });
    }
    case "setup": {
      const i = rawArgv.indexOf("--answers");
      const file = i >= 0 ? rawArgv[i + 1] : undefined;
      if (!file) {
        err("usage: setup --answers <file.json> [--adopt|--no-adopt]");
        return 2;
      }
      let root = process.cwd();
      if (!existsSync(join(root, CONFIG_FILE))) {
        try {
          root = findRoot();
        } catch {
          root = process.cwd();
        }
      }
      const { generate } = await import("../lib/generate.mjs");
      const answers = JSON.parse(readFileSync(resolve(file), "utf8"));
      const adopt = rawArgv.includes("--adopt") ? true : rawArgv.includes("--no-adopt") ? false : undefined;
      const { report } = generate(root, answers, { adopt });
      out(`✓ SAF setup generated ${report.written.length} file(s)`);
      for (const a of report.archived) out(`  archived: ${a}`);
      for (const w of report.warnings) err(`  ⚠ ${w}`);
      return 0;
    }
    case "detect":
      out(JSON.stringify(detectProject(process.cwd()), null, 2));
      return 0;
    case "config": {
      const root = findRoot();
      const raw = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
      const errors = validateConfig(raw);
      for (const e of errors) err(`✗ ${e}`);
      if (!errors.length) out(`✓ ${CONFIG_FILE} is valid`);
      return errors.length ? 1 : 0;
    }
    case "version":
      out(readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim());
      return 0;
    default:
      err("usage: saf task <…> | hook <…> | docs-check | spec-matrix | check-secrets | measure | setup | detect | config --check | version");
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    err(`✗ ${e instanceof Error ? e.message : String(e)}`);
    if (!(e instanceof TaskError) && !(e instanceof ConfigError) && e instanceof Error && e.stack) err(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exitCode = e instanceof StartIncomplete || e instanceof MergeStop ? e.exitCode : 1;
  },
);
