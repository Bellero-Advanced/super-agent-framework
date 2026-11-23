import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../src/store.mjs";

test("TODO-AC-01 two added todos are listed in order with ids 1 and 2, not done", () => {
  const store = createStore();
  store.add("buy milk");
  store.add("call mom");
  assert.deepEqual(store.list(), [
    { id: 1, title: "buy milk", done: false },
    { id: 2, title: "call mom", done: false },
  ]);
});

test("TODO-AC-02 marking a todo done sets done; an unknown id is not found", () => {
  const store = createStore();
  const todo = store.add("buy milk");
  assert.deepEqual(store.markDone(todo.id), { id: 1, title: "buy milk", done: true });
  assert.equal(store.list()[0].done, true);
  assert.equal(store.markDone(99), null);
});

test("list returns copies — callers cannot change stored todos", () => {
  const store = createStore();
  store.add("buy milk");
  store.list()[0].done = true;
  assert.equal(store.list()[0].done, false);
});
