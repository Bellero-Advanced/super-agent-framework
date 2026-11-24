import { EFFORT_BY_SIZE, roleTable, variantNames } from "./config.mjs";

/**
 * Effort by card size (docs/specs/effort-by-size.md): which agent and effort a card gets.
 * The table `EFFORT_BY_SIZE` and the setting `models.effort` live in config.mjs.
 */

/** The one warning when the mode is by-size but setup planned the agent files with fixed (rule 10). */
export const MISSING_VARIANTS_WARNING = "models.effort is by-size here, but setup ran with fixed, so the variant agent files do not exist — run setup again with by-size; the role's own agent is used";

/**
 * Agent, effort and mode for a card (rules 3, 4 and 10). A card without size counts as M.
 * @returns {{effort:string, agent:string, mode:string, source:string, warning?:string}}
 */
export function cardEffort(config, card) {
  const mode = config.models.effort;
  const source = config.models.effortSource ?? "default";
  const role = roleTable(config).find((r) => r.name === card.role);
  if (!role) throw new Error(`cardEffort: "${card.role}" is not an enabled role`);
  const size = card.size === "S" ? "S" : "M";
  const overridden = config.models.overrides?.[role.name]?.effort;
  const wanted = overridden ?? (mode === "by-size" ? EFFORT_BY_SIZE[role.name]?.[size] : undefined) ?? role.effort;
  const variants = variantNames([role.name], config.models.overrides);
  const missing = mode === "by-size" && config.models.effortTracked === "fixed" && variants.length > 0;
  const hasVariant = wanted !== role.effort && !missing && variants.some((v) => v.effort === wanted);
  const out = { effort: hasVariant ? wanted : role.effort, agent: hasVariant ? `${role.name}-${wanted}` : role.name, mode, source };
  if (missing && wanted !== role.effort) out.warning = MISSING_VARIANTS_WARNING;
  return out;
}

/** The variant agent files setup plans: none in fixed mode (rule 6; `roleTable` applies the overrides). */
export function variantAgents(config) {
  if (config.models.effort !== "by-size") return [];
  const enabled = roleTable(config).map((r) => r.name);
  return variantNames(enabled, config.models.overrides);
}
