/** In-memory todo store — one per server process (docs/specs/todos.md rules 1–3). */
export function createStore() {
  const todos = [];
  let nextId = 1;
  const copy = (t) => ({ ...t });
  return {
    add(title) {
      const todo = { id: nextId++, title, done: false };
      todos.push(todo);
      return copy(todo);
    },
    list() {
      return todos.map(copy);
    },
    markDone(id) {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return null;
      todo.done = true;
      return copy(todo);
    },
  };
}
