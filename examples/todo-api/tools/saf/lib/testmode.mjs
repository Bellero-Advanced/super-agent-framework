import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FULL_SUITE_KEYS } from "./config.mjs";
import { listRepoFiles } from "./git.mjs";
import { IS_WINDOWS, quoteWindowsArg } from "./run.mjs";
import { findScenarioTests, isTestFile } from "./scenarios.mjs";

/**
 * Test mode at card verify (docs/specs/test-mode.md rules 9-15). The verify column of the mode table in rule 15:
 * does `task:verify` of a card defer its full-suite commands, in the main folder and in a lane?
 * A mode that is not in the table (config built without loadConfig) defers nothing.
 */
export const VERIFY_DEFERS = {
  "every-card": { main: false, lane: false },
  targeted: { main: false, lane: true },
  milestone: { main: true, lane: true },
};

/** Placeholder in `stack.commands.testFiles` that is replaced by the quoted file paths. */
export const FILES_PLACEHOLDER = "{files}";

/** Rule 9: the trimmed command equals the non-empty value of a FULL_SUITE_KEYS command. */
export function isFullSuite(config, cmd) {
  const c = String(cmd).trim();
  return FULL_SUITE_KEYS.some((k) => {
    const v = (config.stack?.commands?.[k] ?? "").trim();
    return v !== "" && v === c;
  });
}

/** Rule 15, verify column. */
export function defersAtVerify(config, inLane) {
  return VERIFY_DEFERS[config.workflow?.testMode]?.[inLane ? "lane" : "main"] ?? false;
}

/** Rule 10: test files the card changed that still exist, plus test files holding one of the card's scenario ids. */
export function targetedFiles(root, card, changedFiles) {
  const out = new Set(changedFiles.filter((f) => isTestFile(f) && existsSync(join(root, f))));
  const ids = card.scenarios ?? [];
  if (ids.length) {
    const tests = listRepoFiles(root).filter(isTestFile);
    for (const hit of findScenarioTests(tests, (f) => readFileSync(join(root, f), "utf8"), ids).values()) for (const h of hit) out.add(h.file);
  }
  return [...out].sort();
}

const quoteShell = (f) => (IS_WINDOWS ? quoteWindowsArg(f) : `'${f.replace(/'/g, `'\\''`)}'`);

/** Rule 8 and 11: `stack.commands.testFiles` with the quoted paths; null when it is unset/empty, has no placeholder, or no files. */
export function targetedCommand(config, files) {
  const template = (config.stack?.commands?.testFiles ?? "").trim();
  if (!template || !template.includes(FILES_PLACEHOLDER) || !files.length) return null;
  const list = files.map(quoteShell).join(" ");
  return template.split(FILES_PLACEHOLDER).join(list);
}
