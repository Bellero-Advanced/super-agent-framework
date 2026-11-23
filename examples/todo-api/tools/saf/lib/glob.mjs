/** Globs (`**`, `*`, `?`, `{a,b}`) matched against repo-relative `/` paths, plus the touch-overlap check. */

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const close = glob.indexOf("}", i);
      if (close < 0) {
        re += "\\{";
        continue;
      }
      const alts = glob
        .slice(i + 1, close)
        .split(",")
        .map((a) => globToRegExp(a).source.slice(1, -1));
      re += `(?:${alts.join("|")})`;
      i = close;
    } else {
      re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** A trailing `/` means "everything below". */
export const toGlob = (p) => (p.endsWith("/") ? `${p}**` : p);

export const matchesAny = (file, globs) => globs.some((g) => globToRegExp(toGlob(g)).test(file));

/** Expand `{a,b}` like globToRegExp does · nested braces → null (undecidable = treated as overlapping). */
export function expandBraces(p) {
  const open = p.indexOf("{");
  if (open < 0) return [p];
  const close = p.indexOf("}", open);
  if (close < 0) return [p];
  const alts = p.slice(open + 1, close).split(",");
  if (alts.some((a) => a.includes("{"))) return null;
  const tails = expandBraces(p.slice(close + 1));
  if (!tails) return null;
  const head = p.slice(0, open);
  return alts.flatMap((a) => tails.map((t) => `${head}${a}${t}`));
}

const WILDCARD = /[*?]/;
const leading = (p) => p.slice(0, p.search(WILDCARD));
export const preparePattern = (p) => expandBraces(toGlob(p));

function patternsOverlap(a, b) {
  const wa = WILDCARD.test(a);
  const wb = WILDCARD.test(b);
  if (!wa && !wb) return a === b;
  if (wa && !wb) return globToRegExp(a).test(b);
  if (!wa && wb) return globToRegExp(b).test(a);
  const la = leading(a);
  const lb = leading(b);
  return la.startsWith(lb) || lb.startsWith(la);
}

/** Pairs of patterns (as written) that may touch the same file · empty = no overlap. When unsure → overlap. */
export function touchOverlaps(a, b) {
  const pairs = [];
  for (const pa of a) {
    for (const pb of b) {
      const xs = preparePattern(pa);
      const ys = preparePattern(pb);
      if (!xs || !ys || xs.some((x) => ys.some((y) => patternsOverlap(x, y)))) pairs.push([pa, pb]);
    }
  }
  return pairs;
}
