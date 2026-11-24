import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO } from "../helpers.mjs";

/**
 * Wording of the setup skill and the user docs against the code they describe (T-M3-23).
 * Every check looks inside one step, one section or one sentence, never at words anywhere in the file.
 */
const read = (...p) => readFileSync(join(REPO, ...p), "utf8").replace(/\r\n/g, "\n");
const flat = (s) => s.replace(/\s+/g, " ");
const SKILL = read("kit", "claude", "skills", "saf-setup", "SKILL.md");

/** The text from `from` up to (not including) the first `to` after it. */
function part(text, from, to) {
  const i = text.indexOf(from);
  assert.ok(i >= 0, `found: ${from}`);
  const rest = text.slice(i);
  const j = to === undefined ? -1 : rest.indexOf(to, from.length);
  return j < 0 ? rest : rest.slice(0, j);
}
/** The sentences of a text (whitespace flattened) that hold `phrase`. */
function sentences(text, phrase) {
  const out = flat(text).split(/\.\s+/).filter((s) => s.includes(phrase));
  assert.ok(out.length > 0, `a sentence with: ${phrase}`);
  return out;
}

const RERUN = "**Before generating on a re-run**";

test("RERUN-AC-22 docs/upgrade.md says a deleted living file is created again and never promises an unconditional reset-free plan", () => {
  const up = flat(read("docs", "upgrade.md"));
  assert.ok(!/never reset/i.test(up), "no 'never reset'");
  const s = sentences(up, "living files")[0];
  assert.match(s, /keeps an edited one as it is/);
  const created = sentences(up, "created again");
  assert.ok(created.some((x) => /deleted/.test(x) && /from the template/.test(x)), "deleted -> created again from the template");
});

test("RERUN-AC-22 the skill's Re-running section says a deleted living file is created again", () => {
  const re = part(SKILL, "## Re-running");
  assert.ok(sentences(re, "created again").some((x) => /deleted/.test(x) && /living file/.test(x)));
});

test("RERUN-AC-22 the skill's re-run step 3 shows --keep quoting for single quotes (macOS, Linux) and double quotes (Windows)", () => {
  const step = flat(part(SKILL, "3. Every file answered", "4. List every"));
  const quoting = sentences(step, "holds spaces")[0];
  assert.match(quoting, /single quotes on macOS and Linux/);
  assert.match(quoting, /double quotes on Windows/);
  assert.ok(step.includes("--keep 'docs/my notes.md'"), "single-quoted example");
  assert.ok(step.includes('--keep "docs/my notes.md"'), "double-quoted example");
});

test("RERUN-AC-22 the skill's re-run step 1 says how a dry-run line splits and which lines it leaves out", () => {
  const step = flat(part(SKILL, RERUN, "2. For each `replace-edited`"));
  const split = sentences(step, "two spaces")[0];
  assert.match(split, /action padded with spaces to a fixed width, then the path, then two spaces and the reason/);
  assert.match(split, /reason is the text after the two spaces that follow the path/);
  assert.ok(!/the action, a space/.test(step), "the one-space wording is gone");
  const left = sentences(step, "per-file")[0];
  assert.match(left, /leaving out only/);
  assert.match(left, /action is `same`/);
  const merges = sentences(step, "merges:")[0];
  assert.match(merges, /whole/);
  assert.match(merges, /<path>: same/);
});

test("SETUP-AC-15 the skill asks the chat-language question first with `choices --group 1 --lang en` and does not show that table again", () => {
  const para = flat(part(SKILL, "**Before each group**", "- Show each question's options"));
  const first = sentences(para, "--group 1 --lang en")[0];
  assert.match(first, /chat-language question/);
  assert.match(first, /first/);
  assert.match(first, /option table together with the question/);
  assert.match(first, /table is in English/);
  const later = sentences(para, "--group 1 --lang <chat language>")[0];
  assert.match(later, /do not show the chat-language table again/);
  assert.ok(!/right after that answer and before the other group-1 questions/.test(para), "the old one-run wording is gone");
});

test("LCAP-AC-07 docs/card-lifecycle.md 'Per machine' says the local file is absent in a lane worktree and what lane verifies use", () => {
  const item = flat(part(read("docs", "card-lifecycle.md"), "- **Per machine.**", "\n\n"));
  const s = sentences(item, "absent inside a lane worktree")[0];
  assert.match(s, /saf\.config\.local\.json/);
  assert.match(s, /git-ignored/);
  assert.match(s, /lane card's `task:verify`/);
  assert.match(s, /use the repository's lane caps, and its test mode unless `SAF_TEST_MODE` is set/);
});

test("LCAP-AC-07 the skill's per-machine paragraph says the local file is absent in a lane worktree and what lane verifies use", () => {
  const para = part(SKILL, "Test mode and the two lane caps are per-machine", "\n\n");
  const s = sentences(para, "absent inside a lane worktree")[0];
  assert.match(s, /git-ignores/);
  assert.match(s, /lane card's `task:verify`/);
  assert.match(s, /use the repository's lane caps, and its test mode unless `SAF_TEST_MODE` is set/);
});

test("LANG-AC-06 docs/config-reference.md language rows name text.mjs and hold no hand-made language list", () => {
  const rows = read("docs", "config-reference.md").split("\n").filter((l) => /^\| `(docLanguage|reportLanguage)`/.test(l));
  assert.equal(rows.length, 2, "the document/chat row and the report row");
  for (const row of rows) {
    assert.ok(row.includes("text.mjs"), `names the source: ${row.slice(0, 40)}`);
    assert.ok(!/`en`\s*(or|·|\/|,)\s*`th`|\ben\b\s*(or|\/)\s*\bth\b/.test(row), `no hand-made list: ${row.slice(0, 40)}`);
  }
  const doc = rows[0];
  assert.ok(doc.includes("../CONTRIBUTING.md#add-a-document-language"), "links the steps to add a language");
  assert.match(doc, /schema/);
});
