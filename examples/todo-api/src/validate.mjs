import { TITLE_MAX } from "./limits.mjs";

/** Title rules (docs/specs/todos.md rule 4) → `{ ok: true, title }` or `{ ok: false, error }`. */
export function validateTitle(raw) {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) return { ok: false, error: "title_required" };
  if (title.length > TITLE_MAX) return { ok: false, error: "title_too_long" };
  return { ok: true, title };
}
