import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "../src/server.mjs";

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test("TODO-AC-03 POST, GET and PATCH /todos/:id/done over HTTP", async () => {
  assert.deepEqual(await call("POST", "/todos", { title: "buy milk" }), { status: 201, body: { id: 1, title: "buy milk", done: false } });
  assert.deepEqual(await call("GET", "/todos"), { status: 200, body: [{ id: 1, title: "buy milk", done: false }] });
  assert.deepEqual(await call("PATCH", "/todos/1/done"), { status: 200, body: { id: 1, title: "buy milk", done: true } });
});

test("TODO-AC-05 unknown id and unknown path are 404", async () => {
  assert.deepEqual(await call("PATCH", "/todos/99/done"), { status: 404, body: { error: "not_found" } });
  assert.deepEqual(await call("GET", "/nope"), { status: 404, body: { error: "not_found" } });
});
