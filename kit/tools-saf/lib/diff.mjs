// Line diff in unified format — no dependency. Used by `saf setup --dry-run --diff`.
//
// Line endings: CRLF is read as LF (the same rule as the engine's readText), so a file that differs only in line endings
// has no diff. A lone CR is ordinary text. A missing final newline is a real difference and prints the standard
// "\ No newline at end of file" line. Text with a NUL byte is binary: one line, no hunks.

/** Context lines around each change, and the most lines a side may have before only the line counts are printed. */
export const DIFF_LIMITS = { context: 3, maxLines: 2000 };

export const NO_EOL = "\\ No newline at end of file";

const lf = (text) => text.replace(/\r\n/g, "\n");

/** Counts the lines of LF text without splitting it (a last line without a newline still counts). */
function countLines(text) {
  if (text === "") return 0;
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n : n + 1;
}

/** Lines as comparison keys: the last line of a text without a final newline gets a trailing "\n" so it differs from the same line with one. */
function toKeys(text) {
  if (text === "") return [];
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  else parts[parts.length - 1] += "\n";
  return parts;
}

const shown = (key) => (key.endsWith("\n") ? key.slice(0, -1) : key);

/** Edit script [{op:" "|"-"|"+", key}] from a longest-common-subsequence table over what is left after the common head and tail. */
function script(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const ma = a.slice(head, a.length - tail);
  const mb = b.slice(head, b.length - tail);
  const w = mb.length + 1;
  const lcs = new Uint32Array((ma.length + 1) * w); // lcs[i*w+j] = LCS length of ma[i..] and mb[j..]
  for (let i = ma.length - 1; i >= 0; i--) {
    for (let j = mb.length - 1; j >= 0; j--) {
      lcs[i * w + j] = ma[i] === mb[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const ops = a.slice(0, head).map((key) => ({ op: " ", key }));
  let i = 0;
  let j = 0;
  while (i < ma.length || j < mb.length) {
    if (i < ma.length && j < mb.length && ma[i] === mb[j]) {
      ops.push({ op: " ", key: ma[i] });
      i++;
      j++;
    } else if (i < ma.length && (j === mb.length || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) ops.push({ op: "-", key: ma[i++] }); // removals before additions
    else ops.push({ op: "+", key: mb[j++] });
  }
  for (const key of a.slice(a.length - tail)) ops.push({ op: " ", key });
  return ops;
}

/**
 * Unified hunks that turn text `a` into text `b`: [{oldStart, oldLines, newStart, newLines, lines}], where each line is
 * " ", "-" or "+" followed by the text (a "\ No newline at end of file" line follows a line that has no final newline).
 * Identical texts → []. Line counts are NOT limited here — `unifiedDiff` checks DIFF_LIMITS before calling.
 * @param {string} a text on disk
 * @param {string} b new text
 * @param {{context?:number}} opts
 */
export function diffLines(a, b, { context = DIFF_LIMITS.context } = {}) {
  const ops = script(toKeys(lf(a)), toKeys(lf(b)));
  const changed = ops.flatMap((o, i) => (o.op === " " ? [] : [i]));
  if (!changed.length) return [];
  // group the changes: two changes share a hunk when at most 2×context equal lines lie between them
  const groups = [];
  for (const i of changed) {
    const last = groups[groups.length - 1];
    if (last && i - last.end - 1 <= 2 * context) last.end = i;
    else groups.push({ start: i, end: i });
  }
  // line numbers (1-based) of every op in the old and the new text
  const oldAt = [];
  const newAt = [];
  let o = 1;
  let n = 1;
  for (const op of ops) {
    oldAt.push(o);
    newAt.push(n);
    if (op.op !== "+") o++;
    if (op.op !== "-") n++;
  }
  return groups.map(({ start, end }) => {
    const from = Math.max(0, start - context);
    const to = Math.min(ops.length - 1, end + context);
    const slice = ops.slice(from, to + 1);
    const oldLines = slice.filter((x) => x.op !== "+").length;
    const newLines = slice.filter((x) => x.op !== "-").length;
    const lines = slice.flatMap((x) => (x.key.endsWith("\n") ? [`${x.op}${shown(x.key)}`, NO_EOL] : [`${x.op}${x.key}`]));
    return { oldStart: oldLines ? oldAt[from] : oldAt[from] - 1, oldLines, newStart: newLines ? newAt[from] : newAt[from] - 1, newLines, lines };
  });
}

const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`);
export const hunkHeader = (h) => `@@ -${range(h.oldStart, h.oldLines)} +${range(h.newStart, h.newLines)} @@`;

/**
 * The diff of one file as text, "a" being the file on disk and "b" what setup would write: `--- a/<path>` and `+++ b/<path>`
 * headers, then the hunks. Identical → "". A side with more than DIFF_LIMITS.maxLines lines (checked before any table is built)
 * or a NUL byte → a single line instead.
 */
export function unifiedDiff(path, a, b, limits = DIFF_LIMITS) {
  const [x, y] = [lf(a), lf(b)];
  if (x === y) return "";
  if (x.includes("\0") || y.includes("\0")) return `Binary files a/${path} and b/${path} differ`;
  const [la, lb] = [countLines(x), countLines(y)];
  if (la > limits.maxLines || lb > limits.maxLines) return `${path}: too large to diff — ${la} lines on disk, ${lb} lines new (limit ${limits.maxLines})`;
  const hunks = diffLines(x, y, { context: limits.context });
  return [`--- a/${path}`, `+++ b/${path}`, ...hunks.flatMap((h) => [hunkHeader(h), ...h.lines])].join("\n");
}
