# Spec — todos

## 1. Purpose

A client keeps a short todo list over HTTP: add a todo, list all todos, mark one done. Bad input gets a clear 400 with a
reason the client can show.

## 2. Rules

1. A todo has `id` (a positive integer, assigned in order from 1), `title` (text) and `done` (false when created).
2. Adding a todo stores it and returns it; listing returns every todo in the order they were added.
3. Marking a todo done sets `done: true` and returns it; an unknown id is "not found".
4. `title` is required, trimmed, 1 to `TITLE_MAX` characters (the limit lives in `src/limits.mjs`).
5. HTTP: `GET /todos` → 200 list · `POST /todos {title}` → 201 todo · `PATCH /todos/:id/done` → 200 todo ·
   unknown id → 404 · invalid input or body that is not JSON → 400 `{ "error": "<reason code>" }` · other paths → 404.

## 3. Data

In memory, one store per server process (`src/store.mjs`). Limits in `src/limits.mjs`.

## 4. Edge cases and errors

- empty or whitespace-only title → 400 `title_required`
- title longer than `TITLE_MAX` after trimming → 400 `title_too_long`
- body is not valid JSON → 400 `invalid_json`
- marking an already-done todo done again → 200, unchanged

## 5. Acceptance

| id | given | when | then | test layer |
|---|---|---|---|---|
| TODO-AC-01 | an empty store | two todos are added | the list returns both, in order, with ids 1 and 2 and `done: false` | unit |
| TODO-AC-02 | a store with one todo | it is marked done; then an unknown id is marked done | the todo has `done: true`; the unknown id is not found | unit |
| TODO-AC-03 | a running server | `POST /todos`, `GET /todos`, `PATCH /todos/1/done` | 201 · 200 with the todo · 200 with `done: true` | integration |
| TODO-AC-04 | a running server | `POST /todos` with an empty title, an over-long title, a body that is not JSON | 400 with `title_required` · `title_too_long` · `invalid_json` | integration |
| TODO-AC-05 | a running server | `PATCH /todos/99/done` · `GET /nope` | 404 · 404 | integration |

## 6. Out of scope

Persistence, users and auth, editing or deleting todos, pagination.
