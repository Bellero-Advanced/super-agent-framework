import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, gitRepo, lib, tmp } from "../helpers.mjs";

const { refreshKitFiles } = await lib("generate.mjs");
const { init } = await import(pathToFileURL(join(REPO, "src", "install.mjs")).href);
after(cleanup);

const ANSWERS = { stack: { packageManager: "npm" }, workflow: { measure: { enabled: false } } };
const SAF_CLI = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
const REPO_CLI = join(REPO, "bin", "cli.mjs");

/** Every file under root (bytes hashed), nothing skipped. */
function snapshot(root) {
  const out = {};
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) visit(abs);
      else out[abs.slice(root.length + 1).split("\\").join("/")] = createHash("sha256").update(readFileSync(abs)).digest("hex");
    }
  };
  visit(root);
  return out;
}

async function project() {
  const root = gitRepo();
  await init(root, { answers: ANSWERS });
  return root;
}

test("RERUN-AC-10 a keep request the CLI cannot read exits 2 with the usage line and writes nothing", async () => {
  const root = await project();
  writeFileSync(join(root, "CLAUDE.md"), `${readFileSync(join(root, "CLAUDE.md"), "utf8")}\nour note\n`);
  const answers = join(tmp("saf-answers-"), "answers.json");
  writeFileSync(answers, JSON.stringify(ANSWERS));
  const before = snapshot(root);
  const variants = [["--keep=CLAUDE.md"], ["--keep", ","], ["--keep", " , "], ["--keep", ""]];
  for (const keep of variants) {
    for (const dry of [[], ["--dry-run"]]) {
      const r = spawnSync(process.execPath, [SAF_CLI, "setup", "--answers", answers, ...keep, ...dry], { cwd: root, encoding: "utf8" });
      const label = JSON.stringify([...keep, ...dry]);
      assert.equal(r.status, 2, `${label} exits 2`);
      assert.match(r.stderr, /usage: setup --answers <file\.json>/, label);
      assert.deepEqual(snapshot(root), before, `${label} writes nothing`);
    }
  }
  assert.equal(existsSync(join(root, "docs", "archive", "pre-saf")), false, "nothing archived");
});

test("RERUN-AC-11 upgrade stops before its first write on a saf.config.json it cannot read", async () => {
  for (const broken of ["{ nope", "[]"]) {
    const root = await project();
    writeFileSync(join(root, "saf.config.json"), broken);
    writeFileSync(join(root, "tools", "saf", "OLD-COPY-MARKER"), "old");
    const before = snapshot(root);
    const r = spawnSync(process.execPath, [REPO_CLI, "upgrade", "--dir", root], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `${broken} exits 1`);
    const text = `${r.stdout}${r.stderr}`;
    assert.match(text, /saf\.config\.json is not (valid JSON|a JSON object) — upgrade changed nothing/, broken);
    assert.doesNotMatch(text, /\n\s+at /, "no stack trace");
    assert.deepEqual(snapshot(root), before, `${broken} leaves every file byte-identical`);
    assert.equal(existsSync(join(root, "tools", "saf", "OLD-COPY-MARKER")), true, "old engine copy kept");

    const report = refreshKitFiles(root);
    assert.equal(report.written.length + report.removed.length, 0);
    assert.ok(report.warnings.some((w) => w.includes("saf.config.json is not valid JSON")), "warning names the file");
    assert.deepEqual(snapshot(root), before, "refreshKitFiles writes nothing");
  }
});
