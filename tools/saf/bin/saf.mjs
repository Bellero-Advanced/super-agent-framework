#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { GROUPS, LANGS, groupText, languageFor, notAskedText } from "../lib/choices.mjs";
import { CONFIG_FILE, ConfigError, findRoot, legacySizeLine, loadConfig, resolveConfig, scriptCommand, validateConfig } from "../lib/config.mjs";
import { culpritLines, findCulprit } from "../lib/culprit.mjs";
import { detectProject } from "../lib/detect.mjs";
import { docsInputFor, runDocsCheck } from "../lib/docs.mjs";
import { CLOSE_STATUSES, FRICTION_FILE, FRICTION_MARKER, FrictionError, appendClose, appendEntry, countByStatus, entryLine, renderDrafts } from "../lib/friction.mjs";
import { listRepoFiles } from "../lib/git.mjs";
import { blockingGaps, buildMatrix, completeGaps, countsHere, renderMatrix, summarize } from "../lib/matrix.mjs";
import { EXIT_REFUSED, lockPathFor, measureStatus, runMeasured } from "../lib/measure.mjs";
import { LANE_NAME, laneOf, pickParallel, sideIds, startableCards } from "../lib/parallel.mjs";
import { CARD_ID, MILESTONE_ID, activeCards, activeMilestone, cardStatus, formatTime, isSideCard, loadPlan, titleOf } from "../lib/plan.mjs";
import { prerunCard } from "../lib/prerun.mjs";
import { commandRunner, prepareRelease, runRelease, tagRelease } from "../lib/release.mjs";
import { renderReport, reportPath } from "../lib/report.mjs";
import { writeReviewDiff } from "../lib/reviewdiff.mjs";
import { REVIEW_KINDS, listRounds, recordReview, reviewsPath } from "../lib/reviews.mjs";
import { htmlPath, renderEvidencePage } from "../lib/viewer.mjs";
import { taskRunner } from "../lib/run.mjs";
import { textFor } from "../lib/text.mjs";
import { scanSecrets } from "../lib/secrets.mjs";
import {
  MergeStop,
  StartIncomplete,
  TaskError,
  abandonCard,
  checkStop,
  effortLines,
  sizeStopLine,
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
 *   task state [--check] · task next [--parallel] [--json] · task probe [--bin <claude>] · task env · task report <M> [--html]
 *     (task next lists the active milestone's cards first, then side cards of planned milestones — --json has a `side` list)
 *   task friction [add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…> | close <F-id> carded|fixed|dropped <card id or reason…> | draft]
 *     (the friction log docs/plan/friction.md: no sub-command lists open and carded entries · add/close are refused in a lane · draft prints card drafts and writes nothing)
 *   task review <id> [pass|fail] [--kind <k>[,<k>…]] [--note <text>] [--area <area>]   record one spec review round (no result lists the rounds)
 *     (docs/plan/evidence/reviews/<id>.json · fail reopens the card for verify · main folder only · exit 0 recorded · 1 refused · 2 usage)
 *   task culprit <M> [--cmd "<command>"]   which card broke the full suite (exit 0 found · 2 fails before the first card · 3 passes at HEAD)
 *   task prerun <id>   which "Done when" commands of a card that has not started already pass (exit 0 none unmarked · 1 some do · 2 usage or refused)
 *     (runs those commands like task:verify does — same runner, folder and time limit, guards are not run — and writes no evidence, STATE.md or mirror (the commands themselves may write, as at task:verify) · main folder or lane)
 *   task diff <id>   write the reviewer's diff of a started card to .saf/memory/review/<id>.diff (exit 0 written · 1 git failed · 2 usage or refused)
 *     (exactly the files task:verify counts as the card's · a lane card is read and written in its worktree · prints the absolute path)
 *   task release <M>   the release dry run: every release guard and the plan, nothing is changed (exit 0 every guard holds · 1 one fails · 2 usage)
 *   task release <M> --prepare | --tag   commit + push the version bump, or tag + push the tag when CI is green on that commit (exit 0 pushed · 1 a guard refused, a step failed and was undone, or a push did not go through · 2 usage: a bad milestone id, both flags together, or a lane worktree)
 *   hook session-start · hook check-stop    (Claude Code hooks)
 *   docs-check · spec-matrix [--check] [--complete=a,b] · check-secrets
 *   measure <name> -- <command…> · measure --status
 *   setup --answers <file.json> [--adopt|--no-adopt] [--dry-run] [--diff] [--keep <path>[,<path>…]] · detect · config --check · version
 *   choices --group <1-8|flow> [--lang en|th]   what each option of an interview group means (exit 2 usage)
 *   choices --not-asked [--lang en|th]          settings the setup interview does not ask, and where to change them (exit 2 usage)
 *
 * A lone `--` (npm passes arguments after it) is ignored everywhere except `measure`, where it separates the command.
 */

const rawArgv = process.argv.slice(2);
const argv = rawArgv.filter((a) => a !== "--");
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

/** `choices` arguments: only `--group <g>`, `--not-asked`, `--lang <l>`, each at most once; `ok` is false for anything else. */
function parseChoicesArgs(args) {
  const found = { ok: true, notAsked: false };
  for (let i = 0; i < args.length; i++) {
    const key = { "--group": "group", "--lang": "lang" }[args[i]];
    if (key && found[key] === undefined && i + 1 < args.length) found[key] = args[++i];
    else if (args[i] === "--not-asked" && !found.notAsked) found.notAsked = true;
    else found.ok = false;
  }
  return found;
}

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
  if (v.size?.stopped?.length) lines.push(sizeStopLine(ev.id, v.size, v.commands.length > 0));
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
  const positional = () => rest.find((a, i) => !a.startsWith("--") && !["--base", "--bin", "--cmd"].includes(rest[i - 1] ?? ""));
  const c = (s, a) => scriptCommand(config.stack.packageManager, s, a);
  const requireId = () => {
    const id = positional();
    if (!id) throw new TaskError(`give an id, e.g. ${c(`task:${sub}`, ["report", "culprit"].includes(sub) ? "M1" : "T-M1-01")}`);
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
      for (const l of effortLines(config, card ?? {}, ev)) out(l);
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
      // side cards carry a tag; a plan without side_cards prints exactly what it did before
      const label = (id) => `${id} ${titleOf(plan, id)}${isSideCard(plan, id) ? ` [side lane ${plan.cards.get(id)?.milestone ?? ""}]` : ""}`;
      if (!flag("--parallel")) {
        const startable = startableCards(plan, m);
        const active = activeCards(plan).map((x) => x.id);
        if (flag("--json")) out(JSON.stringify({ milestone: m.id, startable, active, side: sideIds(plan, [...startable, ...active]) }, null, 2));
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
      if (flag("--html")) {
        writeFileSync(join(root, htmlPath(id)), renderEvidencePage(plan, id));
        out(`wrote ${htmlPath(id)}`);
      }
      return 0;
    }
    case "friction":
      return friction(ctx, rest);
    case "review":
      return review(ctx, rest);
    case "prerun": {
      const bad = rest.filter((a) => a.startsWith("-"));
      const words = rest.filter((a) => !a.startsWith("-"));
      if (bad.length || words.length !== 1) {
        err(`✗ ${bad.length ? `unknown option ${bad[0]}` : words.length ? `unexpected argument "${words[1]}"` : "give a card id"} — usage: ${c("task:prerun", "<id>")}`);
        return 2;
      }
      const r = await prerunCard(ctx, words[0], out);
      if (r.refused) err(`✗ ${r.refused}`);
      return r.exit;
    }
    case "diff": {
      const bad = rest.filter((a) => a.startsWith("-"));
      const words = rest.filter((a) => !a.startsWith("-"));
      if (bad.length || words.length !== 1) {
        err(`✗ ${bad.length ? `unknown option ${bad[0]}` : words.length ? `unexpected argument "${words[1]}"` : "give a card id"} — usage: ${c("task:diff", "<id>")}`);
        return 2;
      }
      const r = writeReviewDiff(ctx, words[0]);
      out(`wrote ${r.path}`);
      out(`  ${r.files} file(s) · ${r.lines} line(s) · code ${r.size.code.lines} · test ${r.size.test.lines} changed lines${r.lane ? " · lane worktree" : ""}`);
      return 0;
    }
    case "release": {
      const steps = rest.filter((a) => a === "--prepare" || a === "--tag");
      const bad = rest.filter((a) => a.startsWith("-") && !steps.includes(a));
      const words = rest.filter((a) => !a.startsWith("-"));
      const usage = `usage: ${c("task:release", "<M>")} (for example ${c("task:release", "M1")})`;
      if (bad.length || words.length !== 1 || !MILESTONE_ID.test(words[0]) || steps.length > 1) {
        err(`✗ ${bad.length ? `unknown option ${bad[0]}` : words.length > 1 ? `unexpected argument "${words[1]}"` : words.length ? (steps.length > 1 ? "give one of --prepare and --tag" : `"${words[0]}" is not a milestone id`) : "give a milestone id"} — ${usage}`);
        return 2;
      }
      const ctx = { root, config, run: commandRunner(root, { timeoutMs: config.workflow.commandTimeoutMs }) };
      if (steps.length) {
        const lane = laneFolder(root, loadPlan(root, config));
        if (lane) {
          err(`✗ ${steps[0]} pushes from the main folder only — this folder is the worktree of lane ${lane.lane}, card ${lane.card}: run ${c("task:release", `${words[0]} ${steps[0]}`)} there`);
          return 2;
        }
        return (steps[0] === "--prepare" ? prepareRelease : tagRelease)(ctx, words[0], { out });
      }
      return runRelease(ctx, words[0], { out });
    }
    case "culprit": {
      const mid = requireId();
      if (!MILESTONE_ID.test(mid)) {
        err(`✗ "${mid}" is not a milestone id — usage: ${c("task:culprit", '<M> [--cmd "<command>"]')} (for example ${c("task:culprit", "M1")})`);
        return 2;
      }
      const r = await findCulprit({ ...ctx, onOutput: (s) => process.stdout.write(s) }, mid, { cmd: option("--cmd") });
      culpritLines(r).forEach(out);
      return r.exit;
    }
    default:
      err("usage: task start|verify|abandon|merge|review|state|next|probe|env|report|culprit|friction|prerun|diff|release — see docs/plan/README.md");
      return 2;
  }
}

const REVIEW_FLAGS = ["--kind", "--note", "--area"];

/** `task review` — docs/specs/review-rounds.md. A refused value exits 1 (nothing written) · a wrong shape of arguments exits 2 with the usage line. */
function review(ctx, args) {
  const c = (s, a) => scriptCommand(ctx.config.stack.packageManager, s, a);
  const usage = `${c("task:review", "<id> [pass|fail] [--kind <k>[,<k>…]] [--note <text>] [--area <area>]")} (kinds: ${Object.keys(REVIEW_KINDS).join(", ")})`;
  const bad = (why) => {
    err(`✗ ${why} — usage: ${usage}`);
    return 2;
  };
  const fields = {};
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (REVIEW_FLAGS.includes(a) && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) fields[a.slice(2)] = args[++i];
    else if (a.startsWith("--")) return bad(REVIEW_FLAGS.includes(a) ? `${a} needs a value (a value cannot start with --)` : `unknown option ${a} (write --option value, not --option=value)`);
    else words.push(a);
  }
  const [id, result, ...extra] = words;
  if (!id || extra.length) return bad(id ? `unexpected argument "${extra[0]}"` : "give a card id");
  if (result === undefined) {
    if (Object.keys(fields).length) return bad("--kind, --note and --area go with pass or fail");
    for (const l of listRounds(ctx, id)) out(l);
    return 0;
  }
  if (!["pass", "fail"].includes(result)) return bad(`the result is pass or fail, not "${result}"`);
  const kinds = (fields.kind ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const done = recordReview(ctx, id, result, { kinds, note: fields.note, area: fields.area });
  out(`✓ ${id} review round ${done.round}: ${result}${kinds.length ? ` (${kinds.join(", ")})` : ""}`);
  if (done.friction) out(`  friction ${done.friction} recorded in ${FRICTION_FILE} (commit it alone: git commit -m "chore(plan): friction ${done.friction}" -- ${FRICTION_FILE})`);
  if (result === "fail") out(done.worktree ? `  fix it in ${done.worktree}, run ${c("task:verify", id)} there again and commit the evidence on the card branch` : `  the card is reopened: fix it, then run ${c("task:verify", id)} again (no --restart)`);
  out(`  not committed — commit it alone: git commit -m "chore(plan): review ${id} round ${done.round}" -- ${reviewsPath(id)}`);
  return 0;
}

const FRICTION_FLAGS = ["--kind", "--area", "--evidence", "--card"];

/** `task friction` — the friction log (docs/specs/friction-log.md rules 7-10). A refused value exits 1 (nothing written) · a wrong shape of arguments (unknown sub-command or option, a flag without a value, `--flag=value`) exits 2 with the usage line. */
function friction(ctx, rest) {
  const { root, config } = ctx;
  const c = (s, a) => scriptCommand(config.stack.packageManager, s, a);
  const [sub, ...args] = rest;
  const plan = loadPlan(root, config);
  if (sub === undefined) {
    const { entries, issues } = plan.friction;
    for (const i of issues) err(`⚠ ${i}`);
    if (!entries.length) {
      out("no friction recorded");
      return 0;
    }
    for (const e of entries.filter((x) => x.status === "open" || x.status === "carded")) out(entryLine(e));
    out(Object.entries(countByStatus(entries)).map(([k, n]) => `${k} ${n}`).join(" · "));
    return 0;
  }
  if (sub === "draft") {
    if (args.length) {
      err(`usage: ${c("task:friction", "draft")}`);
      return 2;
    }
    for (const i of plan.friction.issues) err(`⚠ ${i}`);
    const drafts = renderDrafts(plan);
    out(drafts.length ? drafts.join("\n") : textFor(config.people.docLanguage).friction.noDrafts);
    return 0;
  }
  const usage = {
    add: `${c("task:friction", "add --kind <kind> --area <area> --evidence <text> [--card <id>] <summary…>")}`,
    close: `${c("task:friction", `close <F-id> ${CLOSE_STATUSES.join("|")} <card id or reason…>`)}`,
  };
  if (!usage[sub]) {
    err(`usage: ${usage.add} · ${usage.close} · ${c("task:friction", "draft")} · ${c("task:friction")}`);
    return 2;
  }
  const lane = laneFolder(root, plan);
  if (lane) {
    throw new TaskError(`this folder is the worktree of lane ${lane.lane}, card ${lane.card} — task:friction ${sub} writes the log in the main folder: run ${usage[sub]} there (here put a "friction:" line in your report; the main session records it)`);
  }
  const text = textFor(config.people.docLanguage);
  const opts = {
    today: formatTime(new Date().toISOString(), config.people.timeZone).slice(0, 10),
    cards: (id) => plan.cards.has(id) || plan.milestones.some((m) => m.legacy[id]),
    header: text.frictionHeader(FRICTION_MARKER, usage.add),
  };
  try {
    if (sub === "add") {
      const fields = {};
      const words = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (FRICTION_FLAGS.includes(a) && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) fields[a.slice(2)] = args[++i];
        else if (a.startsWith("--")) {
          err(`✗ ${FRICTION_FLAGS.includes(a) ? `${a} needs a value (a value cannot start with --)` : `unknown option ${a} (write --option value, not --option=value)`} — usage: ${usage.add}`);
          return 2;
        } else words.push(a);
      }
      fields.summary = words.join(" ");
      const id = appendEntry(root, fields, opts);
      out(id);
      err(`  recorded in ${FRICTION_FILE} (not committed — commit it alone: git commit -m "chore(plan): friction ${id}" -- ${FRICTION_FILE})`);
      return 0;
    }
    const [id = "", status = "", ...ref] = args;
    appendClose(root, id, status, ref.join(" "), opts);
    out(`${id} ${status}`);
    err(`  recorded in ${FRICTION_FILE} (not committed)`);
    return 0;
  } catch (e) {
    if (!(e instanceof FrictionError)) throw e;
    throw new TaskError(`${e.message} — nothing written · usage: ${usage[sub]}`);
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
      const matrix = buildMatrix({ files: listRepoFiles(root), read: (rel) => readFileSync(join(root, rel), "utf8"), cards: [...plan.cards.values()], status: (id) => cardStatus(plan, id), lane: (id) => plan.evidence.get(id)?.lane });
      let here; // where this runs: a lane's card, or the main folder (null) · unknown lane → every started card counts
      try {
        here = { laneCard: laneFolder(root, plan)?.card ?? null };
      } catch (e) {
        if (!(e instanceof TaskError)) throw e;
        err(`lane not recognised (${e.message}) — checking every started card`);
      }
      out(`${matrix.rows.length ? renderMatrix(matrix, here) : "(no acceptance scenarios in docs/specs/ yet)"}\n\n${summarize(matrix, here)}`);
      if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Scenario ↔ test\n\n${renderMatrix(matrix, here)}\n\n${summarize(matrix, here)}\n`, { flag: "a" });
      let failed = false;
      for (const i of matrix.issues) {
        err(`✗ ${i.file}${i.line ? `:${i.line}` : ""} — ${i.message}`);
        failed = true;
      }
      if (check) {
        for (const r of blockingGaps(matrix, here)) {
          err(`✗ ${r.id} (${r.spec}:${r.line}) has no test — card ${r.cards.filter((x) => countsHere(x, here)).map((x) => x.id).join(", ")} has started`);
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
      const keep = [];
      let keepUsage = false;
      rawArgv.forEach((a, n) => {
        if (a.startsWith("--keep=")) keepUsage = true;
        if (a !== "--keep") return;
        const v = rawArgv[n + 1];
        const paths = v && !v.startsWith("--") ? v.split(",").map((p) => p.trim()).filter(Boolean) : [];
        if (!paths.length) keepUsage = true;
        else keep.push(...paths);
      });
      if (!file || keepUsage || (rawArgv.includes("--diff") && !rawArgv.includes("--dry-run"))) {
        err("usage: setup --answers <file.json> [--adopt|--no-adopt] [--dry-run] [--diff] [--keep <path>[,<path>…]]  (--diff needs --dry-run)");
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
      const { generate, planSetup, planLines, planDiffs } = await import("../lib/generate.mjs");
      const answers = JSON.parse(readFileSync(resolve(file), "utf8"));
      const adopt = rawArgv.includes("--adopt") ? true : rawArgv.includes("--no-adopt") ? false : undefined;
      try {
        if (rawArgv.includes("--dry-run")) {
          const plan = planSetup(root, answers, { adopt, keep });
          const lines = planLines(plan);
          if (rawArgv.includes("--diff")) lines.push("", ...planDiffs(plan));
          out("setup --dry-run: nothing was written");
          for (const line of lines) out(line);
          return 0;
        }
        const { report } = generate(root, answers, { adopt, keep });
        out(`✓ SAF setup generated ${report.written.length} file(s)`);
        for (const a of report.archived) out(`  archived: ${a}`);
        for (const r of report.removed) out(`  removed (no longer shipped): ${r}`);
        for (const w of report.warnings) err(`  ⚠ ${w}`);
        return 0;
      } catch (e) {
        if (e?.code !== "SETUP_KEEP") throw e;
        err(`✗ ${e.message}`);
        return 2;
      }
    }
    case "choices": {
      const given = parseChoicesArgs(argv.slice(1));
      const { lang, group } = given;
      const bad = !given.ok || (lang !== undefined && !LANGS.includes(lang)) || (group !== undefined) === given.notAsked || (group !== undefined && !GROUPS.map(String).includes(group));
      if (bad) {
        err(`usage: choices --group <${GROUPS.join("|")}> [--lang ${LANGS.join("|")}] | choices --not-asked [--lang ${LANGS.join("|")}]`);
        return 2;
      }
      const chosen = languageFor(process.cwd(), lang);
      out(group === undefined ? notAskedText(chosen) : groupText(group, chosen));
      return 0;
    }
    case "detect":
      out(JSON.stringify(detectProject(process.cwd()), null, 2));
      return 0;
    case "config": {
      if (argv.length !== 2 || sub !== "--check") {
        err("usage: config --check");
        return 2;
      }
      const root = findRoot();
      let raw;
      try {
        raw = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
      } catch {
        err(`✗ ${CONFIG_FILE} is not valid JSON`);
        return 1;
      }
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        err(`✗ ${CONFIG_FILE} is not a JSON object`);
        return 1;
      }
      const errors = validateConfig(raw);
      for (const e of errors) err(`✗ ${e}`);
      if (!errors.length) for (const key of resolveConfig(raw).workflow.sizesLegacy) out(legacySizeLine(key));
      if (!errors.length) out(`✓ ${CONFIG_FILE} is valid`);
      return errors.length ? 1 : 0;
    }
    case "version":
      out(readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim());
      return 0;
    default:
      err("usage: saf task <…> | hook <…> | docs-check | spec-matrix | check-secrets | measure | setup | choices | detect | config --check | version");
      return 2;
  }
}

const refusesWith2 = argv[0] === "task" && ["prerun", "diff", "release"].includes(argv[1]); // prerun: exit 1 means "some command passes" · diff: exit 1 means a git call failed · release: exit 1 means a guard failed

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    err(`✗ ${e instanceof Error ? e.message : String(e)}`);
    if (!(e instanceof TaskError) && !(e instanceof ConfigError) && e instanceof Error && e.stack) err(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exitCode = e instanceof StartIncomplete || e instanceof MergeStop ? e.exitCode : refusesWith2 && (e instanceof TaskError || e instanceof ConfigError) ? 2 : 1;
  },
);
