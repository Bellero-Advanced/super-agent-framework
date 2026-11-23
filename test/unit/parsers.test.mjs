import assert from "node:assert/strict";
import { test } from "node:test";
import { lib } from "../helpers.mjs";

const { parseYaml, YamlError } = await lib("yaml.mjs");
const { frontmatter, sections, findSection, extractLinks, shellCommands, codeSpans } = await lib("markdown.mjs");
const { globToRegExp, matchesAny, expandBraces, touchOverlaps } = await lib("glob.mjs");
const { render, TemplateError } = await lib("template.mjs");

test("yaml: maps, sequences, flow lists, quoted and block scalars", () => {
  const y = parseYaml(`id: T-M1-01
title: "a: quoted # not comment"
touch:
  - src/**
  - "test/**"
depends: []
flow: [a, "b c", 'd']
obj: { k: v, n: 2 }
gates:
  - id: "1"
    text: first
    run:
      - pnpm test
block: |
  line one
  line two
# comment
tail: x # trailing comment
`);
  assert.equal(y.id, "T-M1-01");
  assert.equal(y.title, "a: quoted # not comment");
  assert.deepEqual(y.touch, ["src/**", "test/**"]);
  assert.deepEqual(y.depends, []);
  assert.deepEqual(y.flow, ["a", "b c", "d"]);
  assert.deepEqual(y.obj, { k: "v", n: "2" });
  assert.deepEqual(y.gates, [{ id: "1", text: "first", run: ["pnpm test"] }]);
  assert.equal(y.block, "line one\nline two\n");
  assert.equal(y.tail, "x");
});

test("yaml: JSON-style flow arrays from the generator parse", () => {
  assert.deepEqual(parseYaml('run: ["npm run lint","npm test"]\n').run, ["npm run lint", "npm test"]);
  assert.deepEqual(parseYaml('dont_touch: ["brand/**"]\n').dont_touch, ["brand/**"]);
});

test("yaml: bad indentation is an error", () => {
  assert.throws(() => parseYaml("a:\n  - x\n - y\n"), YamlError);
});

test("markdown: frontmatter, sections (numbered headings), links outside code", () => {
  const src = "---\nid: X\n---\n# T\n\n## 5. Acceptance\n\n| id |\n\n## Done when\n\n- `true`\n\n```bash\npnpm test   # c\n```\n[a](docs/a.md) `[b](x.md)`\n";
  assert.equal(frontmatter(src).yaml.trim(), "id: X");
  const s = sections(src);
  assert.ok(findSection(s, ["Acceptance"]));
  assert.ok(findSection(s, ["done when"]));
  assert.deepEqual(extractLinks(src).map((l) => l.target), ["docs/a.md"]);
  assert.ok(shellCommands(src).some((c) => c.text.startsWith("pnpm test")));
  assert.deepEqual(codeSpans("run `a` and `b`").map((c) => c.content), ["a", "b"]);
});

test("glob: stars, braces, overlap", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
  assert.ok(globToRegExp("**/*.test.*").test("a/b/c.test.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  assert.deepEqual(expandBraces("a/{x,y}.md"), ["a/x.md", "a/y.md"]);
  assert.ok(matchesAny("docs/plan/x.md", ["docs/plan/"]));
  assert.equal(touchOverlaps(["src/a/**"], ["src/a/b.ts"]).length, 1);
  assert.equal(touchOverlaps(["src/**"], ["src/a/**"]).length, 1);
  assert.deepEqual(touchOverlaps(["src/a/**"], ["src/b/**"]), []);
});

test("template: values, if/else, unless, eq, each with meta", () => {
  const out = render("{{a}}|{{#if b}}yes{{else}}no{{/if}}|{{#unless c}}u{{/unless}}|{{#eq d \"x\"}}eq{{/eq}}|{{#each l}}{{.n}}{{#unless @last}},{{/unless}}{{/each}}|{{eachThing}}", {
    a: 1,
    b: [],
    c: false,
    d: "x",
    l: [{ n: "p" }, { n: "q" }],
    eachThing: "E",
  });
  assert.equal(out, "1|no|u|eq|p,q|E");
});

test("template: block-only lines are removed with their newline", () => {
  assert.equal(render("a\n{{#if x}}\nb\n{{/if}}\nc\n", { x: true }), "a\nb\nc\n");
  assert.equal(render("a\n{{#if x}}\nb\n{{/if}}\nc\n", { x: false }), "a\nc\n");
});

test("template: unclosed block is an error", () => {
  assert.throws(() => render("{{#if x}}a", {}), TemplateError);
});
