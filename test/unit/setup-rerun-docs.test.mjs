import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO } from "../helpers.mjs";

const read = (...p) => readFileSync(join(REPO, ...p), "utf8").replace(/\r\n/g, "\n");
const flat = (s) => s.replace(/\s+/g, " ");

test("RERUN-AC-07 SKILL.md detects a re-run by the manifest, dry-runs and asks per edited file, passes --keep <path>; upgrade.md and Re-running describe it", () => {
  const skill = read("kit", "claude", "skills", "saf-setup", "SKILL.md");
  const t = flat(skill);
  assert.ok(/Step 0[\s\S]*\.saf\/manifest\.json/.test(skill.split("## Step 1")[0]), "Step 0 uses the manifest");
  assert.ok(t.includes("setup --answers .saf/setup-answers.json <adopt flag> --dry-run") && t.includes("--dry-run --diff"));
  for (const o of ["Take the new version", "docs/archive/pre-saf/", "(recommended)", "Keep mine", "Show the diff first"]) assert.ok(t.includes(o), o);
  assert.ok(t.includes("replace-edited") && t.includes("AskUserQuestion"));
  assert.ok(t.includes("--keep <path>") && /Never `--keep=<path>`/.test(t) && /comma-separated/.test(t));
  assert.ok(/your edits stay/.test(t) && /keep-edited/.test(t), "living files note");
  const re = flat(skill.slice(skill.indexOf("## Re-running")));
  assert.ok(/living files/.test(re) && /archived/.test(re) && re.includes("--dry-run") && re.includes("--diff"));
  const raw = read("docs", "upgrade.md");
  const up = flat(raw);
  assert.ok(!up.includes("edited ones are archived to `docs/archive/pre-saf/` first."), "the old sentence is gone");
  assert.ok(!up.includes("are the exception"), "the old exception sentence is gone");
  assert.ok(up.includes("living files") && up.includes("archived to `docs/archive/pre-saf/` first and replaced, unless you keep it (`--keep <path>`)"));
  assert.ok(up.includes("`--dry-run`") && up.includes("`--dry-run --diff`"));
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines.filter((l, i) => lines.indexOf(l) !== i), [], "no line appears twice");
});
