import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { TITLE_MAX } from "../src/limits.mjs";
import { createServer } from "../src/server.mjs";
import { validateTitle } from "../src/validate.mjs";

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const post = async (raw) => {
  const res = await fetch(`${base}/todos`, { method: "POST", headers: { "content-type": "application/json" }, body: raw });
  return { status: res.status, body: await res.json() };
};

test("validateTitle trims, requires text and caps the length", () => {
  assert.deepEqual(validateTitle("  buy milk "), { ok: true, title: "buy milk" });
  assert.deepEqual(validateTitle("   "), { ok: false, error: "title_required" });
  assert.deepEqual(validateTitle(undefined), { ok: false, error: "title_required" });
  assert.deepEqual(validateTitle("x".repeat(TITLE_MAX)), { ok: true, title: "x".repeat(TITLE_MAX) });
  assert.deepEqual(validateTitle("x".repeat(TITLE_MAX + 1)), { ok: false, error: "title_too_long" });
});

test("TODO-AC-04 empty title, over-long title and non-JSON body get a 400 with a reason code", async () => {
  assert.deepEqual(await post(JSON.stringify({ title: "  " })), { status: 400, body: { error: "title_required" } });
  assert.deepEqual(await post(JSON.stringify({ title: "x".repeat(TITLE_MAX + 1) })), { status: 400, body: { error: "title_too_long" } });
  assert.deepEqual(await post("{not json"), { status: 400, body: { error: "invalid_json" } });
  assert.deepEqual(await post(JSON.stringify({ title: " buy milk " })), { status: 201, body: { id: 1, title: "buy milk", done: false } });
});
