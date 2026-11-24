import { LOCAL_CONFIG_FILE, roleTable } from "./config.mjs";
import { globToRegExp, preparePattern, touchOverlaps } from "./glob.mjs";
import { activeCards, activeSideCards, alwaysAllowed, cardStatus, isSideCard, nextCards, sideLaneMax, sideTracks, unmetDepends } from "./plan.mjs";

/**
 * Which cards may run at the same time. Pure functions — no disk access.
 * Rules: no touch overlap with a card already picked or in progress · per-lane caps · "solo" paths
 * (e.g. migrations) run alone in the code lane. When unsure → overlap (the safe mistake).
 * Side lanes: cards of the active milestone are walked first, then side cards — so side cards only get capacity the
 * active milestone leaves free, and at most workflow.sideLanes.max of them run at once.
 */

export const LANE_NAME = { code: "code lane", main: "main-folder lane" };

/** Lane of a card: its role's lane · with worktree lanes turned off every card works in the main folder. */
export function laneOf(plan, card) {
  if (!plan.config.workflow.worktrees || plan.config.workflow.lanes.code < 1) return "main";
  const role = roleTable(plan.config).find((r) => r.name === card.role);
  return role?.lane ?? "code";
}

/** Touch patterns that count for overlap: drop the files that never count as touched. */
export function comparableTouch(plan, card) {
  const ignored = [...alwaysAllowed(plan.config), card.file].map((g) => globToRegExp(g));
  return card.touch.filter((p) => {
    const xs = preparePattern(p);
    return !xs || !xs.every((x) => ignored.some((re) => re.test(x)));
  });
}

export const cardOverlaps = (plan, a, b) => touchOverlaps(comparableTouch(plan, a), comparableTouch(plan, b));

const isSolo = (plan, card) => {
  const solo = plan.config.workflow.solo ?? [];
  return solo.length > 0 && touchOverlaps(comparableTouch(plan, card), solo).length > 0;
};

/** Walk order: the active milestone's cards first, then side cards of planned milestones (each in `cards` order). */
export const walkOrder = (plan, m) => [...new Set([...(m?.cards ?? []), ...sideTracks(plan).flatMap((t) => t.cards)])];

/** Ids in a result that are side cards (in order, no repeats). */
export const sideIds = (plan, ids) => [...new Set(ids.filter((id) => isSideCard(plan, id)))];

export const startableCards = (plan, m) => nextCards(plan, { ...m, cards: walkOrder(plan, m) }, Infinity);

const pairText = (pairs) => pairs.map(([x, y]) => `${x} ↔ ${y}`).join(", ");

export function pickParallel(plan, m) {
  const caps = { code: plan.config.workflow.worktrees ? plan.config.workflow.lanes.code : 0, main: plan.config.workflow.lanes.main };
  const active = activeCards(plan);
  const parallel = { code: [], main: [] };
  if (plan.issues.length) {
    return { parallel, active: active.map((c) => c.id), skipped: [], side: [], blocked: `the plan has ${plan.issues.length} problem(s) — no parallel set until fixed (task:state --check)` };
  }
  const skipped = [];
  const used = { code: 0, main: 0 };
  for (const c of active) used[laneOf(plan, c)]++;
  const holders = [...active];
  let soloHolder = active.find((c) => isSolo(plan, c))?.id;
  const solo = (plan.config.workflow.solo ?? []).join(", ");
  let sideUsed = activeSideCards(plan).length;
  const sideMax = sideLaneMax(plan);
  const local = plan.config.workflow.localKeys ?? [];
  const here = (key) => (local.includes(key) ? ` (this machine: ${LOCAL_CONFIG_FILE})` : "");

  for (const id of walkOrder(plan, m)) {
    const card = plan.cards.get(id);
    if (!card || cardStatus(plan, id) !== "todo") continue;
    const wait = unmetDepends(plan, id);
    if (wait.length) {
      skipped.push({ id, reason: `waits for ${wait.join(", ")}` });
      continue;
    }
    const clash = holders.map((h) => ({ h, pairs: cardOverlaps(plan, card, h) })).find((x) => x.pairs.length);
    if (clash) {
      skipped.push({ id, reason: `touch overlaps ${clash.h.id}${active.includes(clash.h) ? " (in progress)" : ""} at ${pairText(clash.pairs)}` });
      continue;
    }
    if (card.repo && card.repo !== ".") {
      // submodule cards run in the main folder, one per submodule
      const busy = holders.find((h) => h.repo === card.repo);
      if (busy) {
        skipped.push({ id, reason: `submodule ${card.repo} already has ${busy.id}` });
        continue;
      }
    }
    const lane = card.repo && card.repo !== "." ? "main" : laneOf(plan, card);
    const isSoloCard = isSolo(plan, card);
    if (lane === "code" && soloHolder) {
      skipped.push({ id, reason: `${soloHolder} runs alone (${solo}) — the code lane takes no other card` });
      continue;
    }
    if (isSoloCard && used.code > 0) {
      skipped.push({ id, reason: `runs alone (${solo}) but the code lane already has a card` });
      continue;
    }
    if (used[lane] >= caps[lane]) {
      skipped.push({ id, reason: `${LANE_NAME[lane]} is full (${caps[lane]} card(s), counting cards in progress)${lane === "code" ? here("workflow.lanes.code") : ""}` });
      continue;
    }
    const side = isSideCard(plan, id);
    if (side && sideUsed >= sideMax) {
      skipped.push({ id, reason: `side lanes are full (${sideMax} side card(s) at a time, counting cards in progress)${here("workflow.sideLanes.max")}` });
      continue;
    }
    if (side) sideUsed++;
    parallel[lane].push(id);
    used[lane]++;
    holders.push(card);
    if (isSoloCard) soloHolder = id;
  }
  const ids = [...parallel.code, ...parallel.main, ...active.map((c) => c.id), ...skipped.map((x) => x.id)];
  return { parallel, active: active.map((c) => c.id), skipped, side: sideIds(plan, ids) };
}
