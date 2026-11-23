import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { dirname, join } from "node:path";
import { commonGitDir } from "./git.mjs";
import { IS_WINDOWS, quoteWindowsArg } from "./run.mjs";

/**
 * Measure lock — heavy commands (e2e · perf · full test suites · load bots) run one at a time on this machine,
 * across every worktree of the repo. Rows with `idle: true` also wait until the machine is quiet.
 *
 *   measure <name> -- <command…>   queue → (wait for idle) → run → pass the exit code through
 *   measure --status               read only: who holds the lock, for how long, waiting or measuring, load now
 *
 * Exit 75 = could not get the lock (or a quiet machine) within workflow.measure.waitMs — nothing was measured, run again later.
 * Exit 2 = usage error / unknown name. There is no flag or env that skips the lock.
 */

export const EXIT_REFUSED = 2;
export const EXIT_BUSY = 75;
export const TOKEN_ENV = "SAF_MEASURE_TOKEN";

export const lockPathFor = (root) => join(commonGitDir(root), "saf", "measure.lock");

export function readLock(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const info = JSON.parse(raw);
    return Number.isInteger(info.pid) && typeof info.token === "string" ? info : { pid: 0, token: "", broken: true };
  } catch (e) {
    return e?.code === "ENOENT" ? null : { pid: 0, token: "", broken: true };
  }
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

function tryAcquire(path, info) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${info.token}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(info)}\n`);
  try {
    linkSync(tmp, path);
    return true;
  } catch (e) {
    if (e?.code === "EEXIST") return false;
    throw e;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // gone
    }
  }
}

function update(path, info) {
  writeFileSync(`${path}.${info.token}.tmp`, `${JSON.stringify(info)}\n`);
  try {
    if (readLock(path)?.token === info.token) writeFileSync(path, `${JSON.stringify(info)}\n`);
  } finally {
    try {
      unlinkSync(`${path}.${info.token}.tmp`);
    } catch {
      // gone
    }
  }
}

export function releaseLock(path, token) {
  if (readLock(path)?.token === token) unlinkSync(path);
}

export const loadPerCore = () => loadavg()[0] / Math.max(1, cpus().length);

export function measureStatus(path, now = Date.now()) {
  const l = readLock(path);
  const load = `load ${loadPerCore().toFixed(2)} per core`;
  if (!l) return `free · ${load}`;
  if (l.broken) return `lock file is unreadable (${path}) · ${load}`;
  const alive = pidAlive(l.pid);
  const age = Math.round((now - Date.parse(l.startedAt)) / 1000);
  return `${alive ? "held" : "stale (holder gone)"} by pid ${l.pid} · ${l.state} · ${l.name} · ${age}s · ${load}`;
}

/**
 * @param {{root:string, config:object, name:string, argv:string[], log?:(s:string)=>void, sleep?:(ms:number)=>Promise<void>, now?:()=>number, load?:()=>number, spawnChild?:Function, env?:object}} o
 */
export async function runMeasured(o) {
  const log = o.log ?? ((s) => process.stderr.write(`${s}\n`));
  const env = o.env ?? process.env;
  const m = o.config.workflow.measure;
  const row = m.names[o.name];
  if (!row) {
    log(`[measure] unknown name "${o.name}" — known: ${Object.keys(m.names).join(", ")} (workflow.measure.names)`);
    return EXIT_REFUSED;
  }
  if (!o.argv.length) {
    log("[measure] usage: measure <name> -- <command…>");
    return EXIT_REFUSED;
  }
  const spawnChild =
    o.spawnChild ??
    ((argv, childEnv) =>
      new Promise((resolve) => {
        // one word = a shell line · several = argv; on Windows always through cmd.exe so npm/pnpm .cmd shims resolve
        const child =
          IS_WINDOWS && argv.length > 1
            ? spawn(argv.map(quoteWindowsArg).join(" "), { stdio: "inherit", env: childEnv, cwd: process.cwd(), shell: true, windowsHide: true })
            : spawn(argv[0], argv.slice(1), { stdio: "inherit", env: childEnv, cwd: process.cwd(), shell: argv.length === 1 });
        const forward = (sig) => child.kill(sig);
        process.on("SIGINT", forward);
        process.on("SIGTERM", forward);
        child.on("close", (code, sig) => {
          process.off("SIGINT", forward);
          process.off("SIGTERM", forward);
          resolve(code ?? (sig ? 128 : 1));
        });
        child.on("error", () => resolve(127));
      }));
  const path = lockPathFor(o.root);
  const held = readLock(path);
  if (held && env[TOKEN_ENV] && held.token === env[TOKEN_ENV]) return spawnChild(o.argv, env); // nested call under the same lock
  if (!m.enabled) return spawnChild(o.argv, env);
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const load = o.load ?? loadPerCore;
  const deadline = now() + m.waitMs;
  const info = { pid: process.pid, token: randomBytes(8).toString("hex"), name: o.name, cmd: o.argv.join(" ").slice(0, 200), state: "waiting", startedAt: new Date(now()).toISOString() };
  let said = false;
  for (;;) {
    if (tryAcquire(path, info)) break;
    const cur = readLock(path);
    if (cur && (cur.broken || !pidAlive(cur.pid))) {
      try {
        if (JSON.stringify(readLock(path)) === JSON.stringify(cur)) unlinkSync(path);
      } catch {
        // someone else cleared it
      }
      continue;
    }
    if (now() >= deadline) {
      log(`[measure] not measured — lock still held after ${Math.round(m.waitMs / 1000)}s (${measureStatus(path)}) · exit ${EXIT_BUSY}: run again later`);
      return EXIT_BUSY;
    }
    if (!said) {
      log(`[measure] waiting for the lock — ${measureStatus(path)}`);
      said = true;
    }
    await sleep(2000);
  }
  const release = () => releaseLock(path, info.token);
  process.once("exit", release);
  try {
    if (row.idle) {
      let told = false;
      while (load() > m.maxLoadPerCore) {
        if (now() >= deadline) {
          log(`[measure] not measured — machine never got quiet (load ${load().toFixed(2)} per core > ${m.maxLoadPerCore}) · exit ${EXIT_BUSY}`);
          return EXIT_BUSY;
        }
        if (!told) log(`[measure] waiting for a quiet machine (load ${load().toFixed(2)} per core > ${m.maxLoadPerCore})`);
        told = true;
        await sleep(2000);
      }
    }
    update(path, { ...info, state: "measuring" });
    log(`[measure] ${o.name}: running ${info.cmd}`);
    return await spawnChild(o.argv, { ...env, [TOKEN_ENV]: info.token });
  } finally {
    release();
    process.off("exit", release);
  }
}

export const lockExists = (root) => existsSync(lockPathFor(root));
