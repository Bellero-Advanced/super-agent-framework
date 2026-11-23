/**
 * Finds tests bound to acceptance-scenario ids ("every scenario needs at least one test with its id in the name").
 * Used by task:verify (cards that declare `scenarios:`) and spec:matrix.
 *
 * JS/TS test files: the id must be in the name of it()/test()/describe() (not .skip/.todo).
 * Other test files (Python, Go, Rust, Java, …): the id must appear in the file (test name, docstring or comment),
 * because those languages cannot put `-` in function names.
 */

export const JS_TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
export const OTHER_TEST_FILE = /(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.(?:py|go)|[^/]+_spec\.rb|[^/]+Test\.(?:java|kt)|tests?\/[^/]+\.rs)$/;
export const isTestFile = (f) => JS_TEST_FILE.test(f) || OTHER_TEST_FILE.test(f);

const TEST_CALL =
  /\b(?:it|test|describe)(?:\.(?:only|concurrent|sequential|fails|serial|parallel))*(?:\.each\s*(?:`[^`]*`|\([^)]*\)))?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

export function testNames(src) {
  const out = [];
  for (const m of src.matchAll(TEST_CALL)) out.push(m[2] ?? "");
  return out;
}

/** Whole-word id match (AUTH-AC-03 does not match AUTH-AC-030 or XAUTH-AC-03). */
export function nameHasId(name, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}(?![A-Za-z0-9])`).test(name);
}

export function findScenarioTests(files, read, ids) {
  const hits = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return hits;
  for (const file of files) {
    if (!isTestFile(file)) continue;
    const src = read(file);
    if (!ids.some((id) => src.includes(id))) continue;
    if (JS_TEST_FILE.test(file)) {
      for (const name of testNames(src)) for (const id of ids) if (nameHasId(name, id)) hits.get(id)?.push({ file, name });
    } else {
      for (const id of ids) {
        const line = src.split(/\r?\n/).find((l) => nameHasId(l, id));
        if (line) hits.get(id)?.push({ file, name: line.trim().slice(0, 120) });
      }
    }
  }
  return hits;
}
