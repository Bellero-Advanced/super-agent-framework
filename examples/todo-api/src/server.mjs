import http from "node:http";
import { pathToFileURL } from "node:url";
import { createStore } from "./store.mjs";
import { validateTitle } from "./validate.mjs";

/** HTTP layer over the store (docs/specs/todos.md rule 5). JSON in, JSON out. */
export function createServer(store = createStore()) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/todos") return send(200, store.list());
    if (req.method === "POST" && url.pathname === "/todos") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(400, { error: "invalid_json" });
      }
      const v = validateTitle(body?.title);
      return v.ok ? send(201, store.add(v.title)) : send(400, { error: v.error });
    }
    const done = url.pathname.match(/^\/todos\/(\d+)\/done$/);
    if (req.method === "PATCH" && done) {
      const todo = store.markDone(Number(done[1]));
      return todo ? send(200, todo) : send(404, { error: "not_found" });
    }
    return send(404, { error: "not_found" });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => process.stdout.write(`todo-api on http://localhost:${port}\n`));
}
