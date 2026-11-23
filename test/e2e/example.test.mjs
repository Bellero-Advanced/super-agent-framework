import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO } from "../helpers.mjs";

/** examples/todo-api is a real SAF project: its plan, generated status, evidence and tests must stay valid. */
const EX = join(REPO, "examples", "todo-api");
const node = (...args) => spawnSync(process.execPath, args, { cwd: EX, encoding: "utf8", windowsHide: true });

test("example project: plan valid, status current, every scenario has a test, its own tests pass", () => {
  for (const args of [["tools/saf/bin/saf.mjs", "task", "state", "--check"], ["tools/saf/bin/saf.mjs", "spec-matrix", "--complete=todos"], ["tools/saf/bin/saf.mjs", "check-secrets"], ["--test", "test/"]]) {
    const r = node(...args);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stdout}${r.stderr}`);
  }
  for (const id of ["T-M0-01", "T-M1-01", "T-M1-02", "T-M1-03"]) {
    const ev = JSON.parse(readFileSync(join(EX, "docs/plan/evidence", `${id}.json`), "utf8"));
    assert.equal(ev.status, "done", id);
    assert.ok(ev.verified.pass && ev.verified.commands.every((c) => c.exit === 0), id);
  }
  for (const m of ["M0", "M1"]) {
    const gates = JSON.parse(readFileSync(join(EX, "docs/plan/evidence", `${m}.json`), "utf8")).verified.gates;
    assert.ok(gates.every((g) => g.pass !== false) && gates.some((g) => g.pass === true), `${m}: every machine-checked gate passed`);
  }
});
