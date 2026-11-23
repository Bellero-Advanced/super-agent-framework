/**
 * Minimal YAML reader for frontmatter (cards · milestones · agents · rules).
 *
 * Supported: block mappings, block sequences (including `- key: value` items), flow sequences and
 * flow mappings (may span lines), single/double quoted scalars, `|` / `>` block scalars, `#` comments.
 * Every scalar is returned as a string — commit ids like 0929147 must not turn into numbers.
 * Anything outside this subset throws YamlError with a line number.
 */

export class YamlError extends Error {
  constructor(line, message) {
    super(`line ${line}: ${message}`);
    this.line = line;
  }
}

/** Remove a trailing ` # comment` that is outside quotes. */
export function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  return text;
}

function unquote(s, line) {
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) throw new YamlError(line, `unterminated string: ${s}`);
    return s
      .slice(1, -1)
      .replace(/\\(["\\/nt])/g, (_, c) => ({ n: "\n", t: "\t" })[c] ?? c);
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new YamlError(line, `unterminated string: ${s}`);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

/** Parse a flow value (`[..]`, `{..}`, quoted or plain scalar) starting at text[pos]. */
function parseFlow(text, line) {
  let pos = 0;
  const ws = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const scalar = (stops) => {
    ws();
    const c = text[pos];
    if (c === '"' || c === "'") {
      let j = pos + 1;
      while (j < text.length) {
        if (c === '"' && text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === c) {
          if (c === "'" && text[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      if (j >= text.length) throw new YamlError(line, `unterminated string in flow value`);
      const raw = text.slice(pos, j + 1);
      pos = j + 1;
      return unquote(raw, line);
    }
    let j = pos;
    while (j < text.length && !stops.includes(text[j])) j++;
    const raw = text.slice(pos, j).trim();
    pos = j;
    return raw;
  };
  const value = (stops) => {
    ws();
    if (text[pos] === "[") return seq();
    if (text[pos] === "{") return map();
    return scalar(stops);
  };
  const seq = () => {
    pos++; // [
    const out = [];
    ws();
    if (text[pos] === "]") {
      pos++;
      return out;
    }
    for (;;) {
      out.push(value([",", "]"]));
      ws();
      if (text[pos] === ",") {
        pos++;
        ws();
        if (text[pos] === "]") {
          pos++;
          return out;
        }
        continue;
      }
      if (text[pos] === "]") {
        pos++;
        return out;
      }
      throw new YamlError(line, `expected , or ] in flow sequence`);
    }
  };
  const map = () => {
    pos++; // {
    const out = {};
    ws();
    if (text[pos] === "}") {
      pos++;
      return out;
    }
    for (;;) {
      const key = scalar([":"]);
      ws();
      if (text[pos] !== ":") throw new YamlError(line, `expected : in flow mapping`);
      pos++;
      out[key] = value([",", "}"]);
      ws();
      if (text[pos] === ",") {
        pos++;
        continue;
      }
      if (text[pos] === "}") {
        pos++;
        return out;
      }
      throw new YamlError(line, `expected , or } in flow mapping`);
    }
  };
  const v = value([]);
  ws();
  if (pos < text.length) throw new YamlError(line, `unexpected text after value: ${text.slice(pos)}`);
  return v;
}

function balance(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
  }
  return depth;
}

const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\-[{][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*)|$)/;
const isSeqItem = (t) => t === "-" || t.startsWith("- ");

export function parseYaml(src) {
  const raw = src.split(/\r?\n/);
  const lines = raw.map((r, idx) => {
    const trimmed = r.trim();
    const blank = trimmed === "" || trimmed.startsWith("#");
    if (/^\t/.test(r)) throw new YamlError(idx + 1, "tabs are not allowed for indentation");
    return { n: idx + 1, indent: r.length - r.trimStart().length, text: blank ? "" : stripComment(trimmed), blank, raw: r };
  });
  let i = 0;
  const skip = () => {
    while (i < lines.length && lines[i].blank) i++;
  };

  function scalarOrFlow(rest, line, indent) {
    if (/^[|>][-+]?$/.test(rest)) return blockScalar(rest, indent);
    if (rest.startsWith("[") || rest.startsWith("{")) {
      let text = rest;
      while (balance(text) > 0) {
        if (i >= lines.length) throw new YamlError(line, "unterminated flow value");
        text += ` ${lines[i].blank ? "" : lines[i].text}`;
        i++;
      }
      return parseFlow(text, line);
    }
    if (rest.startsWith('"') || rest.startsWith("'")) return unquote(rest, line);
    return rest;
  }

  function blockScalar(indicator, indent) {
    const body = [];
    let minIndent = Infinity;
    while (i < lines.length && (lines[i].blank || lines[i].indent > indent)) {
      body.push(lines[i]);
      if (!lines[i].blank) minIndent = Math.min(minIndent, lines[i].indent);
      i++;
    }
    while (body.length && body[body.length - 1].blank) body.pop();
    const texts = body.map((l) => (l.blank ? "" : l.raw.slice(minIndent)));
    const joined = indicator.startsWith("|") ? texts.join("\n") : texts.join(" ").replace(/\s+/g, " ").trim();
    return indicator.endsWith("-") ? joined : `${joined}\n`;
  }

  function valueOrBlock(rest, indent, line) {
    if (rest !== undefined && rest !== "") return scalarOrFlow(rest, line, indent);
    skip();
    if (i < lines.length && (lines[i].indent > indent || (lines[i].indent === indent && isSeqItem(lines[i].text)))) {
      return block(lines[i].indent);
    }
    return "";
  }

  function block(indent) {
    skip();
    if (i >= lines.length) return "";
    return isSeqItem(lines[i].text) ? seq(indent) : map(indent);
  }

  function map(indent) {
    const out = {};
    for (;;) {
      skip();
      if (i >= lines.length || lines[i].indent < indent) return out;
      const l = lines[i];
      if (l.indent > indent) throw new YamlError(l.n, "unexpected indentation");
      if (isSeqItem(l.text)) return out;
      const m = l.text.match(KEY);
      if (!m) throw new YamlError(l.n, `expected "key: value", got: ${l.text}`);
      const key = unquote(m[1].trim(), l.n);
      i++;
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(l.n, `duplicate key "${key}"`);
      out[key] = valueOrBlock(m[2], indent, l.n);
    }
  }

  function seq(indent) {
    const out = [];
    for (;;) {
      skip();
      if (i >= lines.length || lines[i].indent !== indent || !isSeqItem(lines[i].text)) {
        if (i < lines.length && lines[i].indent > indent) throw new YamlError(lines[i].n, "unexpected indentation");
        return out;
      }
      const l = lines[i];
      const rest = l.text === "-" ? "" : l.text.slice(1).trimStart();
      if (rest === "") {
        i++;
        skip();
        out.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : "");
        continue;
      }
      const m = /^["'[{]/.test(rest) ? null : rest.match(KEY);
      if (m) {
        // "- key: value" → mapping whose first line sits at the content column
        const col = l.indent + (l.text.length - rest.length);
        lines[i] = { ...l, indent: col, text: rest };
        out.push(map(col));
        continue;
      }
      i++;
      out.push(scalarOrFlow(rest, l.n, indent));
    }
  }

  skip();
  if (i >= lines.length) return {};
  const first = lines[i];
  const result = block(first.indent);
  skip();
  if (i < lines.length) throw new YamlError(lines[i].n, "unexpected content");
  return result;
}
