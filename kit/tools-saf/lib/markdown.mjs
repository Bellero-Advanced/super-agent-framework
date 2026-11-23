/**
 * Just-enough markdown reading for the checkers (not a full parser).
 * Code fences and inline code are separated first so links or words inside examples are not checked.
 */

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;

/** @returns {{n:number,text:string,inFence:boolean,lang?:string}[]} */
export function scanLines(src) {
  const out = [];
  let fence = null;
  src.split(/\r?\n/).forEach((text, idx) => {
    const n = idx + 1;
    if (!fence) {
      const m = text.match(FENCE_OPEN);
      if (m) {
        const marker = m[1] ?? "";
        fence = { char: marker[0], len: marker.length, lang: (m[2] ?? "").toLowerCase() };
        out.push({ n, text, inFence: true });
        return;
      }
      out.push({ n, text, inFence: false });
      return;
    }
    const close = text.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === fence.char && close[1].length >= fence.len) {
      out.push({ n, text, inFence: true });
      fence = null;
      return;
    }
    out.push({ n, text, inFence: true, lang: fence.lang });
  });
  return out;
}

/** Inline code spans on one line (CommonMark: closed by the same number of backticks). */
export function codeSpans(line) {
  const spans = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (line[j] === "`") j++;
    const run = j - i;
    let k = j;
    let close = -1;
    while (k < line.length) {
      if (line[k] !== "`") {
        k++;
        continue;
      }
      let m = k;
      while (line[m] === "`") m++;
      if (m - k === run) {
        close = k;
        break;
      }
      k = m;
    }
    if (close < 0) {
      i = j;
      continue;
    }
    let content = line.slice(j, close);
    if (content.length > 1 && content.startsWith(" ") && content.endsWith(" ")) content = content.slice(1, -1);
    spans.push({ start: i, end: close + run, content });
    i = close + run;
  }
  return spans;
}

export function maskCodeSpans(line) {
  let out = line;
  for (const s of codeSpans(line)) out = out.slice(0, s.start) + " ".repeat(s.end - s.start) + out.slice(s.end);
  return out;
}

/** Prose lines: outside fences, inline code blanked out. */
export function proseLines(src) {
  return scanLines(src)
    .filter((l) => !l.inFence)
    .map((l) => ({ n: l.n, text: maskCodeSpans(l.text) }));
}

const INLINE_LINK = /\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REF_DEF = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;

export function extractLinks(src) {
  const links = [];
  for (const { n, text } of proseLines(src)) {
    for (const m of text.matchAll(INLINE_LINK)) links.push({ line: n, target: m[1] ?? "" });
    const ref = text.match(REF_DEF);
    if (ref) links.push({ line: n, target: ref[1] ?? "" });
  }
  return links;
}

/** Local file target of a link (anchor/query stripped, %-decoded) · external or same-page anchor → null. */
export function localTarget(raw) {
  let t = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) || t.startsWith("//") || t.startsWith("#")) return null;
  t = (t.split("#")[0] ?? "").split("?")[0] ?? "";
  if (!t) return null;
  try {
    t = decodeURIComponent(t);
  } catch {
    // keep as written — the checker reports it as missing
  }
  return t;
}

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "console"]);

/** Command lines inside ```bash blocks (backslash continuations joined; line = first line). */
export function shellCommands(src) {
  const out = [];
  let pending = null;
  for (const l of scanLines(src)) {
    if (!l.inFence || l.lang === undefined || !SHELL_LANGS.has(l.lang)) {
      pending = null;
      continue;
    }
    const continues = /\\\s*$/.test(l.text);
    const piece = l.text.replace(/\\\s*$/, " ");
    if (pending) pending.text += piece;
    else pending = { line: l.n, text: piece };
    if (!continues) {
      if (pending.text.trim()) out.push(pending);
      pending = null;
    }
  }
  return out;
}

/** YAML frontmatter between the first-line `---` and the next `---` · none → null. */
export function frontmatter(src) {
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") return { yaml: lines.slice(1, i).join("\n"), endLine: i + 1 };
  }
  return null;
}

/** Content under each level-2 heading (outside fences), in file order. */
export function sections(src) {
  const out = new Map();
  const start = frontmatter(src)?.endLine ?? 0;
  let cur = null;
  for (const l of scanLines(src)) {
    if (l.n <= start) continue;
    const m = l.inFence ? null : l.text.match(/^##\s+(.+?)\s*$/);
    if (m) {
      cur = [];
      out.set(m[1] ?? "", cur);
    } else {
      cur?.push(l);
    }
  }
  return out;
}

/** First section whose heading starts with any of the given prefixes (case-insensitive). */
export function findSection(map, prefixes) {
  for (const [k, v] of map) {
    const low = k.replace(/^\d+[.)]\s*/, "").toLowerCase();
    if (prefixes.some((p) => low.startsWith(p.toLowerCase()))) return v;
  }
  return undefined;
}
