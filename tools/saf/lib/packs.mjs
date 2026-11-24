import { createHash } from "node:crypto";
import { lstatSync, opendirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORE_SKILLS, SKILL_PACKS } from "./config.mjs";
import { frontmatter } from "./markdown.mjs";
import { parseYaml } from "./yaml.mjs";

/**
 * Skill packs from other repositories (docs/specs/skill-packs.md). A pack is third-party text that agents will follow, so
 * this file only READS: it never writes, never executes, never imports and never fetches anything from a pack. Files are
 * looked at with `lstat` (a symbolic link is a problem, never followed) and only regular `.md` files inside a listed skill
 * folder are ever read. Everything a pack supplies that is printed passes through `safe()` first.
 */

/** Data, not logic: every limit and pattern in one table. */
export const PACK_LIMITS = {
  files: 200, // installed files in the whole pack
  bytes: 1024 * 1024, // total size of the installed files
  fileBytes: 256 * 1024, // one installed file
  manifestBytes: 64 * 1024, // saf-pack.json
  entries: 2000, // every file and folder looked at (refused ones too), so a huge tree is not walked to the end
  depth: 8, // folder levels below the pack folder
  skills: 50,
  text: 300, // longest pack-supplied text printed (description, version)
  tools: 50, // asked tools listed per skill
};

export const PACK = {
  manifest: "saf-pack.json",
  skillsDir: "skills",
  skillFile: "SKILL.md",
  extension: ".md",
  /** skill names, pack names and each folder or file name of an installed path */
  namePattern: /^[a-z0-9][a-z0-9-]{0,63}$/,
  segmentPattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
  windowsReserved: /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i,
  vcsFolder: ".git", // listed as refused, never walked
  ownSkillsFolder: [".claude", "skills"], // a pack inside this folder would install over itself
  /** frontmatter keys a pack skill may use; the rest (hooks, shell, model, context, agent …) can run or redirect things */
  frontmatterKeys: ["name", "description", "when_to_use", "argument-hint", "disable-model-invocation", "user-invocable", "allowed-tools", "license", "metadata", "version"],
  reserved: ["saf-setup"],
  unprintable: /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g,
};

const M = {
  noManifest: (p) => `${p} is not a skill pack: there is no ${PACK.manifest} in it`,
  badManifest: (why) => `${PACK.manifest} ${why}`,
  symlink: (p) => `${p} is a symbolic link — a pack may not contain one`,
  notRegular: (p) => `${p} is neither a file nor a folder`,
  tooMany: (what, n) => `the pack has more than ${n} ${what}`,
  tooBig: (p, n) => `${p} is larger than ${n} bytes`,
  tooDeep: (p) => `${p} is nested deeper than ${PACK_LIMITS.depth} folders`,
  noSkillFolder: (s) => `skill "${s}" has no folder ${PACK.skillsDir}/${s}/`,
  noSkillFile: (s) => `skill "${s}" has no ${PACK.skillsDir}/${s}/${PACK.skillFile}`,
  notText: (p) => `${p} is not plain UTF-8 text`,
  noFrontmatter: (p) => `${p} has no frontmatter`,
  badFrontmatter: (p, why) => `${p} frontmatter cannot be read (${why})`,
  nameMismatch: (p, folder) => `${p} frontmatter name is not "${folder}" (the folder name)`,
  noDescription: (p) => `${p} frontmatter has no description`,
  keyNotAllowed: (p, k) => `${p} frontmatter key "${k}" is not allowed in a pack skill`,
  clash: (name, with_) => `skill "${name}" clashes with ${with_}`,
  packTaken: (n) => `pack name "${n}" is already used by another pack`,
  caseClash: (p) => `${p} differs from another file only by upper and lower case`,
  insideSkills: (p) => `${p} is inside ${PACK.ownSkillsFolder.join("/")}/ — installing it would copy it over itself`,
  refusedNotListed: "not inside the folder of a listed skill",
  refusedNotMd: "not a Markdown (.md) file",
  refusedName: "its name uses characters or a name a pack file may not have",
  refusedVcs: "version-control data, not looked at",
  refusedSize: "too large to install",
};

/** Text from a pack made safe to print: control characters (terminal escapes), line breaks and hidden direction marks become `?`/space, and it is cut short. */
export function safe(value, max = PACK_LIMITS.text) {
  const text = String(value ?? "").replace(/\s+/g, " ").replace(PACK.unprintable, "?").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const noCr = (s) => s.replace(/\r\n/g, "\n");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const goodSegments = (rel) => rel.split("/").every((s) => PACK.segmentPattern.test(s) && !PACK.windowsReserved.test(s) && !s.includes(".."));

/** Asked tools: a list, or text separated by commas or spaces outside parentheses (`Bash(git add:*)` stays one tool). */
function toolsOf(value) {
  const items = Array.isArray(value) ? value.map(String) : typeof value === "string" ? splitTools(value) : [];
  return items.map((t) => safe(t, 100)).filter(Boolean).slice(0, PACK_LIMITS.tools);
}
function splitTools(text) {
  const out = [];
  let cur = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "," || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Every entry below `dir` (relative POSIX paths), by `lstat` only; stops once the entry budget is spent. */
function walk(root, problems) {
  const found = [];
  let spent = 0;
  const visit = (rel, depth) => {
    const names = [];
    let handle;
    try {
      handle = opendirSync(rel ? join(root, ...rel.split("/")) : root);
      for (let e = handle.readSync(); e; e = handle.readSync()) {
        if (++spent > PACK_LIMITS.entries) break;
        names.push(e.name);
      }
    } catch {
      problems.push(`${rel || "the pack folder"} cannot be read`);
    } finally {
      handle?.closeSync();
    }
    if (spent > PACK_LIMITS.entries) return;
    for (const name of names.sort()) {
      const path = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = lstatSync(join(root, ...path.split("/")));
      } catch {
        problems.push(`${safe(path)} cannot be read`);
        continue;
      }
      if (st.isSymbolicLink()) problems.push(M.symlink(safe(path)));
      else if (st.isDirectory()) {
        if (!rel && name === PACK.vcsFolder) found.push({ path, kind: "vcs" });
        else if (depth >= PACK_LIMITS.depth) problems.push(M.tooDeep(safe(path)));
        else visit(path, depth + 1);
      } else if (st.isFile()) found.push({ path, kind: "file", size: st.size });
      else problems.push(M.notRegular(safe(path)));
    }
  };
  visit("", 0);
  if (spent > PACK_LIMITS.entries) problems.push(M.tooMany("files and folders", PACK_LIMITS.entries));
  return found;
}

function readText(root, rel) {
  const buf = readFileSync(join(root, ...rel.split("/")));
  if (buf.length > PACK_LIMITS.fileBytes) return { tooBig: true };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return text.includes("\u0000") ? { binary: true } : { text, size: buf.length };
  } catch {
    return { binary: true };
  }
}

function readManifest(root, problems) {
  const path = join(root, PACK.manifest);
  let st;
  try {
    st = lstatSync(path);
  } catch {
    problems.push(M.noManifest(safe(root)));
    return null;
  }
  if (st.isSymbolicLink()) {
    problems.push(M.symlink(PACK.manifest));
    return null;
  }
  if (!st.isFile() || st.size > PACK_LIMITS.manifestBytes) {
    problems.push(M.badManifest(st.isFile() ? `is larger than ${PACK_LIMITS.manifestBytes} bytes` : "is not a file"));
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    problems.push(M.badManifest("is not valid JSON"));
    return null;
  }
  if (!isObject(raw)) {
    problems.push(M.badManifest("is not a JSON object"));
    return null;
  }
  let ok = true;
  const bad = (why) => {
    problems.push(M.badManifest(why));
    ok = false;
  };
  if (typeof raw.name !== "string" || !PACK.namePattern.test(raw.name)) bad(`"name" must be lower-case letters, digits and "-" (at most 64)`);
  if (typeof raw.version !== "string" || !raw.version.trim()) bad(`"version" must be non-empty text`);
  if (typeof raw.description !== "string" || !raw.description.trim()) bad(`"description" must be non-empty text`);
  const list = raw.skills;
  if (!Array.isArray(list) || !list.length || list.length > PACK_LIMITS.skills || list.some((s) => typeof s !== "string" || !PACK.namePattern.test(s)) || new Set(list).size !== list.length) {
    bad(`"skills" must be a non-empty list of at most ${PACK_LIMITS.skills} different names (lower-case letters, digits and "-")`);
  }
  return ok ? { name: raw.name, version: safe(raw.version), description: safe(raw.description), skills: list } : null;
}

function clashOf(skill, taken) {
  if (CORE_SKILLS.includes(skill)) return "a core skill";
  if (SKILL_PACKS.includes(skill)) return "a kit skill pack";
  if (PACK.reserved.includes(skill)) return "the setup skill";
  if (taken.has(skill)) return "a skill of another pack";
  return null;
}

/**
 * Read one pack folder. Never throws for a bad pack: `{ ok: false, problems }`. `taken` = names already used by other packs.
 * @returns {{ ok:boolean, name?:string, version?:string, description?:string, skills:{name:string,description:string,tools:string[],files:string[]}[],
 *   files:{path:string,size:number}[], refused:{path:string,why:string}[], problems:string[], hash:string|null }}
 */
export function readPack(dir, { taken = [] } = {}) {
  const root = resolve(String(dir));
  const takenSet = new Set(taken);
  const problems = [];
  const result = { ok: false, skills: [], files: [], refused: [], problems, hash: null };
  const segments = root.split(/[\\/]/);
  for (let i = 0; i + 1 < segments.length; i++) {
    if (segments[i] === PACK.ownSkillsFolder[0] && segments[i + 1] === PACK.ownSkillsFolder[1]) problems.push(M.insideSkills(safe(root)));
  }
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    problems.push(M.noManifest(safe(root)));
    return result;
  }
  if (rootStat.isSymbolicLink()) problems.push(M.symlink(safe(root)));
  if (!rootStat.isDirectory()) {
    if (!rootStat.isSymbolicLink()) problems.push(M.noManifest(safe(root)));
    return result;
  }
  if (rootStat.isSymbolicLink()) return result;

  const manifest = readManifest(root, problems);
  const entries = walk(root, problems);
  const lower = new Map();
  for (const e of entries) {
    const key = e.path.toLowerCase();
    if (lower.has(key)) problems.push(M.caseClash(safe(e.path)));
    lower.set(key, e.path);
  }
  if (!manifest) return result;
  Object.assign(result, { name: manifest.name, version: manifest.version, description: manifest.description });
  if (takenSet.has(manifest.name)) problems.push(M.packTaken(manifest.name));

  const skillOf = (rel) => {
    const [top, skill] = rel.split("/");
    return top === PACK.skillsDir && manifest.skills.includes(skill) ? skill : null;
  };
  let total = 0;
  for (const e of entries) {
    if (e.kind === "vcs") {
      result.refused.push({ path: `${e.path}/`, why: M.refusedVcs });
      continue;
    }
    if (e.path === PACK.manifest) continue;
    const shown = safe(e.path);
    const skill = skillOf(e.path);
    const why = !skill ? M.refusedNotListed : !e.path.endsWith(PACK.extension) ? M.refusedNotMd : !goodSegments(e.path) ? M.refusedName : e.size > PACK_LIMITS.fileBytes ? M.refusedSize : null;
    if (why) {
      result.refused.push({ path: shown, why });
      if (why === M.refusedSize) problems.push(M.tooBig(shown, PACK_LIMITS.fileBytes));
      continue;
    }
    result.files.push({ path: e.path, size: e.size });
    total += e.size;
  }
  if (result.files.length > PACK_LIMITS.files) problems.push(M.tooMany("files to install", PACK_LIMITS.files));
  if (total > PACK_LIMITS.bytes) problems.push(M.tooMany("bytes of files to install", PACK_LIMITS.bytes));
  if (result.files.length > PACK_LIMITS.files || total > PACK_LIMITS.bytes) return result;

  const present = new Set(result.files.map((f) => f.path));
  for (const skill of manifest.skills) {
    const clash = clashOf(skill, takenSet);
    if (clash) problems.push(M.clash(skill, clash));
    const file = `${PACK.skillsDir}/${skill}/${PACK.skillFile}`;
    if (!entries.some((e) => e.path.startsWith(`${PACK.skillsDir}/${skill}/`))) {
      problems.push(M.noSkillFolder(skill));
      continue;
    }
    const info = { name: skill, description: "", tools: [], files: result.files.map((f) => f.path).filter((p) => p.startsWith(`${PACK.skillsDir}/${skill}/`)) };
    result.skills.push(info);
    if (!present.has(file)) {
      problems.push(M.noSkillFile(skill));
      continue;
    }
    const got = readText(root, file);
    if (got.tooBig || got.binary) {
      problems.push(got.tooBig ? M.tooBig(file, PACK_LIMITS.fileBytes) : M.notText(file));
      continue;
    }
    const fm = frontmatter(got.text);
    if (!fm) {
      problems.push(M.noFrontmatter(file));
      continue;
    }
    let meta;
    try {
      meta = parseYaml(fm.yaml);
    } catch (e) {
      problems.push(M.badFrontmatter(file, safe(e.message, 100)));
      continue;
    }
    if (!isObject(meta)) {
      problems.push(M.badFrontmatter(file, "not a mapping"));
      continue;
    }
    if (meta.name !== skill) problems.push(M.nameMismatch(file, skill));
    if (typeof meta.description !== "string" || !meta.description.trim()) problems.push(M.noDescription(file));
    for (const key of Object.keys(meta)) if (!PACK.frontmatterKeys.includes(key)) problems.push(M.keyNotAllowed(file, safe(key, 60)));
    info.description = safe(meta.description);
    info.tools = toolsOf(meta["allowed-tools"]);
  }
  // an installed file must be plain text too (it is copied into the project); the SKILL.md files were checked above
  for (const f of result.files) {
    if (f.path.endsWith(`/${PACK.skillFile}`) && f.path.split("/").length === 3) continue;
    const got = readText(root, f.path);
    if (got.tooBig || got.binary) problems.push(got.tooBig ? M.tooBig(f.path, PACK_LIMITS.fileBytes) : M.notText(f.path));
  }
  if (!problems.length) {
    result.hash = packHash(root, result.files.map((f) => f.path));
    result.ok = true;
  }
  return result;
}

/**
 * The content hash (rule 6): sha256 over the installed files plus saf-pack.json, sorted by POSIX path, each as
 * path · 0 byte · text with line endings normalised to LF · 0 byte. Refused files never take part.
 * @param {string} dir  @param {(string|{path:string})[]} files installed files, relative POSIX paths
 */
export function packHash(dir, files) {
  const root = resolve(String(dir));
  const paths = [...new Set([...files.map((f) => (typeof f === "string" ? f : f.path)), PACK.manifest])].sort();
  const sum = createHash("sha256");
  for (const rel of paths) {
    if (rel !== PACK.manifest && !(goodSegments(rel) && rel.endsWith(PACK.extension))) throw new Error(`not a pack file path: ${safe(rel)}`);
    const text = noCr(new TextDecoder("utf-8").decode(readFileSync(join(root, ...rel.split("/")))));
    sum.update(rel);
    sum.update(Buffer.from([0]));
    sum.update(text, "utf8");
    sum.update(Buffer.from([0]));
  }
  return sum.digest("hex");
}

/** What `saf pack show` prints for a valid pack (rule 7): lines of text; every pack-supplied part is printable-safe. */
export function packShowLines(pack, given) {
  const bytes = pack.files.reduce((n, f) => n + f.size, 0);
  const lines = [`Pack ${safe(pack.name)} ${safe(pack.version)}`, safe(pack.description), "", `Skills (${pack.skills.length}):`];
  for (const s of pack.skills) {
    lines.push(`  ${safe(s.name)} — ${safe(s.description)}`);
    lines.push(`    asks for tools: ${s.tools.length ? s.tools.map((t) => safe(t)).join(", ") : "none"}`);
  }
  lines.push("", `Files that would be installed (${pack.files.length}, ${bytes} bytes):`);
  for (const f of pack.files) lines.push(`  ${safe(f.path)}  (${f.size} bytes)`);
  lines.push("", `Files refused, never copied (${pack.refused.length}):`);
  for (const r of pack.refused) lines.push(`  ${safe(r.path)} — ${r.why}`);
  if (!pack.refused.length) lines.push("  none");
  lines.push("", `Content hash: ${pack.hash}`, "", 'Entry for "skills.external" in saf.config.json:', `  ${JSON.stringify({ path: safe(given, 500), sha256: pack.hash })}`);
  lines.push("", "A skill is instructions that agents will follow. Read the files above before you add the entry; nothing was installed.");
  return lines;
}
