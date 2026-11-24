import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { REPO, cleanup, lib, tmp, write } from "../helpers.mjs";

const { PACK, PACK_LIMITS, packHash, packShowLines, readPack } = await lib("packs.mjs");
const SAF = join(REPO, "kit", "tools-saf", "bin", "saf.mjs");
after(cleanup);

const show = (cwd, ...args) => spawnSync(process.execPath, [SAF, "pack", "show", ...args], { cwd, encoding: "utf8" });
const skillText = (name, extra = "") => `---\nname: ${name}\ndescription: Does ${name} things\n${extra}---\n\n# ${name}\n\nRun {{cmd.taskVerify}} first.\n`;
const at = (root, rel) => join(root, ...rel.split("/"));

/** A valid pack with two skills, a README and a run.sh; `edit(root)` may change the files before it is read. */
function fixture(edit, manifest = {}) {
  const root = tmp("saf-pack-");
  write(root, "saf-pack.json", { name: "team-pack", version: "1.2.0", description: "Our team skills", skills: ["alpha", "beta"], ...manifest });
  write(root, "skills/alpha/SKILL.md", skillText("alpha", "allowed-tools: Read, Grep, Bash(git status:*)\n"));
  write(root, "skills/alpha/notes/more.md", "# more\n");
  write(root, "skills/beta/SKILL.md", skillText("beta"));
  write(root, "README.md", "# readme\n");
  write(root, "run.sh", "#!/bin/sh\necho hi\n");
  edit?.(root);
  return root;
}
/** Every path below a folder with its size, to prove nothing was written. */
function snapshot(root, rel = "") {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const p = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? [`${p}/`, ...snapshot(root, p)] : [`${p}:${statSync(join(root, p)).size}`];
  });
}

test("PACK-AC-01 pack show prints name, version, skills with tools, installed files with sizes, refused files, the hash and the entry, and writes nothing", () => {
  const pack = fixture();
  const cwd = tmp("saf-cwd-");
  const before = [snapshot(pack), snapshot(cwd)];
  const r = show(cwd, pack);
  assert.equal(r.status, 0, r.stderr);
  const text = r.stdout.replace(/\r\n/g, "\n");
  for (const want of ["Pack team-pack 1.2.0", "Our team skills", "alpha — Does alpha things", "beta — Does beta things", "asks for tools: Read, Grep, Bash(git status:*)", "asks for tools: none"]) {
    assert.ok(text.includes(want), want);
  }
  for (const f of ["skills/alpha/SKILL.md", "skills/alpha/notes/more.md", "skills/beta/SKILL.md"]) assert.ok(text.includes(`${f}  (${statSync(at(pack, f)).size} bytes)`), f);
  assert.match(text, /Files refused, never copied \(2\):/);
  assert.match(text, /README\.md — not inside the folder of a listed skill/);
  assert.match(text, /run\.sh — not inside the folder of a listed skill/);
  const res = readPack(pack);
  assert.ok(res.ok, res.problems.join());
  assert.ok(text.includes(`Content hash: ${res.hash}`));
  assert.ok(text.includes(JSON.stringify({ path: pack, sha256: res.hash })), "the entry is printed as JSON with the path as given");
  assert.deepEqual([snapshot(pack), snapshot(cwd)], before, "no file appears in the pack folder or the working folder");
});

test("PACK-AC-01 pack show runs nothing from the pack and the engine file has no process, network, write or dynamic-code call", () => {
  const marker = tmp("saf-mark-");
  const pack = fixture((root) => {
    write(root, "skills/alpha/hook.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(marker, "ran"))}, "x");`);
    write(root, "index.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(marker, "ran2"))}, "x");`);
    write(root, "package.json", { scripts: { postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(join(marker, "ran3"))},'x')"` } });
  });
  const r = show(tmp("saf-cwd-"), pack);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(marker), [], "nothing in the pack was run");
  assert.match(r.stdout, /skills\/alpha\/hook\.mjs — not a Markdown \(\.md\) file/);
  const source = readFileSync(join(REPO, "kit", "tools-saf", "lib", "packs.mjs"), "utf8");
  const banned = ["child_process", "import\\(", "fetch\\(", "https?:", "writeFile", "mkdir", "rmSync", "unlink", "rename", "copyFile", "\\beval\\b", `new ${"Func"}tion`];
  for (const word of banned) assert.doesNotMatch(source, new RegExp(word), word);
});

test("PACK-AC-01 pack show cleans control characters from every text the pack supplies and needs exactly one folder argument", () => {
  const esc = String.fromCharCode(27);
  const bidi = String.fromCharCode(0x202e);
  const hidden = [0x61c, 0x2060, 0x2064, 0xe0041].map((c) => String.fromCodePoint(c)).join("");
  const pack = fixture((root) => {
    write(root, "saf-pack.json", { name: "team-pack", version: `1.0${esc}[2J`, description: `Hi${esc}]0;owned\nsecond line${bidi}${hidden}`, skills: ["alpha"] });
    write(root, "skills/alpha/SKILL.md", `---\nname: alpha\ndescription: Nice${esc}[31m red\nallowed-tools: Read${esc}[0m\n---\nbody\n`);
    try {
      write(root, `evil${esc}[31m.txt`, "x");
    } catch {
      /* a file system may refuse the name: the other fields still prove the cleaning */
    }
  });
  const r = show(tmp("saf-cwd-"), pack);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(/[\u0000-\u0009\u000b-\u001f\u007f\u061c\u2060-\u2064\u202e\u{e0000}-\u{e007f}]/u.test(r.stdout), false, "no control or hidden character reaches the screen");
  assert.match(r.stdout, /Pack team-pack 1\.0\?\[2J/);
  for (const args of [[], [pack, pack], ["--help"], ["-x"]]) {
    const u = show(tmp("saf-cwd-"), ...args);
    assert.equal(u.status, 2, args.join(" "));
    assert.match(u.stderr, /^usage: pack show <path>/);
    assert.equal(u.stdout, "");
  }
  assert.equal(spawnSync(process.execPath, [SAF, "pack"], { cwd: tmp("saf-cwd-"), encoding: "utf8" }).status, 2);
});

test("PACK-AC-02 each broken pack exits 1 and names its problem", () => {
  const cases = [
    ["no saf-pack.json", () => tmp("saf-pack-"), /there is no saf-pack\.json/],
    ["a listed skill without SKILL.md", () => fixture((x) => { write(x, "skills/beta/extra.md", "x"); rmSync(at(x, "skills/beta/SKILL.md")); }), /skill "beta" has no skills\/beta\/SKILL\.md/],
    ["a listed skill without a folder", () => fixture(null, { skills: ["alpha", "beta", "gamma"] }), /skill "gamma" has no folder skills\/gamma\//],
    ["frontmatter name different from the folder", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("other"))), /skills\/beta\/SKILL\.md frontmatter name is not "beta"/],
    ["no description", () => fixture((x) => write(x, "skills/beta/SKILL.md", "---\nname: beta\n---\nbody\n")), /skills\/beta\/SKILL\.md frontmatter has no description/],
    ["no frontmatter", () => fixture((x) => write(x, "skills/beta/SKILL.md", "# beta\n")), /skills\/beta\/SKILL\.md has no frontmatter/],
    ["a hooks key in a SKILL.md", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", "hooks:\n  PreToolUse: x\n"))), /frontmatter key "hooks" is not allowed/],
    ["a skill named tdd", () => fixture((x) => write(x, "skills/tdd/SKILL.md", skillText("tdd")), { skills: ["alpha", "tdd"] }), /skill "tdd" clashes with a core skill/],
    ["a skill named like a kit pack", () => fixture((x) => write(x, "skills/game/SKILL.md", skillText("game")), { skills: ["game"] }), /skill "game" clashes with a kit skill pack/],
    ["a skill named saf-setup", () => fixture((x) => write(x, "skills/saf-setup/SKILL.md", skillText("saf-setup")), { skills: ["saf-setup"] }), /skill "saf-setup" clashes with the setup skill/],
    ["a path that leaves the pack in the skill list", () => fixture(null, { skills: ["alpha", "../beta"] }), /"skills" must be a non-empty list/],
    ["an absolute path in the skill list", () => fixture(null, { skills: ["/etc"] }), /"skills" must be a non-empty list/],
    ["a manifest that is not JSON", () => fixture((x) => write(x, "saf-pack.json", "{ nope")), /saf-pack\.json is not valid JSON/],
    ["an empty version", () => fixture(null, { version: " " }), /"version" must be non-empty text/],
    ["more files than PACK_LIMITS", () => fixture((x) => { for (let i = 0; i <= PACK_LIMITS.files; i++) write(x, `skills/alpha/n/${i}.md`, "x"); }), /more than 200 files to install/],
    ["a file larger than PACK_LIMITS", () => fixture((x) => write(x, "skills/alpha/big.md", "x".repeat(PACK_LIMITS.fileBytes + 1))), /skills\/alpha\/big\.md is larger than 262144 bytes/],
    ["more bytes than PACK_LIMITS", () => fixture((x) => { for (let i = 0; i < 5; i++) write(x, `skills/alpha/f${i}.md`, "x".repeat(PACK_LIMITS.fileBytes - 1)); }), /more than 1048576 bytes/],
    ["more entries than PACK_LIMITS", () => fixture((x) => { for (let i = 0; i <= PACK_LIMITS.entries; i++) write(x, `docs/${i}.txt`, ""); }), /more than 2000 files and folders/],
    ["a text file with a zero byte", () => fixture((x) => writeFileSync(at(x, "skills/alpha/zero.md"), Buffer.from("fine\0text"))), /skills\/alpha\/zero\.md is not plain UTF-8 text/],
    ["51 asked tools (the 51st would be hidden by a cut)", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", `allowed-tools: [${Array.from({ length: PACK_LIMITS.tools }, (_, i) => `T${i}`).join(", ")}, "Bash(*)"]\n`))), /skills\/beta\/SKILL\.md asks for more than 50 tools/],
    ["allowed-tools written as a mapping", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", "allowed-tools:\n  Bash: all\n"))), /skills\/beta\/SKILL\.md frontmatter "allowed-tools" must be text or a list of text/],
    ["allowed-tools as a list holding a mapping", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", "allowed-tools:\n  - Read\n  - Bash: all\n"))), /"allowed-tools" must be text or a list of text/],
    ["a tool longer than PACK_LIMITS", () => fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", `allowed-tools: Bash(${"a".repeat(PACK_LIMITS.toolChars)}:*)\n`))), /asks for a tool whose name is longer than 100 characters/],
    ["a saf-pack.json that is not UTF-8", () => fixture((x) => writeFileSync(at(x, "saf-pack.json"), Buffer.concat([Buffer.from('{"name":"team-pack","version":"1","description":"d","skills":["alpha"],"x":"'), Buffer.from([0xff]), Buffer.from('"}')]))), /saf-pack\.json is not valid JSON in plain UTF-8 text/],
    ["a binary file named .md", () => fixture((x) => writeFileSync(at(x, "skills/alpha/bin.md"), Buffer.from([0x89, 0, 0xff, 0xfe]))), /skills\/alpha\/bin\.md is not plain UTF-8 text/],
  ];
  for (const [label, build, want] of cases) {
    const r = show(tmp("saf-cwd-"), build());
    assert.equal(r.status, 1, `${label}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /is not a valid skill pack/, label);
    assert.match(r.stderr, want, label);
    assert.equal(r.stdout, "", `${label}: nothing is presented as installable`);
  }
});

test("PACK-AC-02 a symbolic link anywhere in the pack makes it invalid and is never followed", (t) => {
  const outside = tmp("saf-outside-");
  write(outside, "secret.md", "TOP SECRET\n");
  const pack = fixture();
  const link = join(tmp("saf-cwd-"), "pack-link");
  try {
    symlinkSync(outside, join(pack, "skills", "alpha", "linked"), "dir");
    symlinkSync(join(outside, "secret.md"), join(pack, "skills", "beta", "leak.md"), "file");
    symlinkSync(pack, link, "dir");
  } catch (e) {
    t.skip(`this system does not let the test make symbolic links (${e.code})`);
    return;
  }
  const r = show(tmp("saf-cwd-"), pack);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skills\/alpha\/linked is a symbolic link/);
  assert.match(r.stderr, /skills\/beta\/leak\.md is a symbolic link/);
  assert.doesNotMatch(r.stdout + r.stderr, /TOP SECRET/);
  assert.ok(!readPack(pack).files.some((f) => /leak|linked/.test(f.path)), "a linked file is not in the install list");
  const viaLink = show(tmp("saf-cwd-"), link);
  assert.equal(viaLink.status, 1, "the pack folder itself being a link is refused too");
  assert.match(viaLink.stderr, /is a symbolic link/);
});

test("PACK-AC-02 a pack folder inside .claude/skills and a name taken by another pack are refused; an unlisted skill folder is listed as refused", () => {
  const inside = join(tmp("saf-proj-"), ".claude", "skills", "team-pack");
  mkdirSync(inside, { recursive: true });
  const src = fixture();
  for (const f of ["saf-pack.json", "skills/alpha/SKILL.md", "skills/beta/SKILL.md"]) write(inside, f, readFileSync(at(src, f), "utf8"));
  assert.match(readPack(inside).problems.join("\n"), /installing it would copy it over itself/);
  const pack = fixture((x) => write(x, "skills/gamma/SKILL.md", skillText("gamma")));
  assert.deepEqual(readPack(pack, { taken: ["beta"] }).problems, ['skill "beta" clashes with a skill of another pack']);
  assert.deepEqual(readPack(pack, { taken: ["team-pack"] }).problems, ['pack name "team-pack" is already used by another pack']);
  const res = readPack(pack);
  assert.ok(res.ok, res.problems.join());
  assert.ok(res.refused.some((r) => r.path === "skills/gamma/SKILL.md" && /not inside the folder of a listed skill/.test(r.why)));
});

test("PACK-AC-02 file names a pack may not install (odd characters, reserved Windows names, upper-case extension, .git) are refused, never installed", () => {
  const pack = fixture((x) => {
    write(x, "skills/alpha/CON.md", "x");
    write(x, "skills/alpha/a b.md", "x");
    write(x, "skills/alpha/.hidden.md", "x");
    write(x, "skills/alpha/UPPER.MD", "x");
    write(x, ".git/config", "[core]\n");
  });
  const res = readPack(pack);
  assert.ok(res.ok, res.problems.join());
  assert.deepEqual(res.files.map((f) => f.path), ["skills/alpha/SKILL.md", "skills/alpha/notes/more.md", "skills/beta/SKILL.md"]);
  const refused = Object.fromEntries(res.refused.map((r) => [r.path, r.why]));
  for (const p of ["skills/alpha/CON.md", "skills/alpha/a b.md", "skills/alpha/.hidden.md"]) assert.match(refused[p], /its name uses characters or a name a pack file may not have/, p);
  assert.match(refused["skills/alpha/UPPER.MD"], /not a Markdown/);
  assert.match(refused[".git/"], /not looked at/);
  assert.ok(!res.refused.some((r) => r.path.startsWith(".git/") && r.path !== ".git/"), "the .git folder is not walked");
});

test("PACK-AC-03 packHash is the same for LF and CRLF, changes with one byte of a SKILL.md and ignores refused files", () => {
  const pack = fixture();
  const res = readPack(pack);
  const paths = res.files.map((f) => f.path);
  assert.match(res.hash, /^[0-9a-f]{64}$/);
  assert.equal(packHash(pack, paths), res.hash);
  assert.equal(packHash(pack, res.files), res.hash, "objects with a path work too");
  assert.equal(packHash(pack, [...paths].reverse()), res.hash, "the order given does not matter");

  const crlf = fixture((x) => {
    for (const f of [...paths, "saf-pack.json"]) writeFileSync(at(x, f), readFileSync(at(pack, f), "utf8").replace(/\n/g, "\r\n"));
  });
  assert.equal(packHash(crlf, paths), res.hash, "a CRLF checkout hashes the same");
  assert.equal(readPack(crlf).hash, res.hash);

  const changed = fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta").replace("Does beta things", "Does beta thingz")));
  assert.notEqual(packHash(changed, paths), res.hash, "one byte of a SKILL.md");
  assert.notEqual(packHash(fixture(null, { version: "1.2.1" }), paths), res.hash, "saf-pack.json takes part");

  const refusedChanged = fixture((x) => {
    write(x, "README.md", "# a completely different readme\n");
    write(x, "run.sh", "#!/bin/sh\nrm -rf /\n");
    write(x, "extra/file.txt", "new refused file");
  });
  assert.equal(packHash(refusedChanged, paths), res.hash, "refused files do not count");
  assert.equal(readPack(refusedChanged).hash, res.hash);
  assert.throws(() => packHash(pack, ["../etc/passwd.md"]), /not a pack file path/);
  assert.throws(() => packHash(pack, ["run.sh"]), /not a pack file path/);
});

test("PACK-AC-03 the hash is path, zero byte, LF text, zero byte for each file sorted by POSIX path", () => {
  const root = tmp("saf-pack-");
  write(root, "saf-pack.json", "{}\r\n");
  write(root, "skills/b/SKILL.md", "b\r\nline\r\n");
  write(root, "skills/a/SKILL.md", "a\n");
  const expect = createHash("sha256");
  for (const [p, t] of [["saf-pack.json", "{}\n"], ["skills/a/SKILL.md", "a\n"], ["skills/b/SKILL.md", "b\nline\n"]]) expect.update(Buffer.concat([Buffer.from(p), Buffer.from([0]), Buffer.from(t), Buffer.from([0])]));
  assert.equal(packHash(root, ["skills/b/SKILL.md", "skills/a/SKILL.md"]), expect.digest("hex"));
});

test("PACK-AC-01 packShowLines lists the tools of a list-form allowed-tools and prints an entry whose path stays one JSON string", () => {
  const pack = readPack(fixture((x) => write(x, "skills/beta/SKILL.md", skillText("beta", "allowed-tools:\n  - Read\n  - Bash(npm test:*)\n"))));
  const lines = packShowLines(pack, 'my "pack"\\dir');
  assert.ok(lines.includes("    asks for tools: Read, Bash(npm test:*)"));
  assert.ok(lines.some((l) => l.trim() === JSON.stringify({ path: 'my "pack"\\dir', sha256: pack.hash })));
});

test("PACK-AC-02 more entries than PACK_LIMITS stop the walk, and a pack over the file or byte limit lists no skills", () => {
  const many = readPack(fixture((x) => { for (let i = 0; i <= PACK_LIMITS.entries; i++) write(x, `docs/${i}.txt`, ""); }));
  assert.equal(many.ok, false);
  assert.ok(many.refused.length <= PACK_LIMITS.entries, `${many.refused.length} refused files listed`);
  const files = readPack(fixture((x) => { for (let i = 0; i <= PACK_LIMITS.files; i++) write(x, `skills/alpha/n/${i}.md`, "x"); }));
  assert.equal(files.ok, false);
  assert.deepEqual(files.skills, [], "a pack over the file limit is not read further");
  const bytes = readPack(fixture((x) => { for (let i = 0; i < 5; i++) write(x, `skills/alpha/f${i}.md`, "x".repeat(PACK_LIMITS.fileBytes - 1)); }));
  assert.deepEqual(bytes.skills, [], "a pack over the byte limit is not read further");
});

test("PACK-AC-02 two files that differ only by upper and lower case make the pack invalid", (t) => {
  const pack = fixture((x) => write(x, "skills/alpha/Notes.md", "a"));
  write(pack, "skills/alpha/notes.md", "b");
  const names = readdirSync(join(pack, "skills", "alpha")).filter((n) => n.toLowerCase() === "notes.md");
  if (names.length < 2) {
    t.skip("this file system treats Notes.md and notes.md as one file, so the clash cannot be built here");
    return;
  }
  assert.match(readPack(pack).problems.join("\n"), /skills\/alpha\/notes\.md differs from another file only by upper and lower case/);
});

test("PACK-AC-02 a folder that cannot be read is reported with a name cleaned of control characters", (t) => {
  const esc = String.fromCharCode(27);
  const pack = fixture();
  const dir = join(pack, "skills", "alpha", `bad${esc}[31m`);
  try {
    mkdirSync(dir);
    chmodSync(dir, 0o000);
    try {
      readdirSync(dir);
      t.skip("this system lets the test read a folder with mode 000 (for example it runs as the super-user)");
      return;
    } catch {
      /* unreadable, as wanted */
    }
  } catch (e) {
    t.skip(`this system cannot make that folder (${e.code})`);
    return;
  }
  try {
    const text = readPack(pack).problems.join("\n");
    assert.match(text, /cannot be read/);
    assert.equal(text.includes(esc), false, "the folder name is cleaned");
    assert.match(text, /skills\/alpha\/bad\?\[31m cannot be read/);
  } finally {
    chmodSync(dir, 0o700);
  }
});

test("PACK-AC-02 docs/skills.md states the same limits and frontmatter keys as packs.mjs", () => {
  const doc = readFileSync(join(REPO, "docs", "skills.md"), "utf8").replace(/\r\n/g, "\n");
  const rows = Object.fromEntries([...doc.matchAll(/^\| (.+?) \| (\d+) \|$/gm)].map((m) => [m[1], Number(m[2])]));
  const labels = {
    files: "Files to install",
    bytes: "Bytes of all files to install",
    fileBytes: "Bytes of one installed file",
    manifestBytes: "Bytes of `saf-pack.json`",
    entries: "Files and folders looked at",
    depth: "Folder levels",
    skills: "Skills",
    tools: "Asked tools per skill",
    toolChars: "Characters of one asked tool",
  };
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(PACK_LIMITS).filter((k) => k !== "text").sort(), "every limit that makes a pack invalid has a row");
  for (const [key, label] of Object.entries(labels)) assert.equal(rows[label], PACK_LIMITS[key], label);
  const keys = doc.match(/Allowed keys:\n(.+)\n/)?.[1].match(/`[^`]+`/g)?.map((k) => k.slice(1, -1));
  assert.deepEqual(keys, PACK.frontmatterKeys);
});
