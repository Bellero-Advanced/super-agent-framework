/**
 * Tiny logic-light template engine for the generator.
 *
 *   {{path.to.value}}                     value (missing → empty) · `this` = current item · `.field` = field of the current item
 *   {{#if path}} … {{else}} … {{/if}}      truthy (non-empty arrays/strings, true, non-zero)
 *   {{#unless path}} … {{/unless}}
 *   {{#eq path "text"}} … {{else}} … {{/eq}}
 *   {{#each path}} … {{/each}}            {{@index}} {{@first}} {{@last}} inside
 *
 * A line that holds only a block tag is removed together with its newline, so markdown stays clean.
 */

export class TemplateError extends Error {}

const TAG = /{{\s*(?:([#/])(if|unless|each|eq)\b\s*([^}]*?)|(else)|([^}#/][^}]*?))\s*}}/g;

function tokenize(src) {
  const stripped = src.replace(/^[ \t]*({{\s*(?:[#/](?:if|unless|each|eq)[^}]*|else)\s*}})[ \t]*\r?\n/gm, "$1");
  const tokens = [];
  let last = 0;
  for (const m of stripped.matchAll(TAG)) {
    if (m.index > last) tokens.push({ type: "text", value: stripped.slice(last, m.index) });
    const [, sigil, kw, arg, isElse, path] = m;
    if (sigil === "#") tokens.push({ type: "open", kw, arg });
    else if (sigil === "/") tokens.push({ type: "close", kw });
    else if (isElse) tokens.push({ type: "else" });
    else tokens.push({ type: "var", path: path.trim() });
    last = m.index + m[0].length;
  }
  if (last < stripped.length) tokens.push({ type: "text", value: stripped.slice(last) });
  return tokens;
}

function parse(tokens) {
  let i = 0;
  const block = (endKw) => {
    const nodes = [];
    let elseNodes = null;
    let cur = nodes;
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.type === "text" || t.type === "var") cur.push(t);
      else if (t.type === "open") {
        const body = block(t.kw);
        cur.push({ type: "block", kw: t.kw, arg: t.arg, body: body.nodes, elseBody: body.elseNodes });
      } else if (t.type === "else") {
        if (!endKw) throw new TemplateError("{{else}} outside a block");
        elseNodes = [];
        cur = elseNodes;
      } else if (t.type === "close") {
        if (t.kw !== endKw) throw new TemplateError(`{{/${t.kw}}} closes {{#${endKw ?? "?"}}}`);
        return { nodes, elseNodes };
      }
    }
    if (endKw) throw new TemplateError(`{{#${endKw}}} is not closed`);
    return { nodes, elseNodes };
  };
  return block(null).nodes;
}

function lookup(scopes, path) {
  if (path === "this") return scopes[0].item;
  if (path.startsWith("@")) return scopes[0].meta?.[path.slice(1)];
  if (path.startsWith(".")) return dig(scopes[0].item, path.slice(1));
  for (const s of scopes) {
    const v = dig(s.item, path);
    if (v !== undefined) return v;
  }
  return undefined;
}

function dig(obj, path) {
  let v = obj;
  for (const k of path.split(".")) {
    if (v === null || v === undefined || typeof v !== "object") return undefined;
    v = v[k];
  }
  return v;
}

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

function renderNodes(nodes, scopes) {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += n.value;
    else if (n.type === "var") {
      const v = lookup(scopes, n.path);
      out += v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
    } else if (n.kw === "if" || n.kw === "unless") {
      const yes = truthy(lookup(scopes, n.arg)) === (n.kw === "if");
      out += renderNodes(yes ? n.body : (n.elseBody ?? []), scopes);
    } else if (n.kw === "eq") {
      const m = n.arg.match(/^(\S+)\s+"([^"]*)"$/);
      if (!m) throw new TemplateError(`{{#eq ${n.arg}}} needs: path "text"`);
      out += renderNodes(String(lookup(scopes, m[1]) ?? "") === m[2] ? n.body : (n.elseBody ?? []), scopes);
    } else if (n.kw === "each") {
      const list = lookup(scopes, n.arg);
      if (!Array.isArray(list) || !list.length) {
        out += renderNodes(n.elseBody ?? [], scopes);
        continue;
      }
      list.forEach((item, index) => {
        out += renderNodes(n.body, [{ item, meta: { index, first: index === 0, last: index === list.length - 1 } }, ...scopes]);
      });
    }
  }
  return out;
}

export function render(src, data) {
  return renderNodes(parse(tokenize(src)), [{ item: data, meta: {} }]);
}
