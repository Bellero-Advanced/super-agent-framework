#!/usr/bin/env node
/**
 * Builds docs/assets/demo.svg — the animated terminal on the README — from a real run of the engine.
 *
 *   node scripts/demo.mjs            # run the scenario in a temporary folder and write the SVG
 *   node scripts/demo.mjs --print    # print the captured transcript instead
 *
 * Nothing in the animation is typed by hand: every output line is what the CLI printed in this run (the temporary path is
 * shortened to `~/todo`). Zero dependencies — node, git and npm only.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "docs", "assets", "demo.svg");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@example.invalid", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "commit.gpgsign", GIT_CONFIG_VALUE_0: "false", GIT_CONFIG_KEY_1: "init.defaultBranch", GIT_CONFIG_VALUE_1: "main",
  npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false", NO_COLOR: "1",
};

const root = mkdtempSync(join(tmpdir(), "saf-demo-"));
const write = (rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof text === "string" ? text : `${JSON.stringify(text, null, 2)}\n`);
};
const git = (...args) => execFileSync("git", args, { cwd: root, env: ENV, encoding: "utf8" });
const clean = (s) => s.replaceAll(root, "~/todo").replace(/\/private~\/todo/g, "~/todo").replace(/\r/g, "").trimEnd();

/** One step of the story: the command as shown, what really runs, and its real output. */
const screens = [];
function run(screen, shown, cmd, { keep = () => true, expectFail = false } = {}) {
  const r = spawnSync(cmd, { cwd: root, env: ENV, encoding: "utf8", shell: true, windowsHide: true });
  const failed = r.status !== 0;
  if (failed !== expectFail) throw new Error(`${cmd} exited ${r.status}\n${r.stdout}${r.stderr}`);
  const lines = clean(`${r.stdout}${r.stderr}`).split("\n").filter((l) => l.trim() && keep(l));
  screen.steps.push({ shown, lines });
}
const screen = (title) => {
  const s = { title, steps: [] };
  screens.push(s);
  return s;
};

try {
  // a small npm project with one test
  git("init", "-q");
  write("package.json", { name: "todo", version: "1.0.0", private: true, type: "module", scripts: { test: "node --test" } });
  write("src/todos.mjs", "export const todos = [];\n");
  git("add", "-A");
  git("commit", "-qm", "chore: empty project");
  write(join("..", `${root.split(/[\\/]/).pop()}-answers.json`), {
    project: { name: "todo", pitch: "a tiny todo list", type: "api", stage: "mvp", rigor: "standard" },
    people: { docLanguage: "en", chatLanguage: "en", ownerTitle: "owner" },
    stack: { packageManager: "npm", commands: { test: "npm test" } },
    models: { preset: "balanced" },
    workflow: { worktrees: false, measure: { enabled: false } },
    firstMilestone: { goal: "add a todo and list todos" },
  });

  const s1 = screen("Set up — one command, then the first card");
  run(s1, "npx create-saf --answers answers.json", `node "${join(REPO, "bin", "cli.mjs")}" init --dir . --answers "../${root.split(/[\\/]/).pop()}-answers.json"`, {
    keep: (l) => !/^\s+(\.claude|docs|tools|CLAUDE|saf\.config)/.test(l),
  });
  git("add", "-A");
  git("commit", "-qm", "chore: SAF setup");
  run(s1, "npm run -s task:start -- T-M0-01", "npm run -s task:start -- T-M0-01");
  run(s1, "npm run -s task:verify -- T-M0-01", "npm run -s task:verify -- T-M0-01");
  git("add", "-A");
  git("commit", "-qm", "chore(plan): T-M0-01 passed");

  // the owner closes M0 and says Go on M1: one card, written the way the designer writes them
  write("docs/plan/milestones/M0.md", (await import("node:fs")).readFileSync(join(root, "docs/plan/milestones/M0.md"), "utf8").replace("status: active", "status: done"));
  write("docs/plan/milestones/M1.md", "---\nid: M1\ntitle: Add and list todos\nstatus: active\ncards:\n  - T-M1-01\ngates:\n  - id: project-checks\n    text: the project's own checks pass\n    run: [\"npm test\"]\n---\n\n# M1 — add and list todos\n");
  write("docs/plan/tasks/M1/T-M1-01.md", "---\nid: T-M1-01\nmilestone: M1\ntitle: Add a todo\nsize: M\nrole: implementer\ntouch:\n  - src/todos.mjs\n  - test/todos.test.mjs\ndepends: []\nscenarios: []\n---\n\n# T-M1-01 — Add a todo\n\n## Done when\n\n- `npm test`\n");
  run({ steps: [] }, "", "npm run -s task:state");
  git("add", "-A");
  git("commit", "-qm", "docs(plan): M1 — one card (owner: Go)");

  const s2 = screen("The builder says \"done\" — the engine checks");
  run(s2, "npm run -s task:start -- T-M1-01", "npm run -s task:start -- T-M1-01");
  // the builder's first try: a test that fails, and an edit outside the card's files
  write("test/todos.test.mjs", 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add, todos } from "../src/todos.mjs";\n\ntest("add puts a todo in the list", () => {\n  add("buy milk");\n  assert.deepEqual(todos, [{ title: "buy milk", done: false }]);\n});\n');
  write("README.md", "# todo\n");
  run(s2, "npm run -s task:verify -- T-M1-01", "npm run -s task:verify -- T-M1-01", { expectFail: true, keep: (l) => !l.includes("│") || /SyntaxError|# (pass|fail) /.test(l) });

  const s3 = screen("Fixed for real — now it is done, with evidence");
  rmSync(join(root, "README.md"));
  write("src/todos.mjs", "export const todos = [];\n\nexport function add(title) {\n  todos.push({ title, done: false });\n}\n");
  run(s3, "npm run -s task:verify -- T-M1-01", "npm run -s task:verify -- T-M1-01");
  git("add", "-A");
  git("commit", "-qm", "feat: T-M1-01 add a todo");
  run(s3, "npm run -s task:verify -- M1", "npm run -s task:verify -- M1");

  if (process.argv.includes("--print")) {
    for (const s of screens) {
      console.log(`\n### ${s.title}`);
      for (const st of s.steps) console.log(`$ ${st.shown}\n${st.lines.join("\n")}`);
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, render(screens));
    console.log(`wrote ${OUT.slice(REPO.length + 1)} — ${screens.length} screens`);
  }
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  rmSync(`${root}-answers.json`, { force: true });
}

/** Animated terminal: each screen types its commands and shows the real output line by line, then the next screen. */
function render(list) {
  const W = 960, LH = 19, PAD = 22, TOP = 70, MAXCOL = 98;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wrap = (s) => {
    const out = [];
    for (let rest = s; rest.length; ) {
      out.push(rest.slice(0, MAXCOL));
      rest = rest.length > MAXCOL ? `  ${rest.slice(MAXCOL)}` : "";
    }
    return out;
  };
  // timeline
  const items = [];
  let t = 0.6;
  let maxRows = 0;
  for (const [si, s] of list.entries()) {
    const start = t;
    let row = 0;
    const rows = [];
    for (const st of s.steps) {
      rows.push({ kind: "cmd", text: `$ ${st.shown}`, at: t, row: row++ });
      t += 0.35 + st.shown.length * 0.03;
      for (const l of st.lines) for (const w of wrap(l)) rows.push({ kind: classOf(w), text: w, at: (t += 0.07), row: row++ });
      t += 1.1;
      row++;
    }
    t += 2.2;
    maxRows = Math.max(maxRows, row);
    items.push({ si, title: s.title, start, end: t, rows });
  }
  const T = t;
  const H = TOP + maxRows * LH + PAD;
  const k = (x) => (Math.min(Math.max(x, 0), T) / T).toFixed(4);
  const show = (a, b) => `<animate attributeName="opacity" values="0;1;0" keyTimes="0;${k(a)};${k(b)}" dur="${T.toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`;
  const body = items
    .map((sc) => {
      const head = `<g opacity="0">${show(sc.start - 0.3, sc.end)}<text x="${W - PAD}" y="22" class="title" text-anchor="end">${sc.si + 1}/${items.length} · ${esc(sc.title)}</text></g>`;
      const lines = sc.rows
        .map((r) => {
          const y = TOP + r.row * LH;
          if (r.kind !== "cmd") return `<text x="${PAD}" y="${y}" class="${r.kind}" opacity="0" xml:space="preserve">${show(r.at, sc.end)}${esc(r.text)}</text>`;
          // a command is "typed": a clip rectangle grows over the text
          const id = `c${sc.si}_${r.row}`;
          const typeEnd = r.at + 0.3 + (r.text.length - 2) * 0.03;
          return `<clipPath id="${id}"><rect x="${PAD}" y="${y - 15}" height="${LH}" width="0"><animate attributeName="width" values="0;0;${W};${W};0;0" keyTimes="0;${k(r.at)};${k(typeEnd)};${k(sc.end)};${k(sc.end + 0.01)};1" dur="${T.toFixed(1)}s" repeatCount="indefinite"/></rect></clipPath><text x="${PAD}" y="${y}" class="cmd" clip-path="url(#${id})" xml:space="preserve">${esc(r.text)}</text>`;
        })
        .join("\n");
      return `${head}\n${lines}`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A real SAF run: set up a project, a card whose first verify fails (failing test, file outside the card), then passes with evidence">
<title>SAF demo — generated by scripts/demo.mjs from a real run</title>
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:13.5px;fill:#c9d1d9}
.cmd{fill:#7ee787;font-weight:600}.bad{fill:#ff7b72}.good{fill:#56d364}.dim{fill:#8b949e}.warn{fill:#d29922}.title{fill:#8b949e;font-size:12.5px}
</style>
<rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
<rect width="${W}" height="36" rx="10" fill="#161b22"/><rect y="26" width="${W}" height="10" fill="#161b22"/>
<circle cx="22" cy="18" r="6" fill="#ff5f56"/><circle cx="42" cy="18" r="6" fill="#ffbd2e"/><circle cx="62" cy="18" r="6" fill="#27c93f"/>
<text x="84" y="22" class="title">~/todo</text>
${body}
</svg>
`;
}

function classOf(line) {
  if (/^\s*! /.test(line)) return "warn";
  if (/fail|✗|✖|not ok|outside|refus|error/i.test(line)) return "bad";
  if (/passed|✓|✔|^ok |done/i.test(line)) return "good";
  if (/^\s{2,}|^#/.test(line)) return "dim";
  return "out";
}
