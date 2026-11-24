import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scriptCommand } from "./config.mjs";
import { codeSpans, findSection, sections } from "./markdown.mjs";
import { CRITERIA_HEADINGS, cardStatus, criteriaCommands, loadPlan } from "./plan.mjs";
import { redactSecrets } from "./run.mjs";
import { isFullSuite } from "./testmode.mjs";

/**
 * `task:prerun <id>` — docs/specs/designer-prerun.md. Before a card is handed over, the designer sees which of its
 * "Done when" commands already pass on the current code (a command that passes before the card cannot prove it).
 *
 * What it executes: the card's "Done when" commands, each through the same runner `task:verify` uses (same shell, same
 * folder, same `workflow.commandTimeoutMs` limit that kills a hung command) — except guards, which are never run. The
 * commands come from a card file committed in the repository, like package.json scripts, and `task:verify` would run
 * the very same ones: no new trust surface. Their own side effects (files a command writes) are the command's, as at
 * verify. This module itself writes nothing: no evidence, no STATE.md, no mirror, no review or friction file.
 */

/** Rule 6: the engine's own check scripts — a "Done when" line that calls one is a guard, not a proof. Data, not logic. */
export const GUARD_SCRIPTS = ["spec:matrix", "docs:check", "check-secrets", "task:state"];

/** Rule 2: the mark after the backticked command, `passes by design:` followed by a non-empty reason. */
export const MARK = /passes by design:[ \t]*(\S.*)$/i;

/** Rule 8: exit codes. */
export const PRERUN_EXIT = { ok: 0, passes: 1, refused: 2 };

/**
 * The "Done when" items of a card file with their raw text. The command is the one `criteriaCommands` finds (so it can
 * never differ from what `task:verify` runs); the mark is looked for only in the text that follows a backticked
 * command — never inside it, and never on a line whose command is not backticked.
 * @returns {{cmd:string, mark:string|null}[]} `mark` = the reason, or null (no mark, or a mark without a reason)
 */
export function doneWhenItems(src) {
  const sec = findSection(sections(src), CRITERIA_HEADINGS);
  const out = [];
  for (const l of sec ?? []) {
    if (l.inFence) continue;
    const [cmd] = criteriaCommands([l]);
    if (!cmd) continue;
    const item = l.text.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim() ?? "";
    const first = codeSpans(item)[0];
    const rest = first && first.start === 0 ? item.slice(first.end) : "";
    out.push({ cmd, mark: rest.match(MARK)?.[1].trim() ?? null });
  }
  return out;
}

/** Rule 6: why a command is a guard (`full suite` · `merge check` · `engine check`), or null when it is not. */
export function guardKind(config, cmd) {
  const c = cmd.trim();
  if (isFullSuite(config, c)) return "full suite";
  if ((config.workflow?.mergeChecks ?? []).some((m) => m.trim() === c)) return "merge check";
  const pm = config.stack?.packageManager;
  const engine = GUARD_SCRIPTS.some((s) => {
    const base = scriptCommand(pm, s);
    return c === base || c.startsWith(`${base} `);
  });
  return engine ? "engine check" : null;
}

const refused = (message) => ({ exit: PRERUN_EXIT.refused, results: [], refused: message });

/**
 * @param ctx engine context (root · config · run) — `ctx.run` is the runner of `task:verify`
 * @param {string} id card id
 * @param {(line:string)=>void} say output line sink (nothing else is written anywhere)
 * @returns {Promise<{exit:number, results:object[], refused?:string, warning?:string}>}
 */
export async function prerunCard(ctx, id, say = () => {}) {
  const plan = loadPlan(ctx.root, ctx.config);
  if (plan.issues.length) return refused(["the plan has problems — fix them first (task:state --check):", ...plan.issues.map((i) => `  ✗ ${i}`)].join("\n"));
  const card = plan.cards.get(id);
  if (!card) return refused(`no card ${id} — check the id`);
  const status = cardStatus(plan, id);
  if (status !== "todo") return refused(`${id} is ${status} — task:prerun only judges a card that has not started (after start the code already changed, so the result would mean nothing)`);
  const items = doneWhenItems(readFileSync(join(ctx.root, card.file), "utf8"));
  const kinds = items.map((it) => guardKind(ctx.config, it.cmd));
  const safe = (s) => redactSecrets(s);
  say(`task:prerun ${id} — runs the Done-when commands as task:verify does (same runner, folder and time limit; guards are not run) · writes nothing`);
  items.forEach((it, i) => say(`  ${i + 1}. ${safe(it.cmd)} — ${kinds[i] ? `guard — not run (${kinds[i]})` : "will run"}`));
  const results = [];
  for (const [i, it] of items.entries()) {
    if (kinds[i]) {
      results.push({ cmd: it.cmd, verdict: "guard" });
      continue;
    }
    say(`▶ ${safe(it.cmd)}`);
    const r = await ctx.run(it.cmd);
    const stopped = r.tail?.some((l) => l.startsWith("<stopped:"));
    if (r.exit !== 0) {
      say(`  ✗ fails now — expected (${stopped ? "stopped at the time limit" : `exit ${r.exit}`})`);
      results.push({ cmd: it.cmd, verdict: "fails", exit: r.exit });
    } else if (it.mark) {
      say(`  ✓ passes by design: ${safe(it.mark)}`);
      results.push({ cmd: it.cmd, verdict: "by-design", reason: it.mark });
    } else {
      say("  ⚠ passes already — it cannot prove the card (rewrite it so it fails before the card, or mark it: — passes by design: <reason>)");
      results.push({ cmd: it.cmd, verdict: "passes" });
    }
  }
  const warning = results.every((r) => r.verdict === "guard") ? "no command proves this card — every Done-when command is a guard" : undefined;
  if (warning) say(`  ⚠ ${warning}`);
  const bad = results.filter((r) => r.verdict === "passes").length;
  say(bad ? `✗ ${bad} command(s) pass already` : "✓ no unmarked command passes already");
  return { exit: bad ? PRERUN_EXIT.passes : PRERUN_EXIT.ok, results, warning };
}
