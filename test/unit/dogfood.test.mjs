import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { REPO } from "../helpers.mjs";

/**
 * This repository uses SAF on itself. The installed copy (tools/saf/ and .claude/skills/saf-setup/) must be exactly the
 * kit it ships — otherwise the maintainers would be testing one engine and running another.
 * The example project's engine copy must match too. Fix a failure with `npm run saf:refresh`
 * (example: `node bin/cli.mjs upgrade --dir examples/todo-api`).
 */
const files = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else out.push(relative(dir, join(d, e.name)).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
};
const text = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

for (const [kit, installed] of [["kit/tools-saf", "tools/saf"], ["kit/claude/skills/saf-setup", ".claude/skills/saf-setup"], ["kit/tools-saf", "examples/todo-api/tools/saf"]]) {
  test(`the installed ${installed}/ equals ${kit}/ (refresh with saf upgrade)`, { skip: existsSync(join(REPO, installed)) ? false : `${installed}/ is not installed in this checkout` }, () => {
    const a = join(REPO, kit);
    const b = join(REPO, installed);
    assert.deepEqual(files(b), files(a), "same file list");
    const differ = files(a).filter((f) => text(join(a, f)) !== text(join(b, f)));
    assert.deepEqual(differ, [], "same content");
  });
}
